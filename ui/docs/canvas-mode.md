# Canvas Mode

A graph editor for building a Pine expression by directly manipulating table
nodes instead of typing pipe syntax. It's the default graph editor in New
Layout, and an opt-in alternative to the classic graph in Legacy Layout — see
[terminology.md](./terminology.md) for how the two layouts and the two graph
modes fit together.

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

In New Layout (the default), Canvas mode is always on — there's no toggle for
it there (`components/NewLayoutView.tsx` renders `<Canvas>` unconditionally).

In Legacy Layout, a toggle inside the graph panel itself
(`components/Session.tsx`'s `InteractiveViewToggle`, bottom-right of the
graph/canvas widget - not the app header, which only ever refers to layout,
see `docs/terminology.md`) switches between the classic graph and canvas mode
for the active tab, via `GlobalStore.canvasModeEnabled` / `toggleCanvasMode()`.
The preference persists across reloads (`STORAGE_KEYS.CANVAS_MODE`) and
applies globally, not per session. `components/Session.tsx`'s `MainView`
reads it to decide whether the `'graph'`/`'documentation'` mode slot renders
`<Canvas>` or `<GraphBox>`.

## Auto-run

Whenever a canvas gesture commits a new expression (`CanvasStore.applyExpression`/
`undo`/`redo`), the session automatically re-runs the query 150ms later
(`Session.notifyCanvasCommit`/`autoRunTrigger`, `store/session.ts`) — this is
safe specifically because every canvas commit is already backend-confirmed
valid via `probeBuild` before it's applied (see "How it works" below), unlike
hand-typed Pine text, which can be mid-typing/invalid. The 150ms debounce
exists only to collapse a burst of rapid picks (e.g. a still-open
multi-select picker) into one run — the query itself typically runs in a
handful of milliseconds once fired, confirmed live by profiling the network
calls around a single canvas commit. Toggle: `GlobalStore.autoRunEnabled`
(`toggle-auto-run` command / Settings / the bolt icon in the canvas
toolbar — `CanvasToolbar.tsx`, lit when on), default on. Gated on
`session.inputMode === 'pine'` — auto-run stays off while a session is
mid-hand-edit of raw SQL, so it never runs stale SQL left over from before a
mode switch.

## The Pine/SQL panel

New Layout can show an editable Pine or SQL text panel alongside the canvas —
reuses `Input.tsx` unmodified (same PINE/SQL toggle and editors it's always
had), so hand-editing and point-and-click editing stay in sync automatically
through the same `session.expression`/`session.ast`.

There is exactly one panel, not two — "Pine panel" and "SQL panel" are two
different *modes* of opening it (`GlobalStore.togglePinePanel`/
`toggleSqlPanel`, `store/global.store.ts`), so only one can ever be visible at
a time by construction, not by an extra mutual-exclusion check. Toggling the
mode that's already open closes the panel; toggling the other mode while the
panel is open just switches modes without closing it. Reachable from the
canvas toolbar's PINE/SQL buttons (`CanvasToolbar.tsx`, lit when that mode is
the one currently open) or `Ctrl`/`Cmd`+`Shift`+`E` (Pine) / `Ctrl`/`Cmd`+`Shift`+`S`
(SQL). The panel and its divider (drag to resize, persisted per
`STORAGE_KEYS.NEW_LAYOUT_PANEL_WIDTH`/`NEW_LAYOUT_PANEL_HEIGHT`) live in
`components/NewLayoutView.tsx`'s `LeftPane`, not under `components/canvas/` —
canvas mode itself has no notion of this panel; it only reads/writes
`session.expression` the same as any other gesture.

Hiding the panel while a session's `inputMode` is `'sql'` force-switches it
back to `'pine'` (`GlobalStore.hideNewLayoutPanel`) — otherwise that session's
auto-run would stay silently off (see Auto-run above) with no visible editor
left on screen to explain why.

