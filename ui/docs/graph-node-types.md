# Graph Node Types

The query graph shows a table's role in the pipeline through a small vocabulary of node
states. These are the terms to use when discussing or changing graph behavior — exact
implementation (which file, which flag) drifts and is always faster to re-derive by
reading the code than to trust a doc for.

- **Selected** — a table already confirmed into the pipeline. Numbered by its position.
- **Current** — the one selected node presently active; new suggestions attach to it. Not
  a separate kind of node, just a state on top of "selected" (or a variable/checkpoint
  container).
- **Suggested** — a candidate table not yet piped into the expression.
- **Candidate** — the one suggested node currently highlighted (e.g. via cycling through
  suggestions). A state on top of "suggested," not a separate kind.
- **Variable / checkpoint container** — stands in for a sealed variable reference or an
  in-expression checkpoint. It replaces a table's position in the pipeline rather than
  sitting beside it, so it's numbered and connects to relations the same way a selected
  table would.

A suggested/candidate node can also represent a variable reference rather than a real
table — it keeps its suggested/candidate state but is styled to look like the container
it will become once piped in.

## Handles

- A selected/variable node shows one connection point per distinct relation on each side.
- A suggested/candidate node has at most one relation (to the current node), so it shows a
  handle only on the relevant side — none at all if there's no relation yet (e.g. the very
  first table typed, before anything gives it a relation to describe).
- A handle's column label can be:
  - a real column name, once known,
  - deliberately blank — several candidates that would all point to the same unknown
    column collapse onto one shared, unlabeled handle,
  - a placeholder — the current node's own referenced column, guessed because the query
    language has no primary-key concept and only ever tells us the *other* side's column.
    A real confirmed relation always overrides this guess.
- Two different things can look like "we don't know this value": a field can be entirely
  absent (no relation to describe at all) or explicitly empty/null (a relation exists, but
  this particular detail isn't exposed). Don't conflate the two — a falsy check that
  doesn't distinguish "absent" from "false" will treat "no relation" the same as "known to
  not be true," and show a connection that doesn't exist.
