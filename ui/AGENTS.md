# Agent Development Guidelines

---

## Keeping This File Up to Date

When working in this codebase, if you discover a new pattern, convention, architectural decision, or corrected assumption that would be useful for future interactions, **add it to this file**. This includes:

- New or clarified conventions (naming, structure, error handling, etc.)
- Architectural patterns or decisions that are not obvious from the code alone
- Deprecated patterns and their replacements
- Module boundaries and ownership (e.g. which module owns which concept)
- Corrections to previously held assumptions

## Graph Node Types

See [docs/classic-graph-node-types.md](./docs/classic-graph-node-types.md) for the vocabulary used
to discuss the classic, read-only query graph (selected/current/suggested/candidate/
variable-container, handle conventions).

## Canvas Mode

See [docs/canvas-mode.md](./docs/canvas-mode.md) for how the experimental interactive canvas
(text-splice architecture, checkpoint handling, alias pinning) actually works today.

## Crediting Contributors

When updating the changelog (CHANGELOG.md and utils/changelog.data.ts), contributors should be credited in the changelog entries themselves. The format is:

- Add contributor attribution at the end of each changelog entry in parentheses, e.g.:
  - `- Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider. (by @username)`
  - Or for multiple contributors: `(by @username1, @username2)`