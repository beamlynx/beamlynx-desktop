# Canvas Mode

An experimental, opt-in graph editor for building a Pine expression by directly
manipulating table nodes instead of typing pipe syntax.

## Why

The classic graph (`Graph.box.tsx`, `store/graph.util.ts`) is a *read-only*
visualization of whatever's already been typed into the input, plus a set of
suggested/candidate nodes you tab through — it shows you the query, it doesn't
let you build one by clicking. Canvas mode inverts that: every click, pick, or
chip-remove on a node is itself the edit. There is no separate "apply" step and
no parallel in-memory graph model to keep in sync with the text — the graph is
always a direct rendering of the current Pine expression's AST, and every
gesture works by splicing that expression's text and letting the normal
build/AST pipeline re-derive the graph from the result.

This buys correctness for free: canvas mode can never drift from what the
expression actually says, because it has no state of its own to drift. The
cost is that every gesture is asynchronous (edit text → build → re-render),
never a synchronous local mutation.

## Enabling it

A toggle in the app header (`components/AppView.tsx`'s `InteractiveViewToggle`)
switches between the classic graph and canvas mode for the active tab, via
`GlobalStore.canvasModeEnabled` / `toggleCanvasMode()`. The preference persists
across reloads (`STORAGE_KEYS.CANVAS_MODE`) and applies globally, not per
session. `components/Session.tsx`'s `MainView` reads it to decide whether the
`'graph'`/`'documentation'` mode slot renders `<Canvas>` or `<GraphBox>`.

## Interaction model

- **Pick a first table** — an empty session shows a single dashed "+ pick a
  table" start node (`nodes/StartNode.tsx`); clicking it opens the table
  picker and overwrites the session's expression wholesale.
- **Per-node action bar** — hovering a table node (or having one of its
  pickers open) reveals a row of actions: `select`, `join`, `where`, `order`,
  `group` (`nodes/TableNode.tsx`). Each opens a dropdown picker
  (`Picker.tsx`) anchored to the click position.
- **Join** lists candidate tables split into "has" (other tables that
  reference this one) and "belongs to" (this table references another),
  mirroring the classic graph's join-direction convention.
- **Select / where / order / group** pickers list column hints; `select` and
  `order` toggle membership and stay open for repeated picks; `where` walks
  into a second step (column → operator/value) before committing; `group`
  toggles this table's contribution to the pipeline's one shared `group:`
  segment.
- **Delete** — an "×" badge on a node, shown only on the last table in the
  pipeline (see Constraints).
- **Multi-select** — box/shift-selecting 2+ nodes shows a floating toolbar
  (`MultiSelectToolbar.tsx`) above the canvas. Only `limit` (a pipeline-wide
  `limit: N`, unrelated to which nodes are selected) is wired; `assign` is
  shown but inert pending a decision on `|=` semantics for canvas mode.
- **Banners** — a small corner banner reports non-nominal states: "Canvas
  mode only supports a single expression block" (multi-block expressions
  aren't modeled at all), "Connecting…" (no build has completed yet for this
  session — e.g. right after a restore, before the backend responds), or "Not
  parsing - showing last valid graph" (a genuine syntax error; the last good
  graph stays on screen, dimmed).

## How it works

**Text splice, not graph mutation.** Canvas mode never parses Pine itself and
never edits `ast` or any node/edge array directly. Every gesture:

