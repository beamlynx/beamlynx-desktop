import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { PathHint, TableHint } from '../client';
import { Session } from '../session';
import {
  CanvasFrameNode,
  CanvasGraph,
  CanvasTableNode,
  ConfigItem,
  JoinType,
  MoreAction,
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
const requestKey = (r: PickerRequest): string =>
  r.kind === 'table' ? 'table' : r.kind === 'path-route' ? `path-route:${r.alias}:${r.target}` : `${r.kind}:${r.alias}`;

const emptyGraph: CanvasGraph = { nodes: [], edges: [], parsing: true, singleBlock: true };

/**
 * One stop in CanvasStore's single flattened navigation sequence (see
 * `flatStops`) - either a node's own bare "just this node" stop, or one of
 * its reconfigurable items. Not exported: nothing outside CanvasStore reads
 * a stop directly - components only ever read `focusedAlias`/
 * `focusedConfigItem`, which are derived from whichever stop the cursor is
 * currently on.
 */
type FocusStop = { kind: 'node'; alias: string } | { kind: 'config'; alias: string; item: ConfigItem };

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
  // One cursor, one flat sequence (see flatStops below) - a node's own bare
  // stop, or one of its reconfigurable items. Up/Down (focusNext/focusPrev)
  // and Left/Right (configNext/configPrev) both just move this same cursor
  // through two different views of the same list: Up/Down skips straight
  // between 'node' stops; Left/Right walks every stop in order, visiting
  // each node's own items before crossing into the next node's. Holds the
  // stop's own identity, not a raw position - select/order/group pickers
  // deliberately stay open across repeat toggles (toggleSelectColumn et al
  // never call closePicker), so a plain index captured before one of those
  // toggles can end up pointing at a totally different item once the list's
  // shape changes (confirmed live, back when node-focus and the config
  // cursor were two separate fields that could drift out of sync with each
  // other).
  private _cursor: FocusStop | null = null;
  private pickerSeq = 0;
  // Shares one in-flight checkpoint-naming commit across concurrent picker
  // opens that land before an earlier one resolves - see
  // ensureCheckpointPinnedShared. Also exposed (read-only) as
  // `checkpointPinning`, for FrameNode.tsx's loading state on the frame
  // action that triggered the pin.
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
   * null. Falls back (without writing `_cursor`, so this stays a pure
   * computed read) to the AST's own current node, then to the first target,
   * whenever the cursor's alias no longer exists (first mount, or a node
   * that disappeared some way other than through focusNext/focusPrev/
   * deleteNode's own bookkeeping below).
   */
  get focusedAlias(): string {
    const targets = this.orderedFocusTargets;
    if (this._cursor && targets.includes(this._cursor.alias)) return this._cursor.alias;
    const current = this.session.ast?.current;
    if (current && targets.includes(current)) return current;
    return targets[0];
  }

  /** Lands the cursor on `alias`'s own bare stop - no config item highlighted. Up/Down (focusNext/focusPrev below) and every mouse click that changes focus go through this. */
  focusNode(alias: string) {
    this._cursor = { kind: 'node', alias };
  }

  /** Whether `alias` has an incoming join whose type is configurable - see CanvasEdge.joinTargetAlias. Its own thing, not one of `configItemsForAlias`' items - see `flatStops`' own comment for why. */
  private hasIncomingJoin(alias: string): boolean {
    return this.canvasGraph.edges.some(e => e.joinTargetAlias === alias);
  }

  /**
   * `alias`'s own reconfigurable items (everything BUT its incoming join -
   * see `hasIncomingJoin`/`flatStops`), in a fixed order matching the
   * action bar's own select/where/order/group buttons: its select columns,
   * its where conditions, its order columns, then its group columns.
   */
  private configItemsForAlias(alias: string): ConfigItem[] {
    const node = this.canvasGraph.nodes.find(
      (n): n is CanvasTableNode => n.type === 'table-node' && n.id === alias,
    );
    const items: ConfigItem[] = [];
    (node?.data.selectColumns ?? []).forEach(column => items.push({ kind: 'select', column }));
    (node?.data.whereChips ?? []).forEach((_, index) => items.push({ kind: 'where', index }));
    (node?.data.orderChips ?? []).forEach(chip => items.push({ kind: 'order', column: chip.replace(/\s+(asc|desc)$/i, '') }));
    (node?.data.groupChips ?? []).forEach(column => items.push({ kind: 'group', column }));
    return items;
  }

  /**
   * Every stop across the WHOLE pipeline, in one flat sequence: a node's
   * incoming join (if it has one), then its own bare stop, then its own
   * reconfigurable items (`configItemsForAlias` order) - then the next
   * node's, and so on. The join comes BEFORE the node it leads into, not
   * after (confirmed live: landing on a node and only then being offered
   * "the join with the PREVIOUS node" read backwards) - it's the connection
   * you cross to arrive at this node, the same way reading the pipeline
   * left to right would put the arrow before the box it points to. This is
   * what Left/Right (configNext/configPrev) walks, one stop at a time;
   * Up/Down (focusNext/focusPrev) walks the same underlying node order but
   * skips straight between the 'node' stops, never stopping on a join or
   * any other config item. A node with nothing configured yet (and no
   * incoming join) still gets its own bare stop here (so Left/Right visits
   * it - just with nothing to pause on before the next node's), which is
   * exactly why `orderedFocusTargets` alone (not this list) is what Up/Down
   * needs.
   */
  private get flatStops(): FocusStop[] {
    const stops: FocusStop[] = [];
    for (const alias of this.orderedFocusTargets) {
      if (this.hasIncomingJoin(alias)) {
        stops.push({ kind: 'config', alias, item: { kind: 'join-type' } });
      }
      stops.push({ kind: 'node', alias });
      if (alias === START_NODE_ID) continue;
      for (const item of this.configItemsForAlias(alias)) {
        stops.push({ kind: 'config', alias, item });
      }
    }
    return stops;
  }

  /** Identifies a ConfigItem for equality checks below - not just its array position, which select/order/group deliberately don't carry (see canvas.model.ts's own comment on ConfigItem). */
  private static configItemKey(item: ConfigItem): string {
    if (item.kind === 'join-type') return 'join-type';
    if (item.kind === 'where') return `where:${item.index}`;
    return `${item.kind}:${item.column}`;
  }

  private static stopKey(stop: FocusStop): string {
    return stop.kind === 'node' ? `node:${stop.alias}` : `config:${stop.alias}:${CanvasStore.configItemKey(stop.item)}`;
  }

  /**
   * Re-resolved every read against the CURRENT node's items by identity,
   * not a stored position - `_cursor` holds the stop itself, and (once
   * confirmed to be a 'config' stop) this looks it up fresh each time.
   * Degrades to "nothing highlighted" (not a coincidentally-repositioned
   * neighbor) once that exact item is gone - the bug this replaced: a plain
   * index survived a toggle that shrank the list out from under it and got
   * silently reinterpreted as whatever OTHER item had slid into that same
   * slot. `join-type` is checked against `hasIncomingJoin` directly rather
   * than `configItemsForAlias`, which no longer carries it (see flatStops'
   * own comment on why it's tracked separately).
   */
  get focusedConfigItem(): ConfigItem | null {
    if (!this._cursor || this._cursor.kind !== 'config') return null;
    if (this._cursor.item.kind === 'join-type') {
      return this.hasIncomingJoin(this._cursor.alias) ? { kind: 'join-type' } : null;
    }
    const key = CanvasStore.configItemKey(this._cursor.item);
    return this.configItemsForAlias(this._cursor.alias).find(i => CanvasStore.configItemKey(i) === key) ?? null;
  }

  /**
   * Shift+J - the next stop in `flatStops`, the single flat sequence
   * spanning the whole pipeline. Moving off the last stop of one node lands
   * on the very next node's own bare stop, not its first config item -
   * visiting the node itself is part of the sequence, not skipped past on
   * the way to what's configured on it. Wraps from the pipeline's last stop
   * back to its first. Deliberately not bound to a spatial direction
   * (ArrowRight, an earlier version of this) - "next" in this sequence has
   * no reliable on-screen direction to match, since a "belongs to" relation
   * can render a node's own parent to its LEFT (confirmed live).
   */
  configNext() {
    const stops = this.flatStops;
    const currentKey = this._cursor ? CanvasStore.stopKey(this._cursor) : null;
    const idx = currentKey ? stops.findIndex(s => CanvasStore.stopKey(s) === currentKey) : -1;
    this._cursor = stops[idx === -1 ? 0 : (idx + 1) % stops.length];
  }

  /** Shift+K - mirrors configNext. */
  configPrev() {
    const stops = this.flatStops;
    const currentKey = this._cursor ? CanvasStore.stopKey(this._cursor) : null;
    const idx = currentKey ? stops.findIndex(s => CanvasStore.stopKey(s) === currentKey) : -1;
    this._cursor = stops[idx === -1 ? stops.length - 1 : (idx - 1 + stops.length) % stops.length];
  }

  /**
   * The current incoming join type on `alias`, read off the same edge
   * configItemsForAlias/openConfigCursor key off (`joinTargetAlias ===
   * alias`) - shared so both agree on what "current" means without
   * recomputing it twice.
   */
  private incomingJoinType(alias: string): JoinType {
    const incoming = this.canvasGraph.edges.find(e => e.joinTargetAlias === alias);
    return incoming?.joinType === 'LEFT' ? 'left' : incoming?.joinType === 'RIGHT' ? 'right' : 'inner';
  }

  /** Enter/Space on whatever configNext/configPrev last highlighted - opens the same editor its mouse equivalent (the edge's join-type icon, or a chip's own click) would. No-op with nothing highlighted. */
  openConfigCursor(anchor: PickerAnchor) {
    const item = this.focusedConfigItem;
    if (!item) return;
    const alias = this.focusedAlias;
    switch (item.kind) {
      case 'join-type':
        this.openJoinTypePicker(alias, this.incomingJoinType(alias), anchor);
        return;
      case 'where':
        this.openWhereEditor(alias, item.index, anchor);
        return;
      case 'select':
      case 'order':
      case 'group':
        // These three don't have a per-chip value/operator to prefill the
        // way a where condition or a join's type do (see canvas.model.ts's
        // WHERE_OPERATORS/JOIN_TYPES) - reopening means the same list
        // picker ChipRow's onSelect/the action bar's own button already
        // open. `item.column` (this ConfigItem's own identity, not a
        // recomputed lookup) still points it at the exact column this
        // cursor is on (Picker.tsx's own sinkSelected already shows it
        // checked) rather than defaulting to the top of the list - without
        // it, Enter again would toggle whatever's first alphabetically,
        // which reads as "I asked to remove this column and it added a
        // different one instead."
        this.openColumnPicker(item.kind, alias, anchor, item.column);
        return;
    }
  }

  /**
   * 'x'/Delete/Backspace on whatever configNext/configPrev last highlighted -
   * the keyboard equivalent of that item's own ChipRow `×`. A join's "type"
   * can't be removed the way a chip can (every join has exactly one), so
   * this resets it to inner - Pine's own default (no `:left`/`:right`
   * modifier) - rather than being a no-op or an error.
   */
  async removeConfigCursor(): Promise<void> {
    const item = this.focusedConfigItem;
    if (!item) return;
    const alias = this.focusedAlias;
    switch (item.kind) {
      case 'join-type':
        await this.setJoinType(alias, 'inner');
        return;
      case 'where':
        await this.removeWhereAt(alias, item.index);
        return;
      case 'select':
        await this.toggleSelectColumn(alias, item.column);
        return;
      case 'group':
        await this.toggleGroupColumn(alias, item.column);
        return;
      case 'order': {
        // removeOrderAt takes an array index - unlike toggleSelectColumn/
        // toggleGroupColumn, there's no value-keyed remove for order (each
        // entry also carries a direction, not just a column name), so this
        // is the one case that still needs a fresh index lookup rather than
        // trusting a stored one - found by the same column identity this
        // ConfigItem already carries, not a position captured earlier.
        const node = this.canvasGraph.nodes.find(
          (n): n is CanvasTableNode => n.type === 'table-node' && n.id === alias,
        );
        const index = (node?.data.orderChips ?? []).findIndex(
          chip => chip.replace(/\s+(asc|desc)$/i, '') === item.column,
        );
        if (index >= 0) await this.removeOrderAt(alias, index);
        return;
      }
    }
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
    // Deliberately does NOT proactively pin a `|= name` here just because a
    // checkpoint is unnamed - this used to run in the background on every
    // recompute (i.e. on every edit to session.expression), which can't
    // distinguish "just grouped, never named yet" from "user deliberately
    // removed the name via a raw-text edit" - both look identical
    // structurally. That made a manually-removed name reappear on its own
    // the moment any other edit landed (confirmed live). Naming now only
    // happens on demand - see openCheckpointPicker/ensureCheckpointPinned -
    // with FrameNode.tsx showing its own loading state for that on-demand
    // pin instead.
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
   * multi-select and keyboard cursor - all three can hold onto a node alias
   * (picker.request.alias, selectedAliases, `_cursor`) that this undo may
   * make stale (e.g. undoing past the gesture that pinned/created that
   * alias), the same class of staleness `runCommit`'s aliasMap-rename
   * handling exists for, just with no rename to follow this time since the
   * alias may no longer exist at all. Clearing `_cursor` rather than leaving
   * it dangling matters here specifically: the `focusedAlias` getter's
   * fallback only fires when the stored alias is *absent* from the new
   * graph - if undo happens to land on a graph that coincidentally still
   * has an alias of that same name (a different table entirely), the stale
   * value would silently look valid.
   */
  undo() {
    if (this.undoStack.length === 0) return;
    const previous = this.undoStack.pop() as string;
    this.redoStack.push(this.session.expression);
    this.closePicker();
    this.selectedAliases = [];
    this._cursor = null;
    this.session.expression = previous;
    this.notifyAutoRun();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop() as string;
    this.undoStack.push(this.session.expression);
    this.closePicker();
    this.selectedAliases = [];
    this._cursor = null;
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
    // Step 2 of the path picker (a specific destination already chosen) -
    // unlike every other kind below, this one has a real target to name
    // after `?`, not a fixed keyword prefix - see openPathRoutePicker.
    if (request.kind === 'path-route') {
      const target = request.targetSchema ? `${request.targetSchema}.${request.target}` : request.target;
      return `${focusPrefix} | ? ${target}`;
    }
    // pine-lang has no dedicated hint category for group-by candidates (see
    // pine-actions.ts's getGroupColumns/setGroupColumns comment) - reuse
    // select's, since "which columns exist on this table" is exactly the
    // same question either way. `path` (step 1, no destination named yet -
    // see openPathPicker) reuses pine-lang's own `?` operator with nothing
    // after it, which falls back to reachability-filtered table suggestions
    // (docs/paths.md) rather than a real path search.
    const opPrefix =
      request.kind === 'join'
        ? ''
        : request.kind === 'path'
          ? '? '
          : `${request.kind === 'where' ? 'w' : request.kind === 'order' ? 'o' : 's'}: `;
    return `${focusPrefix} | ${opPrefix}`.trimEnd();
  }

  private async openListPicker(
    request: PickerRequest,
    anchor: PickerAnchor,
    load: () => Promise<{ groups: { label: string; items: PickerItem[] }[] }>,
    focusValue?: string,
  ) {
    // Re-clicking the action button that's already open shouldn't reopen
    // it - that meant a redundant probeBuild round-trip and, worse, the
    // anchor snapping to wherever on the button this particular click
    // landed (confirmed live: clicking the same "select" button twice made
    // the dropdown visibly jump). A picker already open for the same
    // request just stays exactly as it is - EXCEPT `focusValue`: select/
    // order/group pickers deliberately stay open across repeat picks (see
    // toggleSelectColumn), so clicking a DIFFERENT already-selected chip (or
    // moving the keyboard config cursor to one) while that same alias+kind
    // picker is still open from a moment ago must still move the highlight
    // there - without this, the picker silently kept showing wherever it
    // last was, which read as "reopening this chip did nothing." Left
    // untouched (still a pure no-op) when focusValue is absent, which is
    // exactly the action bar's own button reopening itself - the "don't let
    // repeat clicks jump the anchor" case this guard exists for in the
    // first place.
    if (this.picker.open && this.picker.mode === 'list' && requestKey(this.picker.request) === requestKey(request)) {
      if (focusValue !== undefined) {
        this.picker = { ...this.picker, anchor, focusValue };
      }
      return;
    }

    // Staleness is tracked by a plain counter, not by comparing `request`
    // against `this.picker.request` - MobX deep-observes objects assigned to
    // an observable field, so reading `this.picker.request` back gives a
    // proxy that never === the original closure variable.
    const seq = ++this.pickerSeq;
    this.picker = { open: true, mode: 'list', request, anchor, loading: true, groups: [], filter: '', focusValue };
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

  /**
   * Step 1 of `? table` (pine-lang docs/paths.md): pick a destination table.
   * Reuses hints.table exactly like openTablePicker/openJoinPicker - the
   * server already narrows it to tables actually reachable from `alias`
   * within the search's hop cap (not every table in the schema), so there's
   * nothing path-specific to filter here on top of that. Selecting an item
   * doesn't commit anything (see Picker.tsx's onSelect) - it opens
   * openPathRoutePicker for the chosen table instead.
   */
  openPathPicker(alias: string, anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    const request: PickerRequest = { kind: 'path', alias };
    void this.openListPicker(request, anchor, async () => {
      const expr = this.buildProbeExpression(request);
      const ast = await probeBuild(expr, this.session.connectionId);
      if (!ast) throw new Error('Failed to build path suggestions');
      const items: PickerItem[] = ast.hints.table.map(h => ({
        id: `${h.schema ?? ''}.${h.table}`,
        label: h.table,
        detail: h.schema ?? undefined,
        // Not h.pine (unlike every other list picker) - this step only
        // names a destination, it doesn't commit a join, so what's needed
        // downstream is the bare table/schema openPathRoutePicker searches
        // for, not a pine fragment.
        value: h.table,
      }));
      return { groups: [{ label: '', items }] };
    });
  }

  /**
   * Step 2: the actual routes to `target` - each hop shaped exactly like a
   * TableHint (see PathHint), so asTableHint (Picker.tsx) reconstructs a
   * committable hint from the LAST hop's table/schema plus the full
   * multi-hop `pine` string unchanged - commitJoin needs no path-specific
   * branch at all.
   */
  openPathRoutePicker(
    alias: string,
    target: string,
    targetSchema: string | undefined,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
  ) {
    const request: PickerRequest = { kind: 'path-route', alias, target, targetSchema };
    void this.openListPicker(request, anchor, async () => {
      const expr = this.buildProbeExpression(request);
      const ast = await probeBuild(expr, this.session.connectionId);
      if (!ast) throw new Error('Failed to build route suggestions');
      const routeLabel = (path: PathHint): string | undefined => {
        if (path.length <= 1) return undefined;
        // Every hop but the last is a stop along the way - the last hop IS
        // the destination the user already picked in step 1, so repeating
        // it here would just be noise.
        return `via ${path.hops
          .slice(0, -1)
          .map(h => h.table)
          .join(', ')}`;
      };
      const items: PickerItem[] = ast.hints.paths.map((path, i) => {
        const last = path.hops[path.hops.length - 1];
        return {
          id: `${path.pine}-${i}`,
          label: last.table,
          detail: last.schema ?? undefined,
          value: path.pine,
          subLabel: routeLabel(path),
        };
      });
      return { groups: [{ label: '', items }] };
    });
  }

  /**
   * The "+" overflow trigger's own menu (TableNode.tsx/FrameNode.tsx) - a
   * fixed, non-searchable set of 2-3 actions, not a data-backed list, so it
   * opens directly rather than through openListPicker (no probeBuild, no
   * loading state - see PickerState's 'more' mode and Picker.tsx's mirrored
   * 'join-type' rendering, the closest existing precedent for a small static
   * popover).
   */
  openMorePicker(
    alias: string,
    offer: MoreAction[],
    isFrame: boolean,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
  ) {
    if (this.picker.open && this.picker.mode === 'more' && this.picker.alias === alias) {
      this.closePicker();
      return;
    }
    this.picker = { open: true, mode: 'more', alias, offer, isFrame, anchor };
  }

  /**
   * Dispatches one "+" menu pick to the real picker it stands for - Picker.tsx
   * calls this for both a mouse click and its own o/g/p mnemonics, so the
   * routing lives in one place rather than being duplicated at both call
   * sites. `isFrame` mirrors openCheckpointPicker's own routing: a
   * checkpoint's pinned name needs re-resolving (openCheckpointPicker does
   * that internally), so `alias` is unused in that branch - passed anyway so
   * the non-frame branch doesn't need a separate signature.
   */
  activateMoreAction(alias: string, action: MoreAction, isFrame: boolean, anchor: PickerAnchor) {
    if (isFrame) {
      if (action === 'group') return; // never offered for a checkpoint frame - see FrameNode.tsx
      void this.openCheckpointPicker(action, anchor);
      return;
    }
    if (action === 'path') {
      this.openPathPicker(alias, anchor);
      return;
    }
    this.openColumnPicker(action, alias, anchor);
  }

  openColumnPicker(
    kind: 'select' | 'where' | 'order' | 'group',
    alias: string,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
    /** Pre-highlight this column once the list loads - see PickerState's own `focusValue` doc. */
    focusValue?: string,
  ) {
    const request: PickerRequest = { kind, alias };
    void this.openListPicker(
      request,
      anchor,
      async () => {
        const expr = this.buildProbeExpression(request);
        const ast = await probeBuild(expr, this.session.connectionId);
        if (!ast) throw new Error('Failed to build column suggestions');
        // No dedicated hint category for group - see buildProbeExpression's
        // matching comment; reuses select's.
        const hints = kind === 'where' ? ast.hints.where : kind === 'order' ? ast.hints.order : ast.hints.select;
        const items: PickerItem[] = hints.map(h => ({ id: h.column, label: h.column, value: h.column }));
        // hints.select (and order/group, which reuse it) only ever lists
        // what could still be ADDED - buildProbeExpression's own comment
        // calls this deliberate for select's "what else could I add"
        // question. That means an already-selected column reopened via its
        // own chip (ChipRow's onSelect/openConfigCursor, both passing it as
        // `focusValue`) doesn't actually exist in this list at all - not
        // findable, not highlightable, and pressing Enter on whatever IS
        // first among the genuinely-new candidates adds a different column
        // instead of removing the one just clicked. Merging the node's own
        // current selection back in (Picker.tsx's sinkSelected already sorts
        // it to the bottom and checks it - insertion position here doesn't
        // matter) fixes the picker for the one case its hints were never
        // meant to answer alone.
        if (kind === 'select' || kind === 'order' || kind === 'group') {
          const node = this.canvasGraph.nodes.find(
            (n): n is CanvasTableNode => n.type === 'table-node' && n.id === alias,
          );
          const existing =
            kind === 'select'
              ? node?.data.selectColumns ?? []
              : kind === 'group'
                ? node?.data.groupChips ?? []
                : (node?.data.orderChips ?? []).map(c => c.replace(/\s+(asc|desc)$/i, ''));
          const present = new Set(items.map(i => i.value));
          for (const column of existing) {
            if (!present.has(column)) items.push({ id: column, label: column, value: column });
          }
        }
        return { groups: [{ label: '', items }] };
      },
      focusValue,
    );
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

  /**
   * Opens the small Inner/Left/Right popover for one join - a click on
   * TraceEdge's own label/pin, or openConfigCursor's keyboard equivalent.
   * `alias` is always the edge's `joinTargetAlias` (see CanvasEdge's own
   * comment for why that can differ from the edge's rendered `target`), not
   * something this method resolves itself. Re-clicking the edge that's
   * already open closes it, same toggle convention as openListPicker's own
   * re-click guard.
   */
  openJoinTypePicker(alias: string, current: JoinType, anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    if (this.picker.open && this.picker.mode === 'join-type' && this.picker.alias === alias) {
      this.closePicker();
      return;
    }
    this.picker = { open: true, mode: 'join-type', alias, current, anchor };
  }

  /** Inner/Left/Right, mutually exclusive - always a full commit+close, never staying open for repeat picks (unlike select/order/group's checkbox-style toggles), since picking one answers the whole question. */
  async setJoinType(alias: string, type: JoinType) {
    await this.commit(base => actions.setJoinType(base, actions.resolveAlias(base, alias), type));
    this.closePicker();
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

  /**
   * Reopens the where-value panel for an EXISTING condition (a chip's own
   * click, or configNext/openConfigCursor's keyboard equivalent), prefilled
   * from `ast.where` - structured data already, so no re-parsing of the
   * derived `whereChips` display string (`"id = 1"`) is needed. `index` is
   * the same pipeline-order indexing removeWhereConditionAt/
   * updateWhereConditionAt use. No-op if the index doesn't currently exist
   * (e.g. a stale click racing a commit that just removed it).
   */
  openWhereEditor(alias: string, index: number, anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    const condition = (this.session.ast?.where ?? []).filter(w => w[0] === alias)[index];
    if (!condition) return;
    const [, column, , operator, val] = condition;
    const value = val && 'value' in val ? String(val.value) : '';
    this.picker = { open: true, mode: 'where-value', alias, column, operator, value, anchor, editIndex: index };
  }

  setWhereOperator(operator: string) {
    if (this.picker.open && this.picker.mode === 'where-value') this.picker = { ...this.picker, operator };
  }

  setWhereValue(value: string) {
    if (this.picker.open && this.picker.mode === 'where-value') this.picker = { ...this.picker, value };
  }

  async submitWhereValue() {
    if (!this.picker.open || this.picker.mode !== 'where-value' || !this.picker.value.trim()) return;
    const { alias, column, operator, value, editIndex } = this.picker;
    if (editIndex !== undefined) {
      await this.commitWhereUpdate(alias, editIndex, column, operator, value.trim());
    } else {
      await this.commitWhere(alias, column, operator, value.trim());
    }
  }

  async commitWhere(alias: string, column: string, operator: string, value: string) {
    await this.commit(base => actions.addWhereCondition(base, actions.resolveAlias(base, alias), column, operator, value));
    this.closePicker();
  }

  async commitWhereUpdate(alias: string, index: number, column: string, operator: string, value: string) {
    await this.commit(base =>
      actions.updateWhereConditionAt(base, actions.resolveAlias(base, alias), index, column, operator, value),
    );
    this.closePicker();
  }

  async removeWhereAt(alias: string, index: number) {
    await this.commit(base => actions.removeWhereConditionAt(base, actions.resolveAlias(base, alias), index));
  }

  /** The where-value panel's own "remove" action (offered only while editing an existing condition - see Picker.tsx) - removes, then closes, unlike removeWhereAt's own (ChipRow's × stays open on nothing, since there's nothing left to show). */
  async removeWhereAndClose(alias: string, index: number) {
    await this.removeWhereAt(alias, index);
    this.closePicker();
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
    if (name) await this.syncAstToExpression();
    return name;
  }

  /**
   * Re-probes `session.expression` and, if it still matches what was just
   * probed, assigns the result straight to `session.ast` - closing the gap
   * before Session's own separately-debounced build (200ms, plus a network
   * round trip - see pinnedBase's comment) catches up on its own.
   *
   * Needed specifically after a commit that changes `session.expression` to
   * `next`'s *prettified* rendering (see runCommit): the ast a commit's own
   * probe already has in hand describes `next`'s (unprettified) text, not
   * the differently-formatted string that just got assigned to
   * `session.expression` - `ast.ranges` are flat character offsets, so
   * pairing them with a same-content-but-different-length string slices the
   * wrong substrings (pinnedBase's own "cas as cr" landmine) rather than
   * simply being stale. Only a fresh probe of the exact string in
   * `session.expression` has matching ranges.
   *
   * Confirmed live as openCheckpointPicker's first select/where/order/join
   * click, right after pinning a name, building a probe expression from
   * corrupted segments - it silently dropped the checkpoint from the probe
   * entirely and asked the backend to resolve a `from: <name>` no earlier
   * step had actually defined, coming back with zero column hints. A second
   * click worked because Session's debounced build had caught up for real
   * by then. Not folded into runCommit itself - every other gesture already
   * has this same gap, but nothing else reads `session.ast` synchronously
   * immediately afterward, so paying an extra probe there would be pure
   * waste; this one specific caller does, so it pays for its own fix.
   */
  private async syncAstToExpression(): Promise<void> {
    const expression = this.session.expression;
    const ast = await probeBuild(expression, this.session.connectionId);
    if (ast && this.session.expression === expression) {
      runInAction(() => {
        this.session.ast = ast;
      });
    }
  }

  /**
   * Shares one in-flight pin commit across concurrent frame-action clicks
   * that land before an earlier one resolves, so they never race into two
   * redundant commit() round trips for the same pin.
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
   * True while a frame action's first click is waiting on
   * ensureCheckpointPinned to resolve - naming now only happens on demand
   * (see recompute's comment), so this is the one signal FrameNode.tsx has
   * to show that the click landed instead of appearing to do nothing.
   */
  get checkpointPinning(): boolean {
    return this.checkpointPinInFlight !== null;
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
   * call). The first click on a still-unnamed checkpoint does pay that
   * round trip - `checkpointPinning` is what lets FrameNode.tsx show a
   * loading state for it rather than looking unresponsive. Committing the
   * actual pick still goes through the full pinning pipeline regardless
   * (see toggleSelectColumn etc.) - this only covers opening the picker.
   */
  async openCheckpointPicker(kind: 'select' | 'where' | 'order' | 'join' | 'path', anchor: PickerAnchor) {
    const segments = segmentsFromAst(this.session.expression, this.session.ast) ?? [];
    const name = currentCheckpointName(segments) ?? (await this.ensureCheckpointPinnedShared());
    if (!name) return;
    if (kind === 'join') {
      this.openJoinPicker(name, anchor);
      return;
    }
    if (kind === 'path') {
      this.openPathPicker(name, anchor);
      return;
    }
    this.openColumnPicker(kind, name, anchor);
  }
}