**The canvas keeps working while the panel is in SQL mode.** `session.ts`'s
build reaction (the one thing that populates `session.ast`, which canvas
mode's whole graph is derived from — see "How it works" below) used to skip
outright whenever `inputMode === 'sql'`, from before canvas mode existed: SQL
mode meant "no Pine editor on screen, nothing to build for." Canvas mode
breaks that assumption — it renders a graph regardless of which text panel is
open next to it, and needs a fresh `ast` after every gesture just the same.
The guard now also checks `GlobalStore.canvasActive`, so it only actually
skips when there's no canvas to keep in sync (Legacy Layout's classic
SQL-only mode). Without this, a canvas edit made while the SQL panel was open
silently went nowhere — the graph and the SQL panel's own text both stayed on
whatever they showed before the edit — and a session restored with
`inputMode` already `'sql'` from a previous visit got stuck on the
"Connecting…" banner forever, since nothing else was left to trigger a build.

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
- **Delete** — an "×" badge on a node. Any table can be removed, not just the
  last one (see Constraints for what happens to joins that depended on it).
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

## Keybindings

Canvas mode is built around a vim-style modal keyboard layer
(`hooks/useCanvasKeybindings.ts`) so a whole query can be built without
touching the mouse — click once to focus a node, then everything after that
is a bare letter. It's a single `keydown` listener, separate from the app's
shared modifier-combo registry (`utils/keybindings.ts`'s `KEYBINDINGS`, used
for things like `Ctrl`+`K`/`Ctrl`+`Shift`+`E`): these are single, bare letters
(`s`, `w`, `i`, …), which only make sense to interpret while canvas mode is
the active view and nothing else on the page wants keystrokes — folding that
into the shared registry would mean threading canvas-only state through a
registry every other consumer has nothing to do with.

**Two modes**, exactly like vim's:
- **Normal mode** — the default. Letters are commands (open a picker, delete
  a node, undo). This is the only mode any of the shortcuts below fire in.
- **Insert mode** — a picker is open. Every keystroke goes to *it*
  (`Picker.tsx`'s own listeners), not the canvas — see "Inside a picker"
  below. `canvasStore.mode` is derived straight from `picker.open`, so there's
  no separate flag to fall out of sync.

The current mode is always visible bottom-left of the canvas
(`CanvasModeIndicator`, in `CanvasToolbar.tsx`) — "normal" or "insert", plus,
in normal mode, the exact letters armed for whichever node is currently
focused (e.g. `s w o g i x` for a table with something to delete, `s w o i x`
for a checkpoint, `i` alone for the empty-canvas start node). This legend is
what makes the shortcuts discoverable without memorizing them up front.

**Moving focus** (normal mode only):

| Key | Action |
| --- | --- |
| `j` / `↓` | Focus the next node in pipeline order |
| `k` / `↑` | Focus the previous node |

Focus order is the pipeline's own left-to-right sequence
(`CanvasStore.orderedFocusTargets`), with a checkpoint frame interleaved right
after the last table it wraps — there's no second navigation axis (no
left/right), since the pipeline is a single strict sequence, not a 2D graph
to roam.

**Acting on the focused node** (normal mode only):

