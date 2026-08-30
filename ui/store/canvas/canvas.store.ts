import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { TableHint } from '../client';
import { Session } from '../session';
import {
  CanvasFrameNode,
  CanvasGraph,
  CanvasTableNode,
  PENDING_CHECKPOINT_FRAME_ID,
  PickerAnchor,
  PickerItem,
  PickerRequest,
  PickerState,
  START_NODE_ID,
} from './canvas.model';
import { buildCanvasGraph } from './layout';
import {
  currentCheckpointName,
  hasTrailingCheckpoint,
  makeAlias,
  segmentsFromAst,
  splitAtCheckpoint,
  toText,
} from './pine-text';
import * as actions from './pine-actions';
import { probeBuild } from './probe';

const hasMultipleBlocks = (expression: string): boolean => /\n\s*\n/.test(expression.trim());

/** Identifies a picker request for the "already open for this" check below - table has no alias to key on. */
const requestKey = (r: PickerRequest): string => (r.kind === 'table' ? 'table' : `${r.kind}:${r.alias}`);

const emptyGraph: CanvasGraph = { nodes: [], edges: [], parsing: true, singleBlock: true };

/**
 * One per session, mirroring how `session.graph` (store/graph.util.ts) works
 * for the existing graph - except here `canvasGraph` is recomputed from
 * `session.ast`/`session.expression` via a reaction rather than a getter,
 * since committing a gesture needs to synchronously write another observable
 * (session.expression) and MobX computed values may not have side effects.
 *
 * The single source of truth is still `session.expression` - every commit*
 * method below ends by assigning it, and the reaction below is what turns
 * that back into `canvasGraph` once the session's own debounced build
 * finishes. Nothing here talks to the pine-lang server except through that
 * one path plus the read-only probeBuild used for picker options.
 */
export class CanvasStore {
  positions: Record<string, { x: number; y: number }> = {};
  picker: PickerState = { open: false };
  canvasGraph: CanvasGraph = emptyGraph;
  /** Aliases of the currently box/shift-selected table nodes - see Canvas.tsx's onSelectionChange. */
  selectedAliases: string[] = [];
  // Keyboard "cursor" for the modal (vim-style) navigation/shortcut layer -
  // shown in the UI as "current" (TableNode.tsx/StartNode.tsx's thick
  // border/bg), the same treatment the AST's own semantic cursor
  // (`ast.current` - where an unprefixed gesture attaches, see
  // buildProbeExpression's focusPrefix) used to drive by itself. They're
  // deliberately unified visually, but this field never writes `ast.current`
  // directly - navigating is free (no build round-trip, no undo-stack entry)
  // and only becomes real if a later commit on a non-current alias emits a
  // `from:` prefix (see commitJoin's fromAlias, keyed off exactly this same
  // "alias !== ast.current" check). Independent of `selectedAliases` (mouse
  // box-select, for MultiSelectToolbar's bulk actions) - this is pure UI
  // state, read back only to supply the same `alias` parameter the mouse
  // already passes to openColumnPicker/openJoinPicker. Never read directly -
  // see the `focusedAlias` getter below, which is what stays valid across
  // graph changes.
  private _focusedAlias: string | null = null;
  private pickerSeq = 0;
  // Shares one in-flight checkpoint-naming commit across concurrent
  // callers (recompute's own background auto-pin, and a picker open that
  // lands before that resolves) - see ensureCheckpointPinnedShared.
  private checkpointPinInFlight: Promise<string | null> | null = null;
  // Undo/redo: plain expression-text snapshots, not a replayable action log -
  // every gesture already reduces to a deterministic old-text -> new-text
  // transition (applyExpression is the one place that happens), so there's
  // nothing to replay or reconstruct. Hand-typed edits never go through
  // applyExpression (they write session.expression directly from PineInput),
  // so they're deliberately excluded from this history by construction, not
  // by an extra check here - a decision made explicitly rather than assumed.
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  // Serializes commit() calls (see commit/runCommit below) - without this,
  // two gestures fired in quick succession (e.g. two picks in the same
  // still-open multi-select picker) both compute their mutation against the
  // same starting text and the second's result silently overwrites the
  // first's.
  private commitChain: Promise<void> = Promise.resolve();

  // Public (not private, unlike the other fields above) - CanvasToolbar.tsx
  // needs it to call global.togglePinePanel/toggleSqlPanel(session), which
  // take a Session rather than a CanvasStore.
  readonly session: Session;

  /**
   * True until this session has ever produced a build response - `ast` only
   * ever reverts to the literal `null` primitive when no build has completed
   * yet (a genuine parse failure still returns a real `ast` object, just
   * with `ranges`/`selected-tables` null inside it - see recompute's own
   * `!ast || !ast['selected-tables'] || !ast.ranges` check). Distinguishes
   * "still connecting/loading" from "genuinely not parsing" for the same
   * `!canvasGraph.parsing` state Canvas.tsx already renders a banner for -
   * without this, a restored session's brief window before its first build
   * completes (see global.store.ts's restoreSessions) showed the same
   * alarming "Not parsing" banner a real syntax error would.
   */
  get isConnecting(): boolean {
    return this.session.ast === null;
  }

