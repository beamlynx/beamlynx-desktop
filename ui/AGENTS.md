# Agent Development Guidelines

---

## Landing changes

Every change goes through a pull request, including one that is going to be merged immediately. Never commit to `main` directly.

`main` is unprotected here, so nothing stops a direct push — which is exactly why it is worth stating. The PR is where the change gets explained; a commit pushed straight to the branch leaves whoever reads it next to reconstruct the reasoning from the diff. Merge it immediately if you like (`gh pr merge --merge --admin`), but open it.

Merge commits, not squash or rebase, matching the existing history. Merged branches are left in place.

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

## Crediting Contributors

When updating the changelog (CHANGELOG.md and utils/changelog.data.ts), contributors should be credited in the changelog entries themselves. The format is:

- Add contributor attribution at the end of each changelog entry in parentheses, e.g.:
  - `- Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider. (by @username)`
  - Or for multiple contributors: `(by @username1, @username2)`