| Key | Action |
| --- | --- |
| `i` or `\|` | Join a new table onto the focused one (`\|` doubles as `i` since a join is "pipe a new table on" — Pine's own mental model). On the empty-canvas start node, opens the first-table picker instead. |
| `s` | Open the select-columns picker |
| `w` | Open the where-condition picker |
| `o` | Open the order-by picker |
| `g` | Open the group-by picker (not offered on a checkpoint node — grouping an already-grouped result is a different question, not implemented) |
| `x` | Delete the focused node — a table if `removable`, or a checkpoint's whole `group:`/`limit:` run if focused on a frame (its member tables become plain nodes again, not deleted themselves) |
| `u` | Undo the last canvas gesture |
| `Shift`+`U` | Redo |
| `Ctrl`/`Cmd`+`Z` | Undo (same action as `u` — the combo most people already reach for) |
| `Ctrl`/`Cmd`+`Shift`+`Z`, `Ctrl`+`Y` | Redo (same action as `Shift`+`U`) |

A checkpoint (frame) node routes `s`/`w`/`o`/`i`/`x` through
`openCheckpointPicker` instead of the per-table picker methods, but the same
letters apply — the legend at the bottom of the screen always reflects which
set is active for whatever's focused. `x` is unavailable on a table with
`removable: false` (only the tables still sealed *inside* an unconsumed
checkpoint — see Constraints) and simply does nothing if pressed.

For a keyboard-opened picker, there's no click position to anchor its dropdown
to — `useCanvasKeybindings.ts`'s `anchorFor` reads the focused node's own
rendered `getBoundingClientRect()` instead, so the picker still opens right
next to the node whether it was triggered by mouse or keyboard.

**Inside a picker** (insert mode) — `Picker.tsx` takes over completely:

| Key | Action |
| --- | --- |
| `↓` or `Tab` | Next item in the (filtered, grouped) list |
| `↑` or `Shift`+`Tab` | Previous item |
| `Enter` or `,` | Select the highlighted item — `,` lets a comma-separated list of columns (select/order/group) go in without a keypress between each one |
| `Escape` | Close the picker, discarding anything not yet committed, and return to normal mode |
| any other character | Filters the list as you type |

**Why keystrokes don't leak.** Every keydown first checks
`session.textInputFocused` (a flag the Pine/SQL CodeMirror editors and the
picker's own filter input maintain on focus/blur) and whether the event
target is inside an `input`/`textarea`/`contenteditable` element — so typing
a column name into a filter box, or hand-editing Pine/SQL in the panel, never
triggers a single-letter canvas action by accident. The whole layer is also a
no-op unless `global.canvasActive` is true (New Layout, or Legacy Layout with
canvas mode on) and `canvasStore.mode === 'normal'` — a picker being open is
enough on its own to suspend every letter shortcut above until it closes.

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

**`group:` is a single shared segment.** Unlike `select:`/`order:` (one
segment per owning table) or `where:` (one segment per *condition* - see
below), grouping on two different nodes doesn't produce two `group:`
segments — it's one segment that each contributing table's columns are
merged into (`getGroupColumns`/`setGroupColumns` in `pine-actions.ts`),
always kept at the pipeline's literal end.

**`where:` is one segment per condition, not a shared comma list.** A second
filter on the same table appends a new `where:` step (`appendOwnedSegment` in
`pine-text.ts`) rather than growing one segment's comma-separated body -
pine-lang ANDs every `where:` step together regardless of which table it's
on, so this needs nothing more than appending. `removeWhereConditionAt`
(`pine-actions.ts`) removes the target segment outright; its `index` is this
alias's conditions in pipeline order, matching the order `ast.where` reports
them (see layout.ts's `whereChips`), since a new condition always lands right
after this alias's existing segments.

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
- **Removing an interior node can leave a dangling join.** Deleting a table
  that a later table's join implicitly depended on (no explicit `from:`, just
  "whatever's current") re-splices the expression and lets whatever's left
  become the new implicit target — pine-lang itself decides whether that's
  meaningful. If it isn't (the join no longer has a real column to connect
  on), pine-lang returns a "hint-less" relation (non-null, but with no
  columns and no resolution — see `join-helper`'s own comment in pine-lang's
  `src/pine/ast/table.clj`) rather than failing outright, and `layout.ts`'s
  `addJoins` renders that the same as any other unresolved join (dashed,
  warning-colored, no column labels) rather than a plain solid line.
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
  `kind` owned by a given alias; used for `select:`/`order:`. Splits off
  trailing checkpoints first (see `splitAtCheckpoint`) so the scan for "last
  segment owned by this alias" can't mistake an inherited-owner checkpoint for
  real ownership.
- `appendOwnedSegment` — the multi-segment counterpart: inserts a NEW segment
  of a given `kind` without touching any existing one of that kind. Used for
  `where:`, where each condition is its own step (see above).
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
  close, filter-as-you-type. `,` doubles as `Enter` on the list.
- `MultiSelectToolbar.tsx` — the floating toolbar shown for 2+ selected
  nodes; only `limit` is wired.
- `CanvasToolbar.tsx` — the **canvas toolbar** (informally "the icon bar"),
  pinned top-left: undo, redo, auto-run (a bolt icon; lit when on), a PINE/SQL
  panel toggle (New Layout only — see "The Pine/SQL panel" below), plus one
  optional caller-supplied extra action (New Layout's orientation toggle).
  Same file also exports `CanvasModeIndicator`, the bottom-left
  normal/insert status line with the focused node's armed-key legend.

### Integration points

- `components/Session.tsx`'s `MainView` switches between `<Canvas>` and
  `<GraphBox>` based on `global.canvasModeEnabled`.
- `components/AppView.tsx`'s `InteractiveViewToggle` flips
  `GlobalStore.canvasModeEnabled` (persisted via `STORAGE_KEYS.CANVAS_MODE`).
- `store/session.ts` is otherwise unmodified for canvas mode — it owns
  `expression`/`ast`/the debounced build reaction regardless of which graph
  view is active; canvas mode only reads those fields and writes
  `session.expression`.
