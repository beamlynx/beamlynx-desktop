import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { TableHint } from '../client';
import { Session } from '../session';
import { CanvasGraph, PickerAnchor, PickerItem, PickerRequest, PickerState } from './canvas.model';
import { buildCanvasGraph } from './layout';
import { makeAlias, segmentsFromAst, splitTrailingCheckpoints, toText } from './pine-text';
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
  private pickerSeq = 0;
  // Serializes commit() calls (see commit/runCommit below) - without this,
  // two gestures fired in quick succession (e.g. two picks in the same
  // still-open multi-select picker) both compute their mutation against the
  // same starting text and the second's result silently overwrites the
  // first's.
  private commitChain: Promise<void> = Promise.resolve();

  private readonly session: Session;

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
    this.canvasGraph = buildCanvasGraph(ast, this.positions);
  }

  setNodePosition(id: string, position: { x: number; y: number }) {
    this.positions[id] = position;
  }

  setSelectedAliases(aliases: string[]) {
    this.selectedAliases = aliases;
  }

  private applyExpression(expression: string) {
    this.session.expression = expression;
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
      const prettified = await probeBuild(next, this.session.connectionId).then(
        ast => ast.prettified || next,
        () => next,
      );
      runInAction(() => {
        this.applyExpression(prettified);
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
    // Drop any trailing group:/limit: - both are pine-lang "checkpoint"
    // operations that seal the pipeline into its aggregated/limited output,
    // so a hint probe built *after* one reflects that output's shape (just
    // the grouped columns, plus aggregate function names) rather than the
    // actual table the gesture is about. Confirmed live: grouping on one
    // node, then opening group on a *different* node, offered only the
    // first node's already-grouped column and "count" - the post-checkpoint
    // shape, not the second node's real columns. See splitTrailingCheckpoints
    // (pine-text.ts) - the same helper also fixes appendTableSegment, which
    // had the identical issue committing a join after a group/limit instead
    // of before it.
    const segments = segmentsFromAst(this.session.expression, this.session.ast) ?? [];
    const { body } = splitTrailingCheckpoints(segments);
    const base = (body.length ? toText(body) : this.session.expression).replace(/\|\s*$/, '').trimEnd();
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
      const has = ast.hints.table.filter(h => !h.parent);
      const belongsTo = ast.hints.table.filter(h => h.parent);
      const toItems = (hints: TableHint[]): PickerItem[] =>
        hints.map(h => ({ id: h.pine, label: h.table, detail: h.schema ?? undefined, value: h.pine }));
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
  }

  async commitJoin(hint: TableHint, focusAlias: string) {
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
      // focusAlias was read off the node before this base was computed -
      // if it was the in-progress table, pinning may have just renamed it
      // (see PinnedBase's aliasMap comment).
      const resolvedFocus = actions.resolveAlias(base, focusAlias);
      const fromAlias = resolvedFocus !== base.ast.current ? resolvedFocus : undefined;
      return actions.join(base, hint, alias, fromAlias);
    });
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

  async deleteNode(alias: string) {
    await this.commit(base => actions.deleteNode(base, actions.resolveAlias(base, alias)));
  }

  /** `limit:` applies to the whole pipeline, not a specific table - pass null to clear it. */
  async commitLimit(value: number | null) {
    await this.commit(base => actions.setLimit(base, value));
  }
}
