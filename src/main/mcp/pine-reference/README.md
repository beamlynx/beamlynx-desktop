# Pine reference (MCP)

Hand-maintained Markdown that teaches Pine to an AI agent. It reaches the agent two ways: pushed
inline by `../format.ts` whenever an expression fails to parse, and pulled on demand by the
`get_pine_doc` tool (see `../stdio-relay.ts`). This is not general repository documentation —
that's `docs/` at the repo root.

**These files contain no SQL, deliberately.** Pine is the translation layer between an agent and
the database, and the only place query restrictions can be enforced (see
`beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md`). An agent shown SQL starts
reasoning in SQL and trying to send it, which makes that layer meaningless — so no tool output
and no doc here shows a `SELECT`. Examples describe what an expression *does* in words instead of
showing an equivalent query.

That is the main way these diverge from [beamlynx.com](https://github.com/beamlynx/beamlynx.com)'s
documentation pages (`src/pages/documentation/*.tsx`), which do show SQL translations — the right
call for a human evaluating whether to adopt Pine, the wrong one here. The overlap is fine, not a
bug to fix: the two serve different audiences and are allowed to drift in wording.
`pine-lang/docs/*.md` is a third, separate thing again — aimed at pine-lang's own contributors,
and mixed with internal implementation notes these files intentionally leave out.

**Keeping this in sync is a manual, human-or-Claude judgment call, not an automated build step** —
the same convention `beamlynx-ui/CHANGELOG.md` and `utils/changelog.data.ts` already use (two
independently maintained files, not one generated from the other). When beamlynx.com's Pine
documentation changes in a way that matters for an AI agent using `run_query`, update the
corresponding file here too — minus the SQL.

Two rules when editing:

- **Every topic needs real examples.** These are a fallback the agent is handed at the exact
  moment it got something wrong, so an empty example block is worse than no topic at all. Four
  files used to ship with literally empty code fences.
- **Filenames are the topic ids.** `where.md` is the `where` topic, and `format.ts` maps parse
  errors to topics by operation name — a rename breaks that mapping silently.

Staged into the packaged app via `scripts/stage-docs.sh` (a plain copy into `resources/docs/`,
picked up by `extraResources` in `electron-builder.yml`) — not generated from anywhere at build
time.
