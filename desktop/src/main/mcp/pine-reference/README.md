# Pine reference (MCP)

Hand-maintained Markdown that teaches Pine to an AI agent. It reaches the agent two ways: pushed
inline by `../format.ts` whenever an expression fails to parse, and pulled on demand by the
`get_pine_doc` tool (see `../stdio-relay.ts`). This is not general repository documentation —
that's `docs/` at the repo root.

**These files contain no SQL, deliberately.** Pine is the translation layer between an agent and
the database, and the only place query restrictions can be enforced (see
`beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md`). An agent shown SQL starts
reasoning in SQL and trying to send it, which makes that layer meaningless — so no tool output
and no doc here shows a `SELECT`. Examples describe what an expression *does* in words instead of
showing an equivalent query.

That is the main way these diverge from [beamlynx.com](https://github.com/beamlynx/beamlynx.com)'s
documentation pages (`src/pages/documentation/*.tsx`), which do show SQL translations — the right
call for a human evaluating whether to adopt Pine, the wrong one here. The overlap is fine, not a
bug to fix: the two serve different audiences and are allowed to drift in wording.
`pine-lang/docs/*.md` is a third, separate thing again — aimed at pine-lang's own contributors,
and mixed with internal implementation notes these files intentionally leave out.

**These files are written by hand, not generated.** They follow the Pine in `../pine` of the same
commit, which is the Pine the app bundles. Not beamlynx.com.

Keep them current in the same PR that changes Pine:

1. Every change an agent would write differently, or would want to know about, gets a line here:
   a new operation, a new function, a new kind of join, or something that used to fail and now
   works, or the reverse.
2. A new operation gets its own topic file, a row in `pine-lang.md`'s table, and an entry in
   `OPERATION_DOCS` in `../format.ts`, so a parse error on it brings its topic along.
3. Run `scripts/check-pine-reference.sh`. It parses every example here with the parser in
   `../pine`. CI runs it on every PR.

`npm test` (`__tests__/pine-reference.test.js`) checks the rest: every topic `format.ts` names has
a file, `pine-lang.md` lists every topic, every topic has an example, and none shows SQL.

Two rules when editing:

- **Mark an example that must fail** with `-- parse error` at the end of its line. The check script
  then expects it to fail.
- **Older examples may end with `-- pine-lang #N`.** That marked a feature merged in pine-lang
  before the app bundled it, from when the two were separate repos. The script lists each marked
  example that parses: remove those markers. New examples don't need one.
- **Every topic needs real examples.** These are a fallback the agent is handed at the exact
  moment it got something wrong, so an empty example block is worse than no topic at all. Four
  files used to ship with literally empty code fences.
- **Filenames are the topic ids.** `where.md` is the `where` topic, and `format.ts` maps parse
  errors to topics by operation name — a rename breaks that mapping silently.

Staged into the packaged app via `scripts/stage-docs.sh` (a plain copy into `resources/docs/`,
picked up by `extraResources` in `electron-builder.yml`) — not generated from anywhere at build
time.