  /**
   * Derived, never stored: a separately-tracked mode flag would desync from
   * reality the moment a picker closes some way other than a direct
   * `closePicker()` call (e.g. Picker.tsx's own click-outside/Escape
   * listeners) - a stuck "insert" flag would silently kill every normal-
   * mode keybinding. `mode` always reflects the one thing that actually
   * gates typing right now: whether a picker (list or where-value) is open.
   */
  get mode(): 'normal' | 'insert' {
    return this.picker.open ? 'insert' : 'normal';
  }

  /**
   * Every keyboard-navigable stop, in pipeline order - table nodes plus
   * frame/checkpoint nodes, interleaved into one sequence. A frame has no
   * `data.order` of its own (it's a decoration, not a pipeline slot - see
   * layout.ts's makeFrameNode), so it sorts by `memberOrder + 0.5`: right
   * after the last table it wraps, but still before whatever table comes
   * next in the pipeline (which starts at the next whole integer). The
   * empty-graph Start node is the sole target when nothing exists yet,
   * matching Canvas.tsx's own `derivedNodes` swap.
   */
  private get orderedFocusTargets(): string[] {
    const tableNodes = this.canvasGraph.nodes.filter(
      (n): n is CanvasTableNode => n.type === 'table-node',
    );
    const frameNodes = this.canvasGraph.nodes.filter(
      (n): n is CanvasFrameNode => n.type === 'frame-node',
    );
    if (tableNodes.length === 0 && frameNodes.length === 0) return [START_NODE_ID];
    const stops = [
      ...tableNodes.map(n => ({ id: n.id, sortKey: n.data.order })),
      ...frameNodes.map(n => ({ id: n.id, sortKey: n.data.memberOrder + 0.5 })),
    ];
    return stops.sort((a, b) => a.sortKey - b.sortKey).map(s => s.id);
  }

  /**
   * The effective keyboard focus - always a currently-valid target, never
   * null. Falls back (without writing `_focusedAlias`, so this stays a pure
   * computed read) to the AST's own current node, then to the first target,
   * whenever the stored alias no longer exists (first mount, or a node that
   * disappeared some way other than through focusNext/focusPrev/deleteNode's
   * own bookkeeping below).
   */
  get focusedAlias(): string {
    const targets = this.orderedFocusTargets;
    if (this._focusedAlias && targets.includes(this._focusedAlias)) return this._focusedAlias;
    const current = this.session.ast?.current;
    if (current && targets.includes(current)) return current;
    return targets[0];
  }

  focusNode(alias: string) {
    this._focusedAlias = alias;
  }

  /** Next-higher `data.order` (ArrowDown/j) - wraps from the last node back to the first. */
  focusNext() {
    const targets = this.orderedFocusTargets;
    const idx = targets.indexOf(this.focusedAlias);
    this.focusNode(targets[(idx + 1) % targets.length]);
  }

  /** Next-lower `data.order` (ArrowUp/k) - wraps from the first node back to the last. */
  focusPrev() {
    const targets = this.orderedFocusTargets;
    const idx = targets.indexOf(this.focusedAlias);
    this.focusNode(targets[(idx - 1 + targets.length) % targets.length]);
  }

  /**
   * The real, pinned alias `frameId` currently represents in the AST - a
   * no-op for anything except `PENDING_CHECKPOINT_FRAME_ID` (a consumed
   * checkpoint's frame id already IS its real alias - see canvas.model.ts).
   * FrameNode.tsx needs this wherever it compares itself against
   * `this.picker`'s own alias (openCheckpointPicker always opens the picker
   * keyed by the checkpoint's real name, never by the pending frame's
   * placeholder id) - comparing the placeholder id directly against
   * `picker.request.alias` silently never matches, which is exactly why the
   * frame's insert-mode decluttering never engaged (confirmed live).
   * Doesn't itself pin anything - returns the placeholder id unchanged if
   * no name exists yet, same as `openCheckpointPicker` falling back to
   * `ensureCheckpointPinnedShared` only when it actually needs one.
   */
  resolveFrameAlias(frameId: string): string {
    if (frameId !== PENDING_CHECKPOINT_FRAME_ID) return frameId;
    const segments = segmentsFromAst(this.session.expression, this.session.ast) ?? [];
    return currentCheckpointName(segments) ?? frameId;
  }

  constructor(session: Session) {
    this.session = session;
    makeAutoObservable<CanvasStore, 'session'>(this, { session: false });
    this.recompute();
  }