1. Re-slices the current expression into `Segment`s using the server's own
   `ast.ranges` offsets (`store/canvas/pine-text.ts`'s `segmentsFromAst`) —
   canvas mode trusts pine-lang's own parse for segment *boundaries*, and only
   redoes attribution of which table alias "owns" each segment
   (`assignOwners`), since `ranges[].alias` itself becomes unreliable once
   `from:` is in play.
2. Computes a new segment list (insert/replace/remove) via a pure function in
   `pine-actions.ts`.
3. Joins the segments back into one string (`toText`) and assigns it to
   `session.expression`.
4. Lets the session's own existing debounced build pipeline (`store/session.ts`)
   fetch a fresh AST for that string.
5. Re-derives the whole graph from that AST (`store/canvas/layout.ts`'s
   `buildCanvasGraph`), via a MobX reaction owned by `CanvasStore`
   (`canvas.store.ts`).

**Ownership.** `assignOwners` walks segments left to right: a table segment
sets the "current" alias to its own (from an explicit `as <alias>`, falling
back to the corresponding entry in `ast['selected-tables']`); a `from: X`
segment resets the current alias to `X`; every other segment inherits
whatever alias is current. `group:`/`limit:` are the two exceptions to "one
owner" — they're pipeline-wide, unowned segments (see below).

**Checkpoints seal the pipeline.** `group:` and `limit:` are pine-lang
"checkpoint" operations (see pine-lang's own `docs/checkpoints.md`) that seal
the pipeline's current shape — nothing can validly follow one in the same
block. Canvas mode always appends new `group:`/`limit:` content, and any new
join or column-clause edit, *before* a trailing checkpoint run rather than
after it: `splitTrailingCheckpoints` (`pine-text.ts`) pops any trailing
`group`/`limit` segments off the list before a gesture computes its insertion
point, and reattaches them at the end afterward. Both `appendTableSegment`
(new joins) and `upsertOwnedSegment` (select/where/order edits) go through
this split — without it, e.g. adding a `where:` to an already-grouped node
would land the new condition after `group:` in the committed text, which
pine-lang treats as invalid. Building a picker's hint probe
(`CanvasStore.buildProbeExpression`) does the same strip, for the same
reason: probing with a trailing checkpoint attached reflects the *sealed*
output's shape (just the grouped columns) rather than the real table the
gesture is about.

**`group:` is a single shared segment.** Unlike `select:`/`where:`/`order:`
(one segment per owning table), grouping on two different nodes doesn't
produce two `group:` segments — it's one segment that each contributing
table's columns are merged into (`getGroupColumns`/`setGroupColumns` in
`pine-actions.ts`), always kept at the pipeline's literal end.

**Alias pinning.** Before computing any gesture, `pine-actions.ts`'s
`getPinnedBase` ensures every table in the expression has an explicit `as
<alias>` — auto-generated aliases are pinned to short, stable ones
(`ensureExplicitAliases`/`makeAlias` in `pine-text.ts`), and every reference to
a renamed alias elsewhere in the expression is rewritten to match. This is a
no-op once everything is already pinned (true after a session's first canvas
gesture). A caller holding an alias captured before this pinning ran (e.g. a
click handler's closure) must resolve it through the returned `aliasMap`
(`resolveAlias`) rather than use it directly, since the node it names may have
just been renamed as a side effect of computing this same base.

**Commit serialization.** `CanvasStore.commit()` chains onto a private
promise (`commitChain`) so two gestures fired in quick succession (e.g. two
picks in the same still-open multi-select picker) never compute their
mutation against the same stale starting text — each one's `pinnedBase()`
call re-probes the *current* expression before mutating.

**Rendering.** `CanvasStore` holds `canvasGraph`, recomputed by a `reaction`
on `[session.expression, session.ast]` (started from `Canvas.tsx`'s
`useEffect`, not the constructor, to survive React 18 StrictMode's
mount/unmount/remount double-invoke in dev). It's `fireImmediately: true`,
since a restored session's own build can already be in flight (or complete)
before this reaction subscribes — without it, a session loaded with a
pre-existing expression could render an empty graph until the next edit.
`CanvasStore.isConnecting` (`session.ast === null`) distinguishes "no build
has completed yet" from a genuine parse failure, which still returns a real
(if largely null) `ast` object — this is what selects the "Connecting…" banner
over "Not parsing" right after a session restore, before the backend has
responded to the first build.

**Layout.** `store/canvas/layout.ts` derives nodes/edges from the AST
(`deriveGraph`) and lays them out with dagre (`layoutNodes`), overriding
dagre's own y-coordinate with strict pipeline-sequence order
(`sequenceYByAlias`) so node 2 always sits below node 1 regardless of which
rank dagre's crossing-minimization puts it on. It's a smaller, independent
model from the classic graph's `store/graph.util.ts`/`store/node-layout.ts` —
no suggested/candidate nodes, no variable/checkpoint containers (see
Constraints).

## Constraints

- **Single block only.** An expression with more than one blank-line-separated
  block isn't modeled — the canvas shows a banner and nothing else.
- **Only the last node is removable.** Removing an interior node isn't a pure
  text splice: later joins that reach off "whatever's current" rather than an
  explicit `from:` would silently retarget. Handling that means re-deriving
  explicit `from:` resets for every downstream join — not implemented, so the
  UI only offers delete on the pipeline's last table.
- **No checkpoint/variable nodes.** There's no way to join onto, or select
  from, a `group:`/`limit:` checkpoint's own sealed/aggregated output as a
  node in its own right (the classic graph's variable/checkpoint container is
  the prior art — see `docs/classic-graph-node-types.md`). Checkpoints today only ever
  sit at the pipeline's literal end.
- **No `update!`/`delete!` support.** Canvas mode only models read pipelines.
- **Multi-select `assign` is inert.** Shown in the toolbar but not wired to
  any mutation — pine-lang's `|=` variable/checkpoint assignment needs
  multi-block support canvas mode doesn't have.
- **Column-function forms are lossy on toggle.** Select/order chips are always
  written as plain `alias.column`; toggling a column that was hand-typed with
  a function form (e.g. `created_at => month`) replaces it with the plain
  column reference.
- **Bare where-conditions aren't chips.** A hand-typed condition with no
  `where:`/`w:` prefix (legal Pine, e.g. `a = 1` right after a table) is
  correctly attributed to its owning table but doesn't render as an editable
  chip — canvas-generated Pine always writes the explicit prefix, so this only
  affects hand-typed expressions.

---

## Implementation

### Segment/splice core (`store/canvas/pine-text.ts`)

- `Segment`/`SegmentKind` — one pipe segment (`text`, character offsets into
  the original expression, its classified `kind`, and its `owner` alias).
- `segmentsFromAst` — segments the expression using `ast.ranges`, then calls
  `assignOwners` to attribute each one to a table alias by a left-to-right
  walk. Returns `null` when the expression doesn't currently parse.
- `upsertOwnedSegment` — insert/replace/remove the one segment of a given
  `kind` owned by a given alias; used for `select:`/`where:`/`order:`. Splits
  off trailing checkpoints first (see `splitTrailingCheckpoints`) so the scan
  for "last segment owned by this alias" can't mistake an inherited-owner
  checkpoint for real ownership.
- `appendTableSegment` — appends a new table (optionally preceded by a
  `from:` reset) before any trailing checkpoint run.
- `splitTrailingCheckpoints` — pops a trailing run of `group`/`limit`
  segments off the end of the list; shared by both of the above and by
  `CanvasStore.buildProbeExpression`.
- `ensureExplicitAliases` — pins an explicit alias onto every table lacking
  one and rewrites every qualified reference to match; returns
  `{expression, changed, aliasMap}`.
- `isRemovableNode`/`removeNode` — last-table-only removal (see Constraints).
- `makeAlias` — short, pine-style alias generation (table initials, numeric
  suffix on collision).

### Gesture functions (`store/canvas/pine-actions.ts`)

Pure functions, each taking a `PinnedBase` (`{expression, ast, segments,
aliasMap}`, from `getPinnedBase`) and returning the next expression string:
`join`, `setSelectColumns`/`getSelectColumns`, `addWhereCondition`/
`removeWhereConditionAt`, `addOrderColumn`/`removeOrderColumnAt`/
`getOrderColumns`, `deleteNode`, `setLimit`, `getGroupColumns`/
`setGroupColumns`. `resolveAlias` looks up a possibly-stale alias through
`PinnedBase.aliasMap`.

### Store (`store/canvas/canvas.store.ts`)

`CanvasStore` (one per session, held in a `CanvasStoreContext`): owns
`canvasGraph`, `picker` state, node `positions`, and `selectedAliases`. Its
`commit*` methods (`commitJoin`, `commitSelectColumns`, `toggleSelectColumn`,
`commitWhere`, `toggleOrderColumn`, `toggleGroupColumn`, `deleteNode`,
`commitLimit`, …) each compute a `PinnedBase`, call the matching
`pine-actions.ts` function, and assign the result — prettified via a probe
build — back onto `session.expression`. `openTablePicker`/`openJoinPicker`/
`openColumnPicker` populate `picker` from speculative builds
(`store/canvas/probe.ts`'s `probeBuild`, a dedicated stateless `HttpClient`
that never touches `session.expression`/`session.ast`).

### Layout (`store/canvas/layout.ts`)

`deriveGraph` (AST → nodes/edges, scoped to `selected-tables` plus the
in-progress table) and `buildCanvasGraph` (adds dagre-based positions,
overridden on the y-axis by `sequenceYByAlias`).

### Types (`store/canvas/canvas.model.ts`)

`CanvasTableNodeData`, `CanvasStartNodeData`, `CanvasGraph`, `PickerRequest`
(`table`/`join`/`select`/`where`/`order`/`group`), `PickerState`
(`list`/`where-value` modes). Deliberately independent of `model.d.ts`'s
`PineNode`/`SelectedNodeData` family used by the classic graph.

### Components (`components/canvas/`)

- `Canvas.tsx` — `Flow` (ReactFlow instance) and `Canvas` (creates the
  `CanvasStore`, provides it via context, starts its reaction). Renders the
  start node when the graph is empty, the banners described above, and
  delegates node/edge rendering to `nodes/TableNode.tsx`/`nodes/StartNode.tsx`
  and `edges/TraceEdge.tsx`.
- `nodes/TableNode.tsx` — action bar, chip rows (`sel`/`where`/`order`/
  `group`), delete button (last node only), join-direction handles.
- `nodes/StartNode.tsx` — the empty-graph "+ pick a table" node.
- `Picker.tsx` — the dropdown for both list-mode (table/join/select/where/
  order/group) and the where-value two-step flow; keyboard nav, click-outside
  close, filter-as-you-type.
- `MultiSelectToolbar.tsx` — the floating toolbar shown for 2+ selected
  nodes; only `limit` is wired.

### Integration points

- `components/Session.tsx`'s `MainView` switches between `<Canvas>` and
  `<GraphBox>` based on `global.canvasModeEnabled`.
- `components/AppView.tsx`'s `InteractiveViewToggle` flips
  `GlobalStore.canvasModeEnabled` (persisted via `STORAGE_KEYS.CANVAS_MODE`).
- `store/session.ts` is otherwise unmodified for canvas mode — it owns
  `expression`/`ast`/the debounced build reaction regardless of which graph
  view is active; canvas mode only reads those fields and writes
  `session.expression`.
