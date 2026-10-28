# Agent Development Guidelines

---

## Keeping This File Up to Date

When working in this codebase, if you discover a new pattern, convention, architectural decision, or corrected assumption that would be useful for future interactions, **add it to this file**. This includes:

- New or clarified conventions (naming, structure, error handling, etc.)
- Architectural patterns or decisions that are not obvious from the code alone
- Deprecated patterns and their replacements
- Module boundaries and ownership (e.g. which module owns which concept)
- Corrections to previously held assumptions

## Canvas Mode

See [docs/canvas-mode.md](./docs/canvas-mode.md) for how the experimental interactive canvas
(text-splice architecture, checkpoint handling, alias pinning) actually works today.

## The masking policy

Users see it as the **masking policy**. The code, the stored settings and the pine-lang API still call it an access policy (`accessPolicies`, `access-policy`). Don't rename those: older apps read the same stored settings.

It masks output only. A masked column comes back as `xxxxx`, but a query may still filter, sort and join on it with a value it supplies. This is deliberate. Don't add UI that treats a filter or a join on a masked column as a leak. The full principle is in `pine-lang/docs/access-policy.md`, "What it protects".

## Crediting Contributors

When updating the changelog (CHANGELOG.md and utils/changelog.data.ts), contributors should be credited in the changelog entries themselves. The format is:

- Add contributor attribution at the end of each changelog entry in parentheses, e.g.:
  - `- Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider. (by @username)`
  - Or for multiple contributors: `(by @username1, @username2)`