  /**
   * Sets up the expression/ast -> canvasGraph reaction. Deliberately not
   * done in the constructor: React 18 StrictMode (on in this app's
   * next.config.js) double-invokes effects in dev - mount, simulated
   * unmount, remount - specifically to catch missing cleanup. A reaction
   * subscribed in the constructor and only ever disposed from a `useEffect`
   * cleanup gets killed by that simulated unmount with nothing to
   * re-subscribe it on the following remount, silently freezing the canvas
   * on whatever it last rendered. Subscribing here, called from the same
   * `useEffect` that disposes it (see components/canvas/Canvas.tsx), keeps
   * the two symmetric so the double-invoke cancels itself out.
   *
   * `fireImmediately: true` - a restored session (one loaded with an
   * expression already set, e.g. from localStorage) already has its build
   * ticking via `Session`'s own debounced reaction (store/session.ts) *before*
   * this component/store even exists - that reaction started at module-eval
   * time, well before React mounts. Whether `session.ast` flips from null to
   * populated *before or after* this `start()` call (a real, effect-timing-
   * dependent race, not a hypothetical) determined whether the graph ever
   * rendered: this constructor's own `recompute()` runs at render time and
   * can catch a null `ast`, but a plain `reaction()` only fires on a change
   * *after* subscribing - if the transition already happened by the time
   * `start()` subscribes, the reaction's baseline is the post-transition
   * value and it never fires again, leaving the canvas stuck on the empty/
   * degraded graph it computed at construction until the user's next edit.
   * `fireImmediately` makes this call itself always resync to whatever is
   * actually current the moment it subscribes, independent of that race.
   */
  start(): () => void {
    return reaction(
      () => [this.session.expression, this.session.ast] as const,
      () => this.recompute(),
      { fireImmediately: true },
    );
  }

  private recompute() {
    const { expression, ast } = this.session;
    const singleBlock = !hasMultipleBlocks(expression);
    if (!singleBlock) {
      this.canvasGraph = { ...this.canvasGraph, singleBlock: false };
      return;
    }
    if (expression.trim() === '') {
      // A brand-new session has never run a build (session.ast starts null
      // and there's no fireImmediately reaction to populate it for an empty
      // expression - see store/session.ts) - that's not a parse failure,
      // it's the legitimate "nothing picked yet" state.
      this.canvasGraph = emptyGraph;
      return;
    }
    if (!ast || !ast['selected-tables'] || !ast.ranges) {
      // Degrade: keep the last good graph on screen (dimmed by the UI layer
      // via `parsing: false`) rather than blanking out mid-edit.
      this.canvasGraph = { ...this.canvasGraph, parsing: false, singleBlock: true };
      return;
    }
    // Purely a text-structure check (see hasTrailingCheckpoint's own
    // comment) - not derived from ast['pending-assignments'], which only
    // populates once the checkpoint has a name, missing exactly the "just
    // grouped, nothing composed on top yet" moment this needs to catch.
    const segments = segmentsFromAst(expression, ast) ?? [];
    const hasCheckpoint = hasTrailingCheckpoint(segments);
    // Pin the checkpoint's name proactively, in the background, the moment
    // it appears unnamed - not waiting for the user's first click on a
    // frame action. Found live: without this, the *first* click on select/
    // where/order paid for the full pin round trip with zero visual
    // feedback while it was in flight (the picker only shows its own
    // loading state once opened, which happens *after* pinning resolves),
    // reading as "nothing happened" on click 1 and "now it works" on
    // click 2. By the time a user actually clicks, this has usually
    // already resolved, so openCheckpointPicker's fast path applies from
    // the first click too. ensureCheckpointPinnedShared dedupes against a
    // click landing before this resolves, so the two never race into two
    // redundant commits.
    if (hasCheckpoint && !currentCheckpointName(segments) && !this.checkpointPinInFlight) {
      void this.ensureCheckpointPinnedShared();
    }
    this.canvasGraph = buildCanvasGraph(ast, this.positions, hasCheckpoint);
  }

  setNodePosition(id: string, position: { x: number; y: number }) {
    this.positions[id] = position;
  }

  setSelectedAliases(aliases: string[]) {
    this.selectedAliases = aliases;
  }

  private applyExpression(expression: string, options?: { skipAutoRun?: boolean }) {
    // A no-op gesture (e.g. deleteNode/setLimit returning the same text)
    // shouldn't push a snapshot that's identical to what undo would already
    // land on - it would just be a wasted step, never a wrong one, but it's
    // free to skip.
    if (expression === this.session.expression) return;
    this.undoStack.push(this.session.expression);
    this.redoStack = [];
    this.session.expression = expression;
    if (!options?.skipAutoRun) this.notifyAutoRun();
  }

