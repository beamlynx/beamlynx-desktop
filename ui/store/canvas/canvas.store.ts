import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { Ast, columnName, PathHint, TableHint, whereConditions, whereLiteral } from '../client';
import { Session } from '../session';
import {
  CanvasGraph,
  CanvasTableNode,
  ConfigItem,
  JoinType,
  MORE_ACTIONS_FOR_CHECKPOINT,
  MORE_ACTIONS_FOR_TABLE,
  MoreAction,
  OrderDirection,
  PickerAnchor,
  PickerItem,
  PickerRequest,
  PickerState,
  RelativeDateUnit,
  START_NODE_ID,
  WHERE_ROLLING_OPERATOR,
  WHERE_TODAY_OPERATOR,
  WhereConditionDraft,
  WhereDraft,
} from './canvas.model';
import { buildCanvasGraph, expansionOf, NamedBlock, newCheckpointName, whereEntriesFor } from './layout';
import { contextFor, queryText, replaceQuery, TabBlocks, tabBlocks } from './tab-blocks';
import { Lineage, lineageOf } from './lineage';
import {
  Segment,
  stageLimitIndex,
  checkpointOpIndex,
  currentLimit,
  isCheckpointPinned,
  limitValue,
  makeAlias,
  segmentsFromAst,
  replaceDoc,
  stageEnd,
  toText,
  withDoc,
} from './pine-text';
import * as actions from './pine-actions';
import { hasValue, literalFor, setValue, valueNames } from '../values-blocks';
import { probeBuild } from './probe';
import { canDeleteTraverse } from './traversal';
import { computeDateBounds } from './relative-date';


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
  /**
   * The nested query whose container is open - one at a time (see
   * layout.ts's buildCanvasGraph): a checkpoint, a named block, or a
   * checkpoint inside a named block (`b0/result_1`). undefined or null:
   * none, the default - only the last stage is drawn. UI-only: never
   * written into the Pine text, and not persisted.
   */
  expandedNested: string | null | undefined = undefined;

  /**
   * Each query block's own build, when the tab has more than one (see
   * refreshBlockAsts), by query-block index, with the text it was built
   * from. With one query block, the session's own build is used instead.
   */
  blockAsts: { text: string; ast: Ast | undefined }[] = [];
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
  // The last expression the canvas itself wrote (applyExpression/undo/redo).
  // Any other change - typing in the editor, Result.tsx's `from:`, a restored
  // tab - clears `_cursor`, so focus falls back to `ast.current`, the latest
  // table. Without that, a cursor left on an older node survived hand-typed
  // joins, and the next `|` quietly joined from the older node instead.
  private canvasWrittenExpression: string | null = null;
  private pickerSeq = 0;
  // Shares one in-flight checkpoint-naming commit across concurrent picker
  // opens that land before an earlier one resolves - see
  // ensureCheckpointPinnedShared. `pinningName` is the checkpoint whose
  // action triggered it, exposed as `checkpointPinning` for TableNode.tsx's
  // loading state on that checkpoint's node.
  private checkpointPinInFlight: Promise<string | null> | null = null;
  private pinningName: string | null = null;
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
   * Every keyboard-navigable stop, in pipeline order, top to bottom: table
   * nodes and checkpoints' nodes, by `data.order` (layout.ts numbers them
   * stage by stage). A checkpoint's divider isn't a stop. The empty-graph
   * Start node is the sole target when nothing exists yet, matching
   * Canvas.tsx's own `derivedNodes` swap.
   */
  private get orderedFocusTargets(): string[] {
    const tableNodes = this.canvasGraph.nodes.filter(
      (n): n is CanvasTableNode => n.type === 'table-node',
    );
    if (tableNodes.length === 0) return [START_NODE_ID];
    return [...tableNodes].sort((a, b) => a.data.order - b.data.order).map(n => n.id);
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
    const current = this.mainAst?.current;
    if (current && targets.includes(current)) return current;
    return targets[0];
  }

  /**
   * Lands the cursor on `alias`'s own bare stop - no config item highlighted.
   * Up/Down (focusNext/focusPrev below) and every mouse click that changes
   * focus go through this - never a plain hover (see TableNode.tsx's
   * onMouseEnter) - also spotlights `alias`'s columns in Result.tsx
   * (see `hoveredAlias`), so keyboard nav gets the same column highlight
   * hovering a node already gave mouse users.
   */
  focusNode(alias: string) {
    this._cursor = { kind: 'node', alias };
    this.setHoveredAlias(alias);
  }

  /**
   * Which table's columns Result.tsx should spotlight right now. Set here by
   * focusNode (keyboard nav and node clicks); cleared by TableNode's own
   * onMouseLeave the instant the pointer leaves with nothing else having
   * claimed it since (see that handler's own comment).
   */
  hoveredAlias: string | null = null;

  setHoveredAlias(alias: string | null) {
    this.hoveredAlias = alias;
  }

  /**
   * True until the first successful graph build seeds `hoveredAlias` below.
   * Guards that seed to fire exactly once per store instance - without it,
   * every later recompute() where the user has since mouse-left a node
   * (hoveredAlias legitimately back to null) would re-highlight whatever's
   * focused on the next unrelated edit, fighting the mouse-leave clear
   * TableNode relies on.
   */
  private hasSeededHoverAlias = false;

  /**
   * Lands the cursor directly on one specific config item (a chip, or an
   * incoming join's own icon) - the mouse's equivalent of what Left/Right
   * (configNext/configPrev) does one stop at a time. Every picker that
   * reopens an EXISTING item (a chip's own click, a join icon's own
   * click) goes through this rather than focusNode, so clicking that exact
   * item shows the same "this one thing is selected"
   * ring keyboard nav already gives it, instead of the whole node's
   * thicker border ALSO lighting up alongside it (see TableNode.tsx's own
   * `hasConfigCursor` comment for why the two are drawn as mutually
   * exclusive, never both at once).
   */
  focusConfigItem(alias: string, item: ConfigItem) {
    this._cursor = { kind: 'config', alias, item };
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
      case 'group':
        // These two don't have a per-chip value/operator to prefill the way
        // a where condition or a join's type do (see canvas.model.ts's
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
      case 'order': {
        // Same fresh index lookup as removeConfigCursor's own 'order' case -
        // openOrderEditor needs the chip's array position and current
        // direction, neither of which this ConfigItem carries (see its own
        // comment for why order only stores the column identity).
        const node = this.canvasGraph.nodes.find(
          (n): n is CanvasTableNode => n.type === 'table-node' && n.id === alias,
        );
        const chips = node?.data.orderChips ?? [];
        const index = chips.findIndex(chip => chip.replace(/\s+(asc|desc)$/i, '') === item.column);
        if (index < 0) return;
        const current = /\bdesc$/i.test(chips[index]) ? 'desc' : 'asc';
        this.openOrderEditor(alias, index, item.column, current, anchor);
        return;
      }
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
    const disposeGraph = reaction(
      () => [this.session.expression, this.session.ast, this.blockAsts] as const,
      () => this.recompute(),
      { fireImmediately: true },
    );
    // A tab with several query blocks: the canvas builds each block itself,
    // since the session builds only the block under the editor's cursor.
    const disposeBlocks = reaction(
      () => this.session.expression,
      () => void this.refreshBlockAsts(),
      { fireImmediately: true, delay: 150 },
    );
    const disposeCursorReset = reaction(
      () => this.session.expression,
      expression => {
        if (expression !== this.canvasWrittenExpression) this._cursor = null;
      },
    );
    return () => {
      disposeGraph();
      disposeCursorReset();
      disposeBlocks();
    };
  }

  private recompute() {
    const ast = this.mainAst;
    // The canvas draws the last query block, with values blocks anywhere
    // above it and earlier blocks ending in `|= name` as nested queries
    // (see tab-blocks.ts). Anything else gets the banner.
    const tab = this.tab;
    if (!tab) {
      this.canvasGraph = { ...this.canvasGraph, singleBlock: false };
      return;
    }
    const expression = this.queryText;
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
    // Deliberately does NOT proactively pin a checkpoint's `|= name` here -
    // doing it on every recompute (i.e. on every edit to session.expression)
    // can't tell "never named yet" from "the user deliberately removed the
    // name via a raw-text edit", so a removed name came straight back
    // (confirmed live). Naming happens on demand - see openCheckpointPicker/
    // ensureCheckpointPinned. The node shows the name pine-lang reports
    // either way.
    // A picked checkpoint missing from this ast falls back to the default
    // (buildCanvasGraph). It isn't cleared here: right after a commit the ast
    // can still be the one from before, without the checkpoint just added.
    this.canvasGraph = buildCanvasGraph(ast, this.positions, this.expandedNested, this.namedBlocks, this.lineage);
    if (!this.hasSeededHoverAlias && this.orderedFocusTargets.length > 0) {
      this.hasSeededHoverAlias = true;
      this.setHoveredAlias(this.focusedAlias);
    }
  }

  /**
   * The tab's query block: the text every gesture, probe and range offset
   * works on. The same as session.expression unless the tab has values blocks
   * above the query (store/values-blocks.ts), which the canvas never edits as
   * part of a gesture.
   */
  get queryText(): string {
    return this.textOf(this.mainBlock);
  }

  // --- the tab's blocks ------------------------------------------------

  /** The tab split into blocks for the canvas, or null when it can't be drawn - see tab-blocks.ts. */
  get tab(): TabBlocks | null {
    return tabBlocks(this.session.expression);
  }

  /** The index (into `tab.queries`) of the query block the canvas draws: the last one. */
  get mainBlock(): number {
    return Math.max((this.tab?.queries.length ?? 1) - 1, 0);
  }

  /** Whether the tab has earlier query blocks, so the canvas builds each block itself. */
  private get multiBlock(): boolean {
    return (this.tab?.queries.length ?? 0) > 1;
  }

  /**
   * Which query block a node belongs to, and its alias in that block's text.
   * A node drawn from an earlier block has its block's prefix in front of its
   * alias (`b0/c` - see layout.ts's NamedBlock); everything else is the last
   * block's. Every gesture starts here, so it edits the right block.
   */
  scopeOf(id: string): { block: number; alias: string } {
    const m = /^b(\d+)\/(.*)$/.exec(id);
    return m ? { block: Number(m[1]), alias: m[2] } : { block: this.mainBlock, alias: id };
  }

  /** Query block `block`'s text. */
  textOf(block: number): string {
    const tab = this.tab;
    return tab ? queryText(tab, block) : this.session.expression;
  }

  /** What a build of query block `block` sends before it - see tab-blocks.ts's contextFor. */
  contextOf(block: number): string[] {
    const tab = this.tab;
    return tab ? contextFor(tab, block) : [];
  }

  /**
   * Query block `block`'s build. The last block uses the session's own,
   * unless the tab has several query blocks: the session builds the block
   * under the editor's cursor, which may be an earlier one.
   */
  astOf(block: number): Ast | null | undefined {
    if (!this.multiBlock) return this.session.ast;
    const built = this.blockAsts[block];
    return built && built.text === this.textOf(block) ? built.ast : undefined;
  }

  /** The build of the query the canvas draws. */
  get mainAst(): Ast | null | undefined {
    return this.astOf(this.mainBlock);
  }

  /** The tab's earlier query blocks, for layout.ts - each with its name, node-id prefix and build. */
  private get namedBlocks(): NamedBlock[] {
    const tab = this.tab;
    if (!tab) return [];
    return tab.names.flatMap((name, k) => {
      const ast = name ? this.astOf(k) : undefined;
      return name && ast ? [{ name, prefix: `b${k}/`, ast }] : [];
    });
  }

  /** Which of the tab's query blocks is made from which - see lineage.ts. */
  private get lineage(): Lineage {
    const tab = this.tab;
    if (!tab || tab.queries.length < 2) return { names: [], edges: [] };
    const named = tab.names.flatMap((name, k) => (name ? [{ name, text: this.textOf(k) }] : []));
    return lineageOf(named, this.textOf(this.mainBlock));
  }

  /**
   * Builds every query block of a tab with more than one, each with the
   * blocks before it, and keeps the results in `blockAsts`. A build that
   * finishes after the text has moved on is dropped.
   */
  private async refreshBlockAsts(): Promise<void> {
    const tab = this.tab;
    if (!tab || tab.queries.length < 2) {
      if (this.blockAsts.length) runInAction(() => (this.blockAsts = []));
      return;
    }
    const expression = this.session.expression;
    const built = await Promise.all(
      tab.queries.map(async (_, k) => {
        const text = queryText(tab, k);
        const ast = await probeBuild(text, this.session.connectionId, contextFor(tab, k)).catch(() => undefined);
        return { text, ast };
      }),
    );
    if (this.session.expression !== expression) return;
    runInAction(() => {
      this.blockAsts = built;
    });
  }

  /**
   * Set a $variable's value, typed in the canvas's Variables list, by
   * rewriting (or adding) its `$name = value` line. Undoable like a gesture.
   * Throws with a message for a value Pine can't hold.
   */
  setVariableValue(name: string, typed: string, list: boolean, opts: { string?: boolean } = {}) {
    const next = setValue(this.session.expression, name, literalFor(typed, list, opts));
    if (next === this.session.expression) return;
    this.undoStack.push(this.session.expression);
    this.redoStack = [];
    this.canvasWrittenExpression = next;
    this.session.expression = next;
    // A new value changes the results, like any gesture does.
    this.notifyAutoRun();
  }

  setNodePosition(id: string, position: { x: number; y: number }) {
    this.positions[id] = position;
  }

  /** Whether a node has been dragged since the layout was last reset: the toolbar then offers a reset. */
  get hasMovedNodes(): boolean {
    return Object.keys(this.positions).length > 0;
  }

  /**
   * Bumped by resetLayout, so the canvas fits the view to the fresh layout:
   * a reset changes no node or edge count, which is what normally refits it.
   */
  layoutResets = 0;

  /** Forgets every dragged node's position and lays the canvas out again. UI-only. */
  resetLayout() {
    this.positions = {};
    this.layoutResets += 1;
    this.recompute();
  }

  setSelectedAliases(aliases: string[]) {
    this.selectedAliases = aliases;
  }

  private applyExpression(
    rawExpression: string,
    options?: {
      skipAutoRun?: boolean;
      preserveDoc?: boolean;
      coalesce?: boolean;
      block?: number;
      // A change elsewhere in the tab made in the same step - a `$name = `
      // line in the values block for a variable the gesture introduced.
      after?: (expression: string) => string;
    },
  ) {
    // Every gesture rebuilds the expression from the operation spans in
    // `ast.ranges` (pine-text.ts's segmentsFromAst + toText), and a doc
    // comment at the top is outside all of them - so a gesture would
    // otherwise delete this tab's own documentation on the way past. This is
    // the single place a canvas gesture writes `session.expression` (the
    // start-node's commitFirstTable and the probe/prettify path in runCommit
    // both land here), so re-attaching it once here covers all of them.
    // Undo/redo snapshots are taken after this, so they carry the doc too.
    //
    // setDoc opts out: it is the one write whose whole purpose is to change
    // (or clear) the doc, so re-attaching the old one would make deleting a
    // comment impossible.
    // A gesture rewrites the query block only (see queryText); the values
    // blocks above it are put back in front, untouched.
    // A gesture on a node of an earlier block (see scopeOf) rewrites that
    // block instead.
    const block = options?.block ?? this.mainBlock;
    const tab = this.tab;
    const old = this.textOf(block);
    const query = options?.preserveDoc === false ? rawExpression : withDoc(old, rawExpression);
    const replaced = tab ? replaceQuery(this.session.expression, tab, block, query) : query;
    const expression = options?.after ? options.after(replaced) : replaced;
    // A no-op gesture (e.g. deleteNode/setLimit returning the same text)
    // shouldn't push a snapshot that's identical to what undo would already
    // land on - it would just be a wasted step, never a wrong one, but it's
    // free to skip.
    if (expression === this.session.expression) return;
    // `coalesce` replaces the current step instead of adding one, so undo
    // goes back past it to the snapshot already on the stack.
    if (!options?.coalesce) this.undoStack.push(this.session.expression);
    this.redoStack = [];
    this.canvasWrittenExpression = expression;
    this.session.expression = expression;
    if (!options?.skipAutoRun) this.notifyAutoRun();
  }

  // The expression the last SQL translation wrote, or null.
  private sqlTranslationWritten: string | null = null;

  /**
   * Replace the query with Pine translated from the SQL panel's text
   * (Session.convertSql). Undoable like a gesture, but one step per burst
   * of SQL typing, not one per translation: while the expression is still
   * exactly what the last translation wrote, the next one replaces it
   * instead of adding a step. So the step under a burst of typing is the
   * Pine from before it began, and one undo brings that back. Anything else
   * that changes the expression - a gesture, an undo, typed Pine - ends the
   * burst, because the expression no longer matches.
   *
   * Values blocks above the query and the doc comment are kept, as for any
   * gesture. Doesn't run the query: in SQL mode, Run runs the SQL.
   */
  applySqlTranslation(pine: string) {
    const coalesce = this.sqlTranslationWritten !== null && this.session.expression === this.sqlTranslationWritten;
    // The whole query changed, so nothing pointing at its nodes still holds.
    this.closePicker();
    this.selectedAliases = [];
    this._cursor = null;
    const before = this.session.expression;
    this.applyExpression(pine, { skipAutoRun: true, coalesce });
    // A translation that changed nothing doesn't start a burst: the step
    // under the next real one must be the Pine as it is now.
    if (coalesce || this.session.expression !== before) {
      this.sqlTranslationWritten = this.session.expression;
    }
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

  // --- doc comment ------------------------------------------------------

  /**
   * True while the canvas comment is open for editing (PineDoc.tsx renders a
   * text field instead of the printed text).
   *
   * Note that the *text* being edited is not held here. It lives in the
   * expression, like everything else on this canvas: the field starts from
   * `session.doc` and `setDoc` splices the result back into
   * `session.expression`, which rebuilds and hands the text back as the
   * build response's `doc`. Canvas keeps no copy to drift from - the same
   * reason it holds no copy of the tables or the joins.
   */
  docEditing = false;

  startDocEdit() {
    this.docEditing = true;
  }

  cancelDocEdit() {
    this.docEditing = false;
  }

  /**
   * Write the canvas comment into the expression. Empty text removes it.
   *
   * No probe first, unlike every other gesture (see runCommit): a comment
   * cannot change whether the expression parses, so there is nothing to
   * confirm. No auto-run either - a comment says nothing about which rows come
   * back, so re-running the query would be pure noise.
   */
  setDoc(text: string) {
    this.docEditing = false;
    // The tab's doc comment is the one at the top of its first block.
    const first = this.tab && this.tab.queries.length > 0 && this.tab.queries[0] === 0 ? 0 : this.mainBlock;
    this.applyExpression(replaceDoc(this.textOf(first), text), {
      skipAutoRun: true,
      preserveDoc: false,
      block: first,
    });
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
    // Ends any burst of SQL typing, even when this lands on the text the
    // last translation wrote: the next translation is a step of its own.
    this.sqlTranslationWritten = null;
    this.redoStack.push(this.session.expression);
    this.closePicker();
    this.selectedAliases = [];
    this._cursor = null;
    this.canvasWrittenExpression = previous;
    this.session.expression = previous;
    this.notifyAutoRun();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop() as string;
    // Ends any burst of SQL typing, even when this lands on the text the
    // last translation wrote: the next translation is a step of its own.
    this.sqlTranslationWritten = null;
    this.undoStack.push(this.session.expression);
    this.closePicker();
    this.selectedAliases = [];
    this._cursor = null;
    this.canvasWrittenExpression = next;
    this.session.expression = next;
    this.notifyAutoRun();
  }

  private async pinnedBase(block: number): Promise<actions.PinnedBase | null> {
    const expression = this.textOf(block);
    const context = this.contextOf(block);
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
    const ast = await probeBuild(expression, this.session.connectionId, context);
    return actions.getPinnedBase(expression, ast, this.session.connectionId, context);
  }

  /**
   * `scopeId` is the node the gesture is on (see scopeOf): it picks the
   * query block the gesture edits. Omitted: the last block.
   */
  private async commit(
    fn: (base: actions.PinnedBase) => string | null,
    scopeId?: string,
    after?: (expression: string) => string,
  ): Promise<void> {
    const block = scopeId === undefined ? this.mainBlock : this.scopeOf(scopeId).block;
    // Serialized: chain onto whatever's already pending so a second commit
    // never starts computing its mutation until the first one has fully
    // applied - see commitChain's declaration and runCommit below.
    const run = this.commitChain.then(() => this.runCommit(fn, block, after));
    this.commitChain = run.catch(() => undefined);
    await run;
  }

  private async runCommit(
    fn: (base: actions.PinnedBase) => string | null,
    block: number,
    after?: (expression: string) => string,
  ): Promise<void> {
    const base = await this.pinnedBase(block);
    const prefix = block === this.mainBlock ? '' : `b${block}/`;
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
      // A gesture that adds a group:/limit: makes a new checkpoint, and its
      // node is the new "current" node the next step builds on - so focus
      // moves there, as focus follows a newly joined table (see commitJoin).
      let addedCheckpoint: string | null = null;
      const prettified = await probeBuild(next, this.session.connectionId, this.contextOf(block)).then(
        ast => {
          if (!ast) probedOk = false;
          addedCheckpoint = newCheckpointName(base.ast.checkpoints, ast?.checkpoints);
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
        this.applyExpression(prettified, { skipAutoRun: !probedOk, block, after });
        if (addedCheckpoint) {
          // Collapsed, like every nested query by default: the new node
          // stands for what it seals. Its toggle, or `e`, opens it.
          this.expandedNested = undefined;
          this.focusNode(prefix + addedCheckpoint);
        }
        // The select/where/order pickers stay open across multiple picks
        // (see toggleSelectColumn) with `request.alias` frozen from when
        // they were opened. If *this* commit is the one that pinned that
        // same node's alias, the picker is left holding the now-dangling
        // pre-pin alias - the next pick would read/write against an alias
        // no segment owns (see PinnedBase's aliasMap comment). Follow the
        // same rename here so a still-open picker keeps working.
        if (this.picker.open && this.picker.mode === 'list' && 'alias' in this.picker.request) {
          const { alias: plain } = this.scopeOf(this.picker.request.alias);
          const renamed = base.aliasMap.get(plain);
          if (renamed && this.picker.request.alias === prefix + plain) {
            this.picker = { ...this.picker, request: { ...this.picker.request, alias: prefix + renamed } };
          }
        }
      });
    }
  }

  // --- pickers -------------------------------------------------------

  closePicker() {
    this.picker = { open: false };
  }

  /**
   * Escape, or the list's own cancel. A column list opened from the where
   * panel's `or` button goes back to that panel with nothing lost - backing
   * out of choosing a column shouldn't throw away the conditions already
   * entered. Anything else closes.
   */
  dismissPicker() {
    const p = this.picker;
    if (p.open && p.mode === 'list' && p.request.kind === 'where' && p.request.draft) {
      this.picker = { open: true, mode: 'where-value', alias: p.request.alias, anchor: p.anchor, ...p.request.draft };
      return;
    }
    this.closePicker();
  }

  setPickerFilter(filter: string) {
    if (this.picker.open && this.picker.mode === 'list') {
      this.picker = { ...this.picker, filter };
    }
  }

  /** Fallback anchor for a picker opened without a captured click position. */
  private static readonly defaultAnchor: PickerAnchor = { x: 24, y: 24 };

  /** A picker's probe: buildProbeExpression's text, built with its block's context. */
  private probeFor(request: PickerRequest): Promise<Ast | undefined> {
    const block = 'alias' in request ? this.scopeOf(request.alias).block : this.mainBlock;
    return probeBuild(this.buildProbeExpression(request), this.session.connectionId, this.contextOf(block));
  }

  private buildProbeExpression(request: PickerRequest): string {
    if (request.kind === 'table') return '';
    // A node of an earlier block probes that block, with its own alias.
    const { block, alias } = this.scopeOf(request.alias);
    const text = this.textOf(block);
    const segments = segmentsFromAst(text, this.astOf(block)) ?? [];
    // The probe stops at the end of the target's own stage (see stageEnd):
    // a hint probe built after a checkpoint reflects the sealed output's
    // shape (just the grouped columns, plus aggregate function names), not
    // the table the gesture is about, and a table sealed by a checkpoint
    // isn't even an alias after it. Confirmed live: grouping on one node,
    // then opening group on a different node, offered only the first
    // node's already-grouped column and "count". For a checkpoint's own
    // node, its stage starts after its group:/limit:/`= name`, so the probe
    // keeps the checkpoint, and `from: <name>` resolves.
    let relevant = 'alias' in request ? segments.slice(0, stageEnd(segments, alias)) : segments;
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
      relevant = relevant.filter(s => !(s.owner === alias && s.kind === 'select'));
    }
    const base = (relevant.length ? toText(relevant) : text).replace(/\|\s*$/, '').trimEnd();
    const current = this.astOf(block)?.current;
    const focusPrefix = alias !== current ? `${base} | from: ${alias}` : base;
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
    this.focusNode(alias);
    const request: PickerRequest = { kind: 'join', alias };
    void this.openListPicker(request, anchor, async () => {
      const ast = await this.probeFor(request);
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
    this.focusNode(alias);
    const request: PickerRequest = { kind: 'path', alias };
    void this.openListPicker(request, anchor, async () => {
      const ast = await this.probeFor(request);
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
      const ast = await this.probeFor(request);
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
   * The "+" overflow trigger's own menu (TableNode.tsx) - a
   * fixed, non-searchable set of 2-3 actions, not a data-backed list, so it
   * opens directly rather than through openListPicker (no probeBuild, no
   * loading state - see PickerState's 'more' mode and Picker.tsx's mirrored
   * 'join-type' rendering, the closest existing precedent for a small static
   * popover).
   */
  /**
   * The "+" overflow menu. What it offers is decided here, from `isCheckpoint`
   * alone - callers used to pass the list too, and a caller that can pass a
   * list is a caller that can pass the wrong one. That is not hypothetical:
   * `traverse` was added to the button's list and the keyboard shortcut kept
   * opening a menu without it, because it had its own copy. There is nothing
   * left to keep in step now; a new action is one edit to MORE_ACTIONS_FOR_*
   * and every way of opening this menu has it.
   */
  openMorePicker(
    alias: string,
    isCheckpoint: boolean,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
  ) {
    if (this.picker.open && this.picker.mode === 'more' && this.picker.alias === alias) {
      this.closePicker();
      return;
    }
    this.focusNode(alias);
    const offer = isCheckpoint ? MORE_ACTIONS_FOR_CHECKPOINT : MORE_ACTIONS_FOR_TABLE;
    this.picker = { open: true, mode: 'more', alias, offer, isCheckpoint, anchor };
  }

  /**
   * Dispatches one "+" menu pick to the real picker it stands for - Picker.tsx
   * calls this for both a mouse click and its own o/g/p mnemonics, so the
   * routing lives in one place rather than being duplicated at both call
   * sites. With `isCheckpoint`, `alias` is the checkpoint's name, and the
   * pick goes through openCheckpointPicker, which pins that name first.
   */
  activateMoreAction(alias: string, action: MoreAction, isCheckpoint: boolean, anchor: PickerAnchor) {
    // Checked before the isCheckpoint branch below: a limit goes through
    // the normal commit, whose pinned base names every checkpoint anyway,
    // so it needs no picker-time pin.
    if (action === 'limit') {
      this.openLimitEditor(alias, anchor);
      return;
    }
    if (action === 'traverse') {
      // Plain nodes only. Following a foreign key out of a checkpoint's
      // sealed result isn't a thing - its node doesn't offer it either.
      if (isCheckpoint) return;
      this.openTraversePicker(alias, anchor);
      return;
    }
    if (isCheckpoint) {
      if (action === 'group') return; // never offered for a checkpoint's node
      void this.openCheckpointPicker(alias, action, anchor);
      return;
    }
    if (action === 'path') {
      this.openPathPicker(alias, anchor);
      return;
    }
    this.openColumnPicker(action, alias, anchor);
  }

  /**
   * Opens a small number-entry popover for a limit. From a node (a table or
   * a checkpoint's node), it is the limit that ends that node's stage (see
   * pine-actions.ts's setLimit). From a checkpoint's divider label,
   * `checkpoint` is set, and it is that checkpoint's own limit. Prefills
   * with the current value, read straight from the current segments rather
   * than the async pinnedBase().
   */
  openLimitEditor(alias: string, anchor: PickerAnchor = CanvasStore.defaultAnchor, checkpoint?: string) {
    this.focusNode(alias);
    const { block, alias: plain } = this.scopeOf(alias);
    const segments = segmentsFromAst(this.textOf(block), this.astOf(block)) ?? [];
    const plainCheckpoint = checkpoint === undefined ? undefined : this.scopeOf(checkpoint).alias;
    const opIndex = plainCheckpoint ? checkpointOpIndex(segments, plainCheckpoint) : -1;
    const current = plainCheckpoint
      ? opIndex >= 0
        ? limitValue(segments[opIndex].text)
        : null
      : currentLimit(segments, plain);
    // The limit segment being changed, if there is one: its `per` columns
    // fill the field, and the stage it ends is where `per` columns come from.
    const target = plainCheckpoint ? opIndex : stageLimitIndex(segments, plain);
    const per = target >= 0 ? actions.limitPer(segments[target].text) : [];
    const seq = ++this.pickerSeq;
    this.picker = {
      open: true,
      mode: 'limit-value',
      alias,
      checkpoint,
      current,
      value: current === null ? '' : String(current),
      per,
      perOptions: null,
      perFilter: '',
      anchor,
    };
    void this.loadPerOptions(block, segments, target, seq);
  }

  /**
   * Every column of the tables in the stage a limit ends, as `alias.column`,
   * for the limit editor's `per` field. A new limit goes at the end of the
   * query, so its stage is the last one. Each table's columns come from a
   * probe ending in `from: alias | s:`, like the select picker's.
   */
  private async loadPerOptions(block: number, segments: Segment[], target: number, seq: number) {
    const ast = this.astOf(block);
    const before = target >= 0 ? segments.slice(0, target) : segments;
    const owner = target >= 0 ? segments[target].owner : null;
    const checkpoint = owner ? (ast?.checkpoints ?? []).find(c => c.name === owner) : undefined;
    const aliases = checkpoint
      ? checkpoint.tables
      : Array.from(new Set([...(ast?.['selected-tables'] ?? []).map(t => t.alias), ...(ast?.current ? [ast.current] : [])]));
    const text = toText(before).replace(/\|\s*$/, '').trimEnd();
    const lists = await Promise.all(
      aliases.map(async a => {
        const probe = await probeBuild(`${text} | from: ${a} | s: `, this.session.connectionId, this.contextOf(block)).catch(
          () => undefined,
        );
        return (probe?.hints.select ?? []).map(h => `${a}.${h.column}`);
      }),
    );
    runInAction(() => {
      if (seq !== this.pickerSeq || !this.picker.open || this.picker.mode !== 'limit-value') return;
      this.picker = { ...this.picker, perOptions: lists.flat() };
    });
  }

  setPerFilter(filter: string) {
    if (this.picker.open && this.picker.mode === 'limit-value') this.picker = { ...this.picker, perFilter: filter };
  }

  /** Adds or removes one column of the limit editor's `per` field. */
  togglePer(column: string) {
    if (!this.picker.open || this.picker.mode !== 'limit-value') return;
    const per = this.picker.per.includes(column)
      ? this.picker.per.filter(c => c !== column)
      : [...this.picker.per, column];
    this.picker = { ...this.picker, per, perFilter: '' };
  }

  setLimitValue(value: string) {
    if (this.picker.open && this.picker.mode === 'limit-value') this.picker = { ...this.picker, value };
  }

  /** The limit panel's submit action (Enter, or its "set" button) - a blank/invalid value is a no-op, not a clear (use clearLimit for that). */
  async submitLimit() {
    if (!this.picker.open || this.picker.mode !== 'limit-value') return;
    const n = parseInt(this.picker.value, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    await this.commitLimit(n, this.picker.alias, this.picker.checkpoint, this.picker.per);
    this.closePicker();
  }

  /** The limit panel's own "clear" action (offered only while a limit already exists - see Picker.tsx) - removes, then closes, unlike a plain remove staying open on nothing left to show (see removeWhereAndClose's matching comment). */
  async clearLimit() {
    if (!this.picker.open || this.picker.mode !== 'limit-value') return;
    await this.commitLimit(null, this.picker.alias, this.picker.checkpoint);
    this.closePicker();
  }

  /**
   * The verb menu for a traversal: Count rows, Delete rows...
   *
   * A fixed two-entry list, so it opens directly rather than through
   * openListPicker - same as the "+" menu itself. Whether deleting is
   * *correct* here needs the AST, which is already in hand, so that decision
   * is made once at open time and carried on the picker rather than
   * re-derived per click.
   */
  openTraversePicker(alias: string, anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    if (this.picker.open && this.picker.mode === 'traverse' && this.picker.alias === alias) {
      this.closePicker();
      return;
    }
    this.focusNode(alias);
    const verdict = canDeleteTraverse(this.astOf(this.scopeOf(alias).block));
    this.picker = {
      open: true,
      mode: 'traverse',
      alias,
      deleteBlockedReason: verdict.ok ? null : verdict.reason,
      anchor,
    };
  }


  openColumnPicker(
    kind: 'select' | 'where' | 'order' | 'group',
    alias: string,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
    /** Pre-highlight this column once the list loads - see PickerState's own `focusValue` doc. */
    focusValue?: string,
  ) {
    // A specific existing chip being reopened gets its own config-item
    // cursor (matching what Left/Right would land on); adding a new one
    // from the action bar just focuses the node itself - see
    // focusConfigItem's own comment for why these are kept distinct.
    if (focusValue !== undefined && (kind === 'select' || kind === 'order' || kind === 'group')) {
      this.focusConfigItem(alias, { kind, column: focusValue });
    } else {
      this.focusNode(alias);
    }
    const request: PickerRequest = { kind, alias };
    void this.openListPicker(
      request,
      anchor,
      async () => {
        const ast = await this.probeFor(request);
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
    }, focusAlias);
    this.closePicker();
    const { block } = this.scopeOf(focusAlias);
    if (createdAlias) this.focusNode(block === this.mainBlock ? createdAlias : `b${block}/${createdAlias}`);
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
    this.focusConfigItem(alias, { kind: 'join-type' });
    this.picker = { open: true, mode: 'join-type', alias, current, anchor };
  }

  /** Inner/Left/Right, mutually exclusive - always a full commit+close, never staying open for repeat picks (unlike select/order/group's checkbox-style toggles), since picking one answers the whole question. */
  async setJoinType(alias: string, type: JoinType) {
    await this.commit(base => actions.setJoinType(base, actions.resolveAlias(base, alias), type), alias);
    this.closePicker();
  }

  /**
   * Reopens an EXISTING order chip for direction editing rather than the
   * column-add list (a chip's own click, or configNext/openConfigCursor's
   * keyboard equivalent) - `column`/`current` come straight from the
   * rendered chip (TableNode.tsx strips the trailing asc/desc for `column`)
   * since order has no compiled-AST equivalent of where's `session.ast.where`
   * to re-derive them from. `index` is the same pipeline-order indexing
   * removeOrderColumnAt/setOrderDirectionAt use.
   */
  openOrderEditor(
    alias: string,
    index: number,
    column: string,
    current: OrderDirection,
    anchor: PickerAnchor = CanvasStore.defaultAnchor,
  ) {
    if (this.picker.open && this.picker.mode === 'order-direction' && this.picker.alias === alias && this.picker.index === index) {
      this.closePicker();
      return;
    }
    this.focusConfigItem(alias, { kind: 'order', column });
    this.picker = { open: true, mode: 'order-direction', alias, column, index, current, anchor };
  }

  /** Asc/Desc, mutually exclusive - same full commit+close pattern as setJoinType. */
  async setOrderDirection(direction: OrderDirection) {
    if (!this.picker.open || this.picker.mode !== 'order-direction') return;
    const { alias, index } = this.picker;
    await this.commit(base => actions.setOrderDirectionAt(base, actions.resolveAlias(base, alias), index, direction), alias);
    this.closePicker();
  }

  async commitSelectColumns(alias: string, columns: string[]) {
    await this.commit(base => actions.setSelectColumns(base, actions.resolveAlias(base, alias), columns), alias);
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
    }, alias);
  }

  /**
   * Column chosen from the where picker's list - switch to entering an
   * operator/value, same anchor. With a `draft` (the list was opened from the
   * panel's own `or` button), the column becomes one more row of it rather
   * than a fresh panel.
   */
  beginWhereValue(alias: string, column: string, draft?: WhereDraft) {
    const anchor = this.picker.open ? this.picker.anchor : CanvasStore.defaultAnchor;
    const condition: WhereConditionDraft = { alias, column, operator: '=', value: '' };
    this.picker = {
      open: true,
      mode: 'where-value',
      alias,
      anchor,
      ...(draft
        ? { ...draft, conditions: [...draft.conditions, condition] }
        : { conditions: [condition], rollingCount: 1, rollingUnit: 'day' }),
    };
  }

  /**
   * Reopens the where-value panel for an EXISTING condition (a chip's own
   * click, or configNext/openConfigCursor's keyboard equivalent), prefilled
   * from `ast.where` - structured data already, so no re-parsing of the
   * derived `whereChips` display string (`"id = 1"`) is needed. An `or`
   * group opens with one row per condition. `index` is the same
   * pipeline-order indexing removeWhereConditionAt/updateWhereConditionAt
   * use. No-op if the index doesn't currently exist (e.g. a stale click
   * racing a commit that just removed it).
   */
  openWhereEditor(alias: string, index: number, anchor: PickerAnchor = CanvasStore.defaultAnchor) {
    // Every stage's conditions, not just the last's: a table sealed by a
    // checkpoint has its conditions in the checkpoint's snapshot.
    const { block, alias: plain } = this.scopeOf(alias);
    const ast = this.astOf(block);
    const entry = (ast ? whereEntriesFor(ast, plain) : [])[index];
    const prefix = block === this.mainBlock ? '' : `b${block}/`;
    if (!entry) return;
    const conditions = whereConditions(entry).map(({ alias: conditionAlias, column, path, operator, value: val }) => ({
      alias: prefix + conditionAlias,
      // A key inside a JSON column is written back as its path: data.address.city.
      column: columnName(column, path),
      // ast.where operators come back SQL-cased (e.g. "ILIKE") from pine-lang; Pine syntax is lowercase-only.
      operator: operator.toLowerCase(),
      // A variable reads back as `$name`, an `in` list as `1, 2`.
      value: Array.isArray(val)
        ? val.map(v => String(v?.value ?? '')).join(', ')
        : val && 'value' in val
          ? val['json-type'] || val.type === 'variable'
            ? whereLiteral(val)
            : String(val.value)
          : '',
    }));
    this.focusConfigItem(alias, { kind: 'where', index });
    this.picker = {
      open: true,
      mode: 'where-value',
      alias,
      anchor,
      conditions,
      editIndex: index,
      rollingCount: 1,
      rollingUnit: 'day',
    };
  }

  private updateWhereRow(row: number, change: Partial<WhereConditionDraft>) {
    if (!this.picker.open || this.picker.mode !== 'where-value') return;
    const conditions = this.picker.conditions.map((c, i) => (i === row ? { ...c, ...change } : c));
    this.picker = { ...this.picker, conditions };
  }

  setWhereOperator(row: number, operator: string) {
    this.updateWhereRow(row, { operator });
  }

  setWhereValue(row: number, value: string) {
    this.updateWhereRow(row, { value });
  }

  setWhereRolling(rollingCount: number, rollingUnit: RelativeDateUnit) {
    if (this.picker.open && this.picker.mode === 'where-value') this.picker = { ...this.picker, rollingCount, rollingUnit };
  }

  /**
   * The panel's `or` button: pick the next condition's column from the same
   * column list a new filter starts from, then come back to the panel with
   * it appended (see beginWhereValue's `draft`). The list is searchable,
   * which a column dropdown inside the panel would not be.
   */
  addWhereOrCondition() {
    if (!this.picker.open || this.picker.mode !== 'where-value') return;
    const { alias, anchor, conditions, editIndex, rollingCount, rollingUnit } = this.picker;
    const draft: WhereDraft = { conditions, editIndex, rollingCount, rollingUnit };
    const request: PickerRequest = { kind: 'where', alias, draft };
    void this.openListPicker(request, anchor, async () => {
      const ast = await this.probeFor(request);
      if (!ast) throw new Error('Failed to build column suggestions');
      return { groups: [{ label: '', items: ast.hints.where.map(h => ({ id: h.column, label: h.column, value: h.column })) }] };
    });
  }

  /** Drops one row of an `or`. The last row can't be dropped - that is what the panel's own remove/cancel are for. */
  removeWhereRow(row: number) {
    if (!this.picker.open || this.picker.mode !== 'where-value' || this.picker.conditions.length < 2) return;
    this.picker = { ...this.picker, conditions: this.picker.conditions.filter((_, i) => i !== row) };
  }

  /**
   * The first condition's `operator` doubles as the two relative-date picks
   * (WHERE_TODAY_OPERATOR/WHERE_ROLLING_OPERATOR - see WhereDraft's own
   * comment), so this is the one submit path for the where-value panel
   * regardless of which the dropdown holds. Both relative picks always ADD a
   * new pair of `where:` conditions rather than editing in place -
   * Picker.tsx only offers them for a brand-new, single condition, and this
   * bails out too as a second guard. They are two ANDed steps (a lower and
   * an upper bound), so they can't be one member of an `or` either.
   */
  async submitWhereValue() {
    if (!this.picker.open || this.picker.mode !== 'where-value') return;
    const { alias, conditions, editIndex, rollingCount, rollingUnit } = this.picker;
    const [first] = conditions;
    if (first.operator === WHERE_TODAY_OPERATOR || first.operator === WHERE_ROLLING_OPERATOR) {
      if (editIndex !== undefined || conditions.length > 1) return;
      const bounds = computeDateBounds(
        first.operator === WHERE_TODAY_OPERATOR ? { kind: 'today' } : { kind: 'rolling', count: rollingCount, unit: rollingUnit },
      );
      await this.commit(
        base => actions.addRelativeDateWhereCondition(base, actions.resolveAlias(base, first.alias), first.column, bounds),
        first.alias,
      );
      this.closePicker();
      return;
    }
    // Every row needs a value - a half-filled `or` would drop the empty one silently.
    if (conditions.some(c => !c.value.trim())) return;
    const trimmed = conditions.map(c => ({ ...c, value: c.value.trim() }));
    if (editIndex !== undefined) {
      await this.commitWhereUpdate(alias, editIndex, trimmed);
    } else {
      await this.commitWhere(alias, trimmed);
    }
  }

  async commitWhere(alias: string, conditions: WhereConditionDraft[]) {
    await this.commit(
      base =>
        actions.addWhereCondition(base, actions.resolveAlias(base, alias), actions.resolveConditionAliases(base, conditions)),
      alias,
      this.declareVariables(conditions),
    );
    this.closePicker();
  }

  /**
   * A `$name` typed as a where value that the tab doesn't set yet gets a
   * `$name = ` line in the values block, in the same step, so the Variables
   * list asks for its value.
   */
  private declareVariables(conditions: WhereConditionDraft[]): (expression: string) => string {
    const names = actions.variablesIn(conditions);
    return expression => names.reduce((text, name) => (hasValue(text, name) ? text : setValue(text, name, '')), expression);
  }

  /** The tab's variables: those its query uses, and those its values blocks set. For the where editor's `$` suggestions. */
  get variableNames(): string[] {
    return Array.from(new Set([...(this.session.variablesReport?.used ?? []), ...Array.from(valueNames(this.session.expression))])).sort();
  }

  /** A variable name for a column that the tab doesn't use yet: `status`, else `status_2`, ... */
  private freeVariableName(column: string): string {
    const last = column.split('.').pop() ?? column;
    const clean = last.replace(/[^A-Za-z0-9_]/g, '_');
    const base = /^[A-Za-z_]/.test(clean) ? clean : `v_${clean}`;
    const taken = new Set(this.variableNames);
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  /**
   * "make variable" on an existing where chip: `status = 'shipped'` becomes
   * `status = $status`, and `$status = 'shipped'` goes into the values block,
   * in one step. A name the tab already uses gets a number (`$status_2`).
   * An `in` list moves as a list: `$ids = (1, 2)`.
   */
  async makeWhereVariable() {
    if (!this.picker.open || this.picker.mode !== 'where-value') return;
    const { alias, conditions, editIndex } = this.picker;
    if (editIndex === undefined || conditions.length !== 1) return;
    const [condition] = conditions;
    const value = condition.value.trim();
    if (!value || actions.VARIABLE_VALUE.test(value)) return;
    const name = this.freeVariableName(condition.column);
    const literal = actions.buildWhereLiteral(value, condition.operator);
    await this.commit(
      base =>
        actions.updateWhereConditionAt(
          base,
          actions.resolveAlias(base, alias),
          editIndex,
          actions.resolveConditionAliases(base, [{ ...condition, value: `$${name}` }]),
        ),
      alias,
      expression => setValue(expression, name, literal),
    );
    this.closePicker();
  }

  async commitWhereUpdate(alias: string, index: number, conditions: WhereConditionDraft[]) {
    await this.commit(base =>
      actions.updateWhereConditionAt(
        base,
        actions.resolveAlias(base, alias),
        index,
        actions.resolveConditionAliases(base, conditions),
      ),
      alias,
      this.declareVariables(conditions),
    );
    this.closePicker();
  }

  async removeWhereAt(alias: string, index: number) {
    await this.commit(base => actions.removeWhereConditionAt(base, actions.resolveAlias(base, alias), index), alias);
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
    }, alias);
  }

  async removeOrderAt(alias: string, index: number) {
    await this.commit(base => actions.removeOrderColumnAt(base, actions.resolveAlias(base, alias), index), alias);
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
    }, alias);
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
    await this.commit(base => actions.deleteNode(base, actions.resolveAlias(base, alias)), alias);
    if (wasFocused) this.focusNode(neighbor);
  }

  /**
   * Removes the checkpoint named `name` - `x` on its focused node, and the ×
   * on its divider. See pine-actions.ts's deleteCheckpoint for what goes.
   * Refocus mirrors deleteNode's own: land on the node before it (the last
   * table it sealed), only if the checkpoint's node itself was focused.
   */
  async deleteCheckpoint(name: string) {
    const wasFocused = this.focusedAlias === name;
    const targets = this.orderedFocusTargets;
    const idx = targets.indexOf(name);
    const neighbor = idx > 0 ? targets[idx - 1] : START_NODE_ID;
    await this.commit(base => actions.deleteCheckpoint(base, this.scopeOf(name).alias), name);
    if (wasFocused) this.focusNode(neighbor);
  }

  /**
   * Sets, changes or (with null) clears a limit - see pine-actions.ts's
   * setLimit for which one `alias` and `checkpoint` pick. With neither, the
   * pipeline's first limit (the multi-select toolbar).
   */
  async commitLimit(value: number | null, alias?: string, checkpoint?: string, per?: string[]) {
    await this.commit(
      base =>
        actions.setLimit(
        base,
        value,
        alias === undefined ? undefined : actions.resolveAlias(base, alias),
        checkpoint === undefined ? undefined : this.scopeOf(checkpoint).alias,
        // `c_0.id` read before this base pinned c_0 as c: follow the rename.
        per?.map(column => {
          const dot = column.indexOf('.');
          return dot < 0 ? column : `${actions.resolveAlias(base, column.slice(0, dot))}${column.slice(dot)}`;
        }),
      ),
      checkpoint ?? alias,
    );
  }

  // --- checkpoint node -------------------------------------------------

  /**
   * Expands or collapses the nested query `name` (today: a checkpoint) - the
   * toggle on its divider's pill, and `e`
   * on its focused node. Expanding one collapses whichever was open.
   * Collapsing one hides what it seals: the open checkpoint becomes the next
   * one down the chain, or none for the last. UI-only - the text doesn't
   * change, so no commit.
   */
  /** Collapses whatever nested query is expanded - the lineage strip's `query` chip. UI-only. */
  collapseNested() {
    if (this.expandedNested === undefined) return;
    this.expandedNested = undefined;
    this.recompute();
  }

  toggleNested(name: string) {
    const ast = this.mainAst;
    if (!ast) return;
    const blocks = this.namedBlocks;
    const state = expansionOf(ast, blocks, this.expandedNested);
    const named = blocks.find(b => b.name === name);
    if (named) {
      // A named block: expanding it draws it above the last block.
      // Collapsing it goes back to the last block's default.
      this.expandedNested = state.block === named ? undefined : name;
      this.recompute();
      return;
    }
    const inBlock = blocks.find(b => name.startsWith(b.prefix));
    if (inBlock) {
      // A checkpoint inside an expanded named block: the same chain rule,
      // within that block. Collapsing its last checkpoint leaves the block
      // expanded, showing only its last stage.
      const inner = inBlock.ast.checkpoints ?? [];
      const k = inner.findIndex(c => inBlock.prefix + c.name === name);
      if (k < 0) return;
      const openIndex = state.block === inBlock && state.innerOpen ? inner.findIndex(c => c.name === state.innerOpen) : -1;
      const expanded = openIndex >= 0 && k >= openIndex;
      this.expandedNested = expanded ? (inner[k + 1] ? inBlock.prefix + inner[k + 1].name : inBlock.name) : name;
      this.recompute();
      return;
    }
    const checkpoints = ast.checkpoints ?? [];
    const k = checkpoints.findIndex(c => c.name === name);
    if (k < 0) return;
    const expanded = state.mainOpen >= 0 && k >= state.mainOpen;
    this.expandedNested = expanded ? (checkpoints[k + 1]?.name ?? null) : name;
    this.recompute();
  }

  /**
   * Writes every checkpoint's `|= name` into the text if it isn't there yet
   * (see pine-text.ts's ensureExplicitCheckpointName) and returns `name` -
   * null if no checkpoint by that name exists. The name is the one pine-lang
   * already reports, so the node keeps its id. Goes through the normal
   * commit() pipeline like any other gesture (same serialization, same
   * undo-stack snapshot), even though the query returns the same rows. Called
   * before opening a checkpoint node's picker, since the picker probes with
   * that name.
   */
  async ensureCheckpointPinned(name: string): Promise<string | null> {
    let found = false;
    const plain = this.scopeOf(name).alias;
    await this.commit(base => {
      found = checkpointOpIndex(base.segments, plain) >= 0;
      return base.expression;
    }, name);
    if (!found) return null;
    await this.syncAstToExpression();
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
   * wrong substrings rather than simply being stale. Only a fresh probe of
   * the exact string in `session.expression` has matching ranges.
   *
   * Confirmed live as a checkpoint's first select/where/order/join click,
   * right after pinning a name, building a probe expression from corrupted
   * segments - it came back with zero column hints. A second click worked
   * because Session's debounced build had caught up for real by then.
   */
  private async syncAstToExpression(): Promise<void> {
    // With several query blocks the canvas builds them itself.
    if (this.multiBlock) return this.refreshBlockAsts();
    const expression = this.queryText;
    const ast = await probeBuild(expression, this.session.connectionId);
    if (ast && this.queryText === expression) {
      runInAction(() => {
        this.session.ast = ast;
      });
    }
  }

  /**
   * Shares one in-flight pin commit across concurrent checkpoint-action
   * clicks that land before an earlier one resolves, so they never race
   * into two redundant commit() round trips for the same pin.
   */
  private ensureCheckpointPinnedShared(name: string): Promise<string | null> {
    if (this.checkpointPinInFlight) return this.checkpointPinInFlight;
    this.pinningName = name;
    const pending = this.ensureCheckpointPinned(name).finally(() => {
      runInAction(() => {
        if (this.checkpointPinInFlight === pending) {
          this.checkpointPinInFlight = null;
          this.pinningName = null;
        }
      });
    });
    this.checkpointPinInFlight = pending;
    return pending;
  }

  /**
   * The checkpoint whose first action is waiting on ensureCheckpointPinned,
   * or null - naming only happens on demand (see recompute's comment), so
   * this is the one signal its node has to show that the click landed
   * instead of appearing to do nothing.
   */
  get checkpointPinning(): string | null {
    return this.pinningName;
  }

  /**
   * Opens a checkpoint node's select/where/order/join/path picker - reuses
   * openColumnPicker/openJoinPicker/openPathPicker entirely, treating the
   * checkpoint's name exactly like a table alias (see buildProbeExpression,
   * and pine-text.ts's assignOwners, which gives the steps after a
   * checkpoint to its name).
   *
   * Fast path: once the checkpoint's name is in the text, there's nothing to
   * pin. The first click on an unpinned checkpoint does pay a commit round
   * trip - `checkpointPinning` is what lets its node show a loading state.
   * Committing the actual pick still goes through the full pinning pipeline
   * regardless (see toggleSelectColumn etc.) - this only covers opening the
   * picker.
   */
  async openCheckpointPicker(
    name: string,
    kind: 'select' | 'where' | 'order' | 'join' | 'path',
    anchor: PickerAnchor,
  ) {
    const { block, alias: plain } = this.scopeOf(name);
    const segments = segmentsFromAst(this.textOf(block), this.astOf(block)) ?? [];
    const pinned = isCheckpointPinned(segments, plain) ? name : await this.ensureCheckpointPinnedShared(name);
    if (!pinned) return;
    if (kind === 'join') {
      this.openJoinPicker(pinned, anchor);
      return;
    }
    if (kind === 'path') {
      this.openPathPicker(pinned, anchor);
      return;
    }
    this.openColumnPicker(kind, pinned, anchor);
  }
}
