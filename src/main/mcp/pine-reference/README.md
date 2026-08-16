# Pine reference (MCP)

Hand-maintained Markdown that exists to power the MCP server's `list_pine_docs`/`get_pine_doc` tools
(see `../stdio-relay.ts`) so an AI agent can learn Pine's syntax instead of guessing at it — not
general repository documentation (that's `docs/` at the repo root).

These deliberately duplicate content that also lives, in a different form, in
[beamlynx.com](https://github.com/beamlynx/beamlynx.com)'s documentation pages
(`src/pages/documentation/*.tsx`) — that's fine, not a bug to fix. The two serve different audiences
and are allowed to drift in wording: beamlynx.com teaches a human visiting the marketing site, these
teach an AI agent. `pine-lang/docs/*.md` is a third, separate thing again — aimed at pine-lang's own
contributors, and mixed with internal implementation notes these files intentionally leave out.

**Keeping this in sync is a manual, human-or-Claude judgment call, not an automated build step** —
the same convention `beamlynx-ui/CHANGELOG.md` and `utils/changelog.data.ts` already use (two
independently maintained files, not one generated from the other). When beamlynx.com's Pine
documentation changes in a way that matters for an AI agent using `run_query`, update the
corresponding file here too.

Staged into the packaged app via `scripts/stage-docs.sh` (a plain copy into `resources/docs/`,
picked up by `extraResources` in `electron-builder.yml`) — not generated from anywhere at build time.