  /**
   * Every write site that lands a new expression confirmed valid at the
   * time it was probed (applyExpression, undo, redo) funnels through here
   * so auto-run sees canvas-originated changes exactly once, regardless of
   * which gesture produced them. `applyExpression`'s `skipAutoRun` option
   * is the one deliberate exception - see runCommit's own comment.
   */
  private notifyAutoRun() {
    this.session.notifyCanvasCommit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Restores the previous snapshot. Closes any open picker and clears the
   * multi-select and keyboard focus - all three can hold onto a node alias
   * (picker.request.alias, selectedAliases, _focusedAlias) that this undo
   * may make stale (e.g. undoing past the gesture that pinned/created that
   * alias), the same class of staleness `runCommit`'s aliasMap-rename
   * handling exists for, just with no rename to follow this time since the
   * alias may no longer exist at all. Clearing `_focusedAlias` rather than
   * leaving it dangling matters here specifically: the `focusedAlias`
   * getter's fallback only fires when the stored alias is *absent* from the
   * new graph - if undo happens to land on a graph that coincidentally
   * still has an alias of that same name (a different table entirely), the
   * stale value would silently look valid.
   */
  undo() {
    if (this.undoStack.length === 0) return;
    const previous = this.undoStack.pop() as string;
    this.redoStack.push(this.session.expression);
    this.closePicker();
    this.selectedAliases = [];
    this._focusedAlias = null;
    this.session.expression = previous;
    this.notifyAutoRun();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop() as string;
    this.undoStack.push(this.session.expression);
    this.closePicker();
    this.selectedAliases = [];
    this._focusedAlias = null;
    this.session.expression = next;
    this.notifyAutoRun();
  }

  private async pinnedBase(): Promise<actions.PinnedBase | null> {
    const expression = this.session.expression;
    // Not `this.session.ast` - it's kept up to date by the session's own,
    // separately-debounced build and can still describe the *previous*
    // expression for a moment right after a commit applies a new one (e.g.
    // the instant between two rapid picks in the same still-open picker).
    // ensureExplicitAliases slices `expression` using the ast's range
    // offsets, so handing it a mismatched pair doesn't just fail to parse -
    // it silently slices the wrong substrings of an unrelated-length string
    // (confirmed live: two rapid picks turned "case_ref as cr" into "cas as
    // cr"). A fresh probe on the exact current expression guarantees the
    // pair this base is built from actually matches.
    const ast = await probeBuild(expression, this.session.connectionId);
    return actions.getPinnedBase(expression, ast, this.session.connectionId);
  }

  private async commit(fn: (base: actions.PinnedBase) => string | null): Promise<void> {
    // Serialized: chain onto whatever's already pending so a second commit
    // never starts computing its mutation until the first one has fully
    // applied - see commitChain's declaration and runCommit below.
    const run = this.commitChain.then(() => this.runCommit(fn));
    this.commitChain = run.catch(() => undefined);
    await run;
  }

  private async runCommit(fn: (base: actions.PinnedBase) => string | null): Promise<void> {
    const base = await this.pinnedBase();
    if (!base) return;
    const next = fn(base);
    if (next !== null) {
      // Every /build response carries a `prettified` (multi-line) rendering
      // of the expression for free - the old text editor only applies it
      // when the user types a `|` (see PineInput.tsx's onPipe), a path
      // canvas gestures never go through, so without this every gesture
      // would keep piling onto one single-line expression. One extra probe
      // on top of pinnedBase's, since `next` doesn't have a matching ast
      // until something builds it.
      //
      // `ast` itself (not just `.prettified`) can come back undefined here -
      // confirmed live: a `next` referencing an alias that no longer exists
      // (deleteNode's deliberately-dangling `from:` - see pine-text.ts's
      // removeNode) gets a build response with no ast at all, not just a
      // degraded one, and this crashed the whole app on `ast.prettified`
      // before the `?.` was added. Falling back to the unprettified `next`
      // here is exactly right either way: the point of this splice was to
      // fail visibly (an unresolved edge, or "Not parsing"), not to succeed
      // with nicer formatting.
      let probedOk = true;
      const prettified = await probeBuild(next, this.session.connectionId).then(
        ast => {
          if (!ast) probedOk = false;
          return ast?.prettified || next;
        },
        () => {
          probedOk = false;
          return next;
        },
      );
      runInAction(() => {
        // Skip auto-run for this specific commit when the probe just
        // confirmed it doesn't actually build (deleteNode's deliberately
        // dangling from: - see pine-text.ts's removeNode) - auto-run
        // exists to run known-valid canvas commits immediately, and firing
        // it anyway here would send a guaranteed-to-fail /eval for
        // something the canvas itself is about to show as "Not parsing".
        this.applyExpression(prettified, { skipAutoRun: !probedOk });
        // The select/where/order pickers stay open across multiple picks
        // (see toggleSelectColumn) with `request.alias` frozen from when
        // they were opened. If *this* commit is the one that pinned that
        // same node's alias, the picker is left holding the now-dangling
        // pre-pin alias - the next pick would read/write against an alias
        // no segment owns (see PinnedBase's aliasMap comment). Follow the
        // same rename here so a still-open picker keeps working.
        if (this.picker.open && this.picker.mode === 'list' && 'alias' in this.picker.request) {
          const renamed = base.aliasMap.get(this.picker.request.alias);
          if (renamed) {
            this.picker = { ...this.picker, request: { ...this.picker.request, alias: renamed } };
          }
        }
      });
    }
  }

  // --- pickers -------------------------------------------------------

  closePicker() {
    this.picker = { open: false };
  }

  setPickerFilter(filter: string) {
    if (this.picker.open && this.picker.mode === 'list') {
      this.picker = { ...this.picker, filter };
    }
  }

  /** Fallback anchor for a picker opened without a captured click position. */
  private static readonly defaultAnchor: PickerAnchor = { x: 24, y: 24 };

  private buildProbeExpression(request: PickerRequest): string {
    if (request.kind === 'table') return '';
    const segments = segmentsFromAst(this.session.expression, this.session.ast) ?? [];
    // Targeting the checkpoint itself (the frame's own select/where/order -
    // see openCheckpointPicker) is the one case that needs the checkpoint
    // KEPT in the probe base, not stripped - `from: <checkpointName>` only
    // resolves to anything if the group:/limit:/= name run it names is
    // still there (confirmed live). Every other gesture targets a table
    // that exists *before* the checkpoint, so the checkpoint must be
    // dropped instead - a hint probe built *after* one reflects the sealed
    // output's shape (just the grouped columns, plus aggregate function
    // names), not the actual table the gesture is about. Confirmed live:
    // grouping on one node, then opening group on a *different* node,
    // offered only the first node's already-grouped column and "count" -
    // the post-checkpoint shape, not the second node's real columns. See
    // splitAtCheckpoint (pine-text.ts) - the same helper also fixes
    // appendTableSegment, which had the identical issue committing a join
    // after a group/limit instead of before it.
    const isCheckpointTarget = 'alias' in request && request.alias === currentCheckpointName(segments);
    const { before } = splitAtCheckpoint(segments);
    let relevant = isCheckpointTarget ? segments : before;
    // Group reuses select's hint category, per the comment below - but
    // hints.select deliberately excludes columns already in that alias's
    // OWN select: (a sensible exclusion for select's own "what else could
    // I add" question - wrong for group, where a column already selected
    // is still completely valid to group by too). Confirmed live: with
    // `select: c.name` already present, hints.select drops "name" from a
    // 35-column list down to 34. Stripping that alias's own select:
    // segment before probing (for the group case only) restores the full
    // list, since the probe then looks exactly like nothing was selected.
    if (request.kind === 'group') {
      relevant = relevant.filter(s => !(s.owner === request.alias && s.kind === 'select'));
    }
    const base = (relevant.length ? toText(relevant) : this.session.expression).replace(/\|\s*$/, '').trimEnd();
    const current = this.session.ast?.current;
    const focusPrefix = request.alias !== current ? `${base} | from: ${request.alias}` : base;
    // pine-lang has no dedicated hint category for group-by candidates (see
    // pine-actions.ts's getGroupColumns/setGroupColumns comment) - reuse
    // select's, since "which columns exist on this table" is exactly the
    // same question either way.
    const opPrefix =
      request.kind === 'join'
        ? ''
        : `${request.kind === 'where' ? 'w' : request.kind === 'order' ? 'o' : 's'}: `;
    return `${focusPrefix} | ${opPrefix}`.trimEnd();
  }

  private async openListPicker(
    request: PickerRequest,
    anchor: PickerAnchor,
    load: () => Promise<{ groups: { label: string; items: PickerItem[] }[] }>,
  ) {
    // Re-clicking the action button that's already open shouldn't reopen
    // it - that meant a redundant probeBuild round-trip and, worse, the
    // anchor snapping to wherever on the button this particular click
    // landed (confirmed live: clicking the same "select" button twice made
    // the dropdown visibly jump). A picker already open for the same
    // request just stays exactly as it is.
    if (this.picker.open && this.picker.mode === 'list' && requestKey(this.picker.request) === requestKey(request)) {
      return;
    }

    // Staleness is tracked by a plain counter, not by comparing `request`
    // against `this.picker.request` - MobX deep-observes objects assigned to
    // an observable field, so reading `this.picker.request` back gives a
    // proxy that never === the original closure variable.
    const seq = ++this.pickerSeq;
    this.picker = { open: true, mode: 'list', request, anchor, loading: true, groups: [], filter: '' };
    try {
      const { groups } = await load();
      // pine-lang's hints can legitimately list the same join fragment twice
      // under different underlying FK columns (confirmed live: two distinct
      // `screening.case` hints both serialize to the identical `pine`
      // string) - harmless for canvas since every join concatenates
      // `hint.pine` verbatim, so either produces byte-identical text, but
      // rendering both crashes React's key uniqueness and silently drops
      // one row. Dedupe by id (== the value actually written to the text).
      const deduped = groups.map(g => ({
        ...g,
        items: Array.from(new Map(g.items.map(i => [i.id, i])).values()),
      }));
      runInAction(() => {
        if (this.pickerSeq === seq && this.picker.open && this.picker.mode === 'list') {
          this.picker = { ...this.picker, loading: false, groups: deduped };
        }
      });
    } catch (e) {
      runInAction(() => {
        if (this.pickerSeq === seq && this.picker.open && this.picker.mode === 'list') {
          this.picker = { ...this.picker, loading: false, error: e instanceof Error ? e.message : String(e) };
        }
      });
    }
  }

  openTablePicker(anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    const request: PickerRequest = { kind: 'table' };
    void this.openListPicker(request, anchor, async () => {
      const ast = await probeBuild('', this.session.connectionId);
      if (!ast) throw new Error('Failed to build table suggestions');
      const items: PickerItem[] = ast.hints.table.map(h => ({
        id: h.pine,
        label: h.table,
        detail: h.schema ?? undefined,
        value: h.pine,
      }));
      return { groups: [{ label: '', items }] };
    });
  }

  openJoinPicker(alias: string, anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    const request: PickerRequest = { kind: 'join', alias };
    void this.openListPicker(request, anchor, async () => {
      const expr = this.buildProbeExpression(request);
      const ast = await probeBuild(expr, this.session.connectionId);
      if (!ast) throw new Error('Failed to build join suggestions');
      const has = ast.hints.table.filter(h => !h.parent);
      const belongsTo = ast.hints.table.filter(h => h.parent);
      // Two hints in the same group can legitimately name the same table
      // reached via two different FK columns (e.g. `cases` has separate
      // `created_by`/`approved_by` columns both pointing at `users`) -- with
      // nothing but the table name shown, those rows would be visually
      // identical and the user couldn't tell which one they were picking.
      // Only THOSE rows earn a column hint; a table with a single candidate
      // path stays exactly as clean as before. Counted on the same set
      // openListPicker's own dedup (by `pine` text) would leave behind, so a
      // pair that collapses into one row downstream never spuriously earns a
      // hint neither survivor needs.
      const toItems = (hints: TableHint[]): PickerItem[] => {
        const tableKey = (h: TableHint) => `${h.schema ?? ''}.${h.table}`;
        const dedupedByPine = Array.from(new Map(hints.map(h => [h.pine, h])).values());
        const counts = new Map<string, number>();
        dedupedByPine.forEach(h => counts.set(tableKey(h), (counts.get(tableKey(h)) ?? 0) + 1));
        return hints.map(h => ({
          id: h.pine,
          label: h.table,
          detail: h.schema ?? undefined,
          value: h.pine,
          columnHint: (counts.get(tableKey(h)) ?? 0) > 1 ? h.column : undefined,
        }));
      };
      return {
        groups: [
          { label: 'has', items: toItems(has) },
          { label: 'belongs to', items: toItems(belongsTo) },
        ].filter(g => g.items.length > 0),
      };
    });
  }

  openColumnPicker(
    kind: 'select' | 'where' | 'order' | 'group',
    alias: string,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
  ) {
    const request: PickerRequest = { kind, alias };
    void this.openListPicker(request, anchor, async () => {
      const expr = this.buildProbeExpression(request);
      const ast = await probeBuild(expr, this.session.connectionId);
      if (!ast) throw new Error('Failed to build column suggestions');
      // No dedicated hint category for group - see buildProbeExpression's
      // matching comment; reuses select's.
      const hints = kind === 'where' ? ast.hints.where : kind === 'order' ? ast.hints.order : ast.hints.select;
      const items: PickerItem[] = hints.map(h => ({ id: h.column, label: h.column, value: h.column }));
      return { groups: [{ label: '', items }] };
    });
  }

  // --- commits ---------------------------------------------------------

  commitFirstTable(hint: TableHint) {
    const alias = makeAlias(hint.table, new Set());
    this.applyExpression(actions.pickFirstTable(hint, alias));
    this.closePicker();
    // Cursor lands on what was just inserted - the vim convention this
    // keyboard layer follows throughout (see commitJoin below).
    this.focusNode(alias);
  }

  async commitJoin(hint: TableHint, focusAlias: string) {
    // Captured inside the commit callback (the alias isn't known until
    // `used` - the current segment set - is computed against the pinned
    // base) and read back once the commit resolves, so keyboard focus can
    // land on the node this call actually created.
    let createdAlias: string | undefined;
    await this.commit(base => {
      // Not `base.ast['selected-tables']` - the table currently being typed
      // is excluded from it (see the comment on currentInProgressTable in
      // layout.ts), which would otherwise let a new join's generated alias
      // collide with the very table just picked. Segment owners are always
      // correct here since canvas-generated table segments always carry an
      // explicit alias.
      const used = new Set(
        base.segments.filter(s => s.kind === 'table' && s.owner).map(s => s.owner as string),
      );
      const alias = makeAlias(hint.table, used);
      createdAlias = alias;
      // focusAlias was read off the node before this base was computed -
      // if it was the in-progress table, pinning may have just renamed it
      // (see PinnedBase's aliasMap comment).
      const resolvedFocus = actions.resolveAlias(base, focusAlias);
      const fromAlias = resolvedFocus !== base.ast.current ? resolvedFocus : undefined;
      return actions.join(base, hint, alias, fromAlias);
    });
    this.closePicker();
    if (createdAlias) this.focusNode(createdAlias);
  }

  async commitSelectColumns(alias: string, columns: string[]) {
    await this.commit(base => actions.setSelectColumns(base, actions.resolveAlias(base, alias), columns));
  }

  /**
   * Toggles one column in/out of `alias`'s select list; picker stays open
   * for multi-select. The current set is read from `base.segments` *inside*
   * the commit, not from the rendered `canvasGraph` - the latter only
   * catches up once the session's own (separately debounced) build
   * round-trips, which hasn't necessarily happened yet for a second rapid
   * pick in the same still-open picker (confirmed live: reading it here
   * silently dropped the first pick's column every time).
   */
  async toggleSelectColumn(alias: string, column: string) {
    await this.commit(base => {
      const resolvedAlias = actions.resolveAlias(base, alias);
      const current = actions.getSelectColumns(base, resolvedAlias);
      const next = current.includes(column) ? current.filter(c => c !== column) : [...current, column];
      return actions.setSelectColumns(base, resolvedAlias, next);
    });
  }

  /** Column chosen from the where picker's list - switch to entering an operator/value, same anchor. */
  beginWhereValue(alias: string, column: string) {
    const anchor = this.picker.open ? this.picker.anchor : CanvasStore.defaultAnchor;
    this.picker = { open: true, mode: 'where-value', alias, column, operator: '=', value: '', anchor };
  }

  setWhereOperator(operator: string) {
    if (this.picker.open && this.picker.mode === 'where-value') this.picker = { ...this.picker, operator };
  }

  setWhereValue(value: string) {
    if (this.picker.open && this.picker.mode === 'where-value') this.picker = { ...this.picker, value };
  }

  async submitWhereValue() {
    if (!this.picker.open || this.picker.mode !== 'where-value' || !this.picker.value.trim()) return;
    const { alias, column, operator, value } = this.picker;
    await this.commitWhere(alias, column, operator, value.trim());
  }

  async commitWhere(alias: string, column: string, operator: string, value: string) {
    await this.commit(base => actions.addWhereCondition(base, actions.resolveAlias(base, alias), column, operator, value));
    this.closePicker();
  }

  async removeWhereAt(alias: string, index: number) {
    await this.commit(base => actions.removeWhereConditionAt(base, actions.resolveAlias(base, alias), index));
  }

  /**
   * Toggles one column in/out of `alias`'s order list; picker stays open for
   * repeat picks, same as toggleSelectColumn - see its comment for why the
   * current set is read from `base.segments` inside the commit rather than
   * the rendered canvasGraph.
   */
  async toggleOrderColumn(alias: string, column: string) {
    await this.commit(base => {
      const resolvedAlias = actions.resolveAlias(base, alias);
      const current = actions.getOrderColumns(base, resolvedAlias);
      const index = current.indexOf(column);
      return index >= 0
        ? actions.removeOrderColumnAt(base, resolvedAlias, index)
        : actions.addOrderColumn(base, resolvedAlias, column, 'desc');
    });
  }

  async removeOrderAt(alias: string, index: number) {
    await this.commit(base => actions.removeOrderColumnAt(base, actions.resolveAlias(base, alias), index));
  }

  /**
   * Toggles one column in/out of `alias`'s own contribution to the single,
   * pipeline-wide `group:` segment - see pine-actions.ts's getGroupColumns/
   * setGroupColumns for how that stays merged with every other table's
   * contribution rather than producing a second `group:` segment.
   */
  async toggleGroupColumn(alias: string, column: string) {
    await this.commit(base => {
      const resolvedAlias = actions.resolveAlias(base, alias);
      const current = actions.getGroupColumns(base, resolvedAlias);
      const next = current.includes(column) ? current.filter(c => c !== column) : [...current, column];
      return actions.setGroupColumns(base, resolvedAlias, next);
    });
  }

  /**
   * Callable on any top-level table now, not just the pipeline's tail - see
   * pine-text.ts's removeNode for what happens to a downstream table that
   * implicitly depended on the removed one (nothing special: the server's
   * own join resolution, and the canvas's existing unresolved/uncertain
   * edge styling, already handle whatever that turns out to mean). "The
   * former upstream neighbor" - the previous entry in `orderedFocusTargets`,
   * captured before the commit removes this alias from the graph - is still
   * a reasonable place to land focus regardless of where in the pipeline
   * the deleted node was. Refocuses only if the deleted node was actually
   * the focused one; deleting via the mouse while a *different* node has
   * keyboard focus leaves that focus untouched.
   */
  async deleteNode(alias: string) {
    const wasFocused = this.focusedAlias === alias;
    const targets = this.orderedFocusTargets;
    const idx = targets.indexOf(alias);
    const neighbor = idx > 0 ? targets[idx - 1] : START_NODE_ID;
    await this.commit(base => actions.deleteNode(base, actions.resolveAlias(base, alias)));
    if (wasFocused) this.focusNode(neighbor);
  }

  /**
   * Removes the trailing checkpoint (frame) entirely - `x` on a focused
   * frame, and FrameNode.tsx's own delete button. `frameId` is whichever id
   * that frame is currently focused/rendered under - a pending checkpoint's
   * placeholder or a consumed one's real name, either way irrelevant here
   * since actions.deleteCheckpoint just chops off the trailing
   * group:/limit:/assign run regardless of its name. Refocus mirrors
   * deleteNode's own: land on the former upstream neighbor (the last table
   * the checkpoint wrapped, now a plain node again), only if the frame
   * itself was the focused one.
   */
  async deleteCheckpoint(frameId: string) {
    const wasFocused = this.focusedAlias === frameId;
    const targets = this.orderedFocusTargets;
    const idx = targets.indexOf(frameId);
    const neighbor = idx > 0 ? targets[idx - 1] : START_NODE_ID;
    await this.commit(base => actions.deleteCheckpoint(base));
    if (wasFocused) this.focusNode(neighbor);
  }

  /** `limit:` applies to the whole pipeline, not a specific table - pass null to clear it. */
  async commitLimit(value: number | null) {
    await this.commit(base => actions.setLimit(base, value));
  }

  // --- checkpoint frame ------------------------------------------------

  /**
   * Pins an explicit `|= name` on the trailing checkpoint if it doesn't
   * already have one (see pine-text.ts's ensureExplicitCheckpointName) and
   * returns that name - null if there's no checkpoint at all right now.
   * Goes through the normal commit() pipeline like any other gesture (same
   * serialization, same undo-stack snapshot), even though the mutation
   * itself doesn't change what the query returns - only its name. Called
   * before opening any frame action's picker, since the picker needs a
   * real, referenceable name to probe against.
   */
  async ensureCheckpointPinned(): Promise<string | null> {
    let name: string | null = null;
    await this.commit(base => {
      name = base.checkpointName;
      return base.expression;
    });
    return name;
  }

  /**
   * Shares one in-flight pin commit across concurrent callers - recompute's
   * own background auto-pin (see its comment) and any picker open that
   * arrives before that resolves - so they never race into two redundant
   * commit() round trips for the same pin.
   */
  private ensureCheckpointPinnedShared(): Promise<string | null> {
    if (this.checkpointPinInFlight) return this.checkpointPinInFlight;
    const pending = this.ensureCheckpointPinned().finally(() => {
      if (this.checkpointPinInFlight === pending) this.checkpointPinInFlight = null;
    });
    this.checkpointPinInFlight = pending;
    return pending;
  }

  /**
   * Opens the frame's select/where/order/join picker - reuses
   * openColumnPicker/openJoinPicker entirely, treating the checkpoint's
   * pinned name exactly like a table alias (see buildProbeExpression's
   * checkpoint-aware branch, pine-actions.ts's checkpoint-targeting branch
   * in upsertOwnedSegment, and its targetsCheckpoint branch in
   * appendTableSegment/join for the join case specifically).
   *
   * Fast path: once the checkpoint is already named (true after its first
   * use), there's nothing to pin - skip ensureCheckpointPinned's full
   * commit()/pinnedBase() round trip (a fresh probe plus a "prettify"
   * probe, even for a guaranteed no-op) and read the name straight off the
   * currently-rendered segments instead, which costs nothing (no network
   * call). Found live: every click on a frame action was paying for 2-3
   * sequential round trips before the picker could even open, which read
   * as "nothing happened" on the first click and "now it works" on a
   * second. Committing the actual pick still goes through the full
   * pinning pipeline regardless (see toggleSelectColumn etc.) - this only
   * skips the pre-emptive pin that used to happen just to open the picker.
   */
  async openCheckpointPicker(kind: 'select' | 'where' | 'order' | 'join', anchor: PickerAnchor) {
    const segments = segmentsFromAst(this.session.expression, this.session.ast) ?? [];
    const name = currentCheckpointName(segments) ?? (await this.ensureCheckpointPinnedShared());
    if (!name) return;
    if (kind === 'join') {
      this.openJoinPicker(name, anchor);
      return;
    }
    this.openColumnPicker(kind, name, anchor);
  }
}
