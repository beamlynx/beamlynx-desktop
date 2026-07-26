# Agent Development Guidelines

---

## Keeping This File Up to Date

When working in this codebase, if you discover a new pattern, convention, architectural decision, or corrected assumption that would be useful for future interactions, **add it to this file**. This includes:

- New or clarified conventions (naming, structure, error handling, etc.)
- Architectural patterns or decisions that are not obvious from the code alone
- Deprecated patterns and their replacements
- Module boundaries and ownership (e.g. which module owns which concept)
- Corrections to previously held assumptions

## Graph Node Types & Naming Conventions

The graph (`components/Graph.box.tsx`, `store/graph.util.ts`, `model.d.ts`) renders four
conceptually distinct kinds of node, but only three `PineNode` variants (`PineSelectedNode`,
`PineSuggestedNode`, `PineVariableNode` — see `model.d.ts`). "Selected/current" and
"suggested/candidate" are each a single type with a state flag, not separate types:

| Name | `data.type` | Component | What it means |
|---|---|---|---|
| **Selected** | `'selected'` | `SelectedNodeComponent` | A table already confirmed into the pipeline (`ast['selected-tables']`). Solid border, numbered order badge (top-left), alias shown under the table name. |
| **Current** | `'selected'` or `'variable'` | (same as selected/variable) | Not a separate type — whichever selected/variable node's alias equals `ast.context` (see `contextNode` in `generateGraph`). This is the node new suggestions/hints attach to. |
| **Suggested** | `'suggested'` | `SuggestedNodeComponent` | A candidate table from `ast.hints.table` — not yet piped into the expression. Solid amber/orange border. |
| **Candidate** | `'candidate'` | `SuggestedNodeComponent` (same component) | The *one* suggested node currently highlighted via Tab-cycling (`session.candidateIndex` → `graph.candidate`). Distinct background/border/text colors (`--node-candidate-*`), and its connecting edge is highlighted the same way (see `Graph.box.tsx`'s `useEffect` over `candidateNode`). |
| **Variable / checkpoint container** | `'variable'` | `VariableNodeComponent` | Represents a sealed variable (`\|= name` referenced from a later expression) or an in-expression checkpoint (a `group:`/`limit:` sealed into a CTE). It *replaces* a table in the pipeline rather than sitting alongside it, so it gets the same order badge and per-relation handles a selected node would. Dashed border, collapsible (click toggles `innerTables`). |

A suggested/candidate node can *also* represent a variable reference (when the underlying
`TableHint.schema` is `null` — see `client.ts`) — it's still `type: 'suggested'`/`'candidate'`,
just styled with the dashed variable look (`isVariable` in `SuggestedNodeComponent`) since it
hasn't been piped in yet.

### Handle conventions (`NodeHandle`, `RelationHandles.tsx`)

- A selected/variable node gets one handle per *distinct* FK relation on each side
  (`leftHandles`/`rightHandles`), keyed by column so two relations sharing a column collapse
  onto one handle. Left = this node is the child/target of the relation; right = this node is
  the parent/source.
- A suggested/candidate node has at most one relation, so at most one handle, on whichever side
  matches its `data.parent` (`true` → right/source, `false` → left/target). `data.parent` is
  `undefined` — not `false` — for a no-context hint (the very first table typed, with no
  relation to describe yet), and that case renders **no handle on either side**. Don't treat
  `!data.parent` as "child, show a handle" — that's falsy for `undefined` too and shows a phantom
  handle for a relation that doesn't exist. Check `=== false`/`=== true` explicitly.
- A handle's id is `${prefix}:${column}` (`prefix` is `'l'`/`'r'`) and its `column` can be:
  - a real column name (a confirmed join, or a hint that exposes one),
  - `''` (empty string) — reserved for the "collapsed multiple suggested children onto one
    parent-side handle" case, intentionally rendered as a plain anonymous dot with no label,
  - `'•'` — a hardcoded placeholder for "the current node's own referenced column, not yet
    confirmed by any join." pine-lang has **no primary-key concept anywhere in its pipeline**
    (only FK constraints are introspected — see `db/postgres.clj`), so even a confirmed join
    only ever tells us the *child's* FK column, never the parent's own. `'•'` is a stand-in,
    not derived data — a real confirmed join, when one exists, always wins over it.
- `TableHint.column`/`.parent`/`.heuristic` (`client.ts`) are optional/nullable because
  pine-lang sometimes omits them (no-context hints) and sometimes sends `null` explicitly
  (variable-related hints) — these are two different "unknown" states, not one.

## Crediting Contributors

When updating the changelog (CHANGELOG.md and utils/changelog.data.ts), contributors should be credited in the changelog entries themselves. The format is:

- Add contributor attribution at the end of each changelog entry in parentheses, e.g.:
  - `- Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider. (by @username)`
  - Or for multiple contributors: `(by @username1, @username2)`