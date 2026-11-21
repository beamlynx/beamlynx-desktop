# The interface

The app's interface: the Pine and SQL editors, the canvas that draws a query, and the results grid. It is a Next.js app with MobX stores. The desktop app shows a static export of it in its window. The same code also runs as a web page.

The rules for the whole repo, and how to run and check the app, are in `../AGENTS.md`. To see a change here, run `bin/beam web` from the repo's root, or `bin/beam dev` for something only the desktop app does.

## Where things are

| Path | What it holds |
|---|---|
| `pages/index.tsx`, `components/AppView.tsx` | The page and the app's layout. |
| `store/global.store.ts` | `GlobalStore`: the tabs, the saved connections, and what is open. |
| `store/session.ts` | `Session`: one tab. Its text, its connection, its results. |
| `store/client.ts` | Every call to the Pine server. |
| `store/canvas/`, `components/canvas/` | The canvas: how a query becomes a drawing, and how editing the drawing edits the text. Read `docs/canvas-mode.md` first. |
| `components/results-grid/` | The results grid, drawn on a canvas element by Glide Data Grid. |
| `components/settings/`, `components/recipes/` | Settings, and the Library of saved queries. |
| `store/mcp-query.ts`, `components/McpBridge.tsx` | Where an AI agent's tool calls run, in a tab the person can watch. |
| `store/preferences.ts` | Saved preferences: local storage, and `beamlynx.db` on desktop. |
| `utils/changelog.data.ts` | What's New in the app. It mirrors `CHANGELOG.md`, and is updated at a release. |
| `desktop.d.ts` | The calls the desktop app offers, as `window.beamlynxDesktop`. Matches `../desktop/src/preload/index.ts`. |
| `__tests__/` | Unit tests. `npm test` runs them. They test stores and utilities, not rendered components. |

**Formatting:** run Prettier only on the lines you change. Many existing files aren't Prettier-clean, and formatting a whole file buries a small change in a large diff. Don't run `npm run format`.

## Canvas Mode

See [docs/canvas-mode.md](./docs/canvas-mode.md) for how the experimental interactive canvas
(text-splice architecture, checkpoint handling, alias pinning) actually works today.

## The masking policy

Users see it as the **masking policy**. The code, the stored settings and the pine-lang API still call it an access policy (`accessPolicies`, `access-policy`). Don't rename those: older apps read the same stored settings.

It masks output only. A masked column comes back as `xxxxx`, but a query may still filter, sort and join on it with a value it supplies. This is deliberate. Don't add UI that treats a filter or a join on a masked column as a leak. The full principle is in `pine-lang/docs/access-policy.md`, "What it protects".

## Never store a database's address, only its hash

A database's address is its type, host, port and name, such as `postgres://localhost:5432/shop`. The desktop app calls it the database key (`databaseKeyOf` in beamlynx-desktop's `src/main/database-key.ts`). It tells anyone who reads a file where your databases are.

- Anything that needs to remember a database stores `databaseKeyHash`, the SHA-256 of the key. This covers recipes, column widths, links and logs.
- Never write `databaseKey`, a host, a port or pine-lang's connection id (`host:port:dbname`) to local storage, beamlynx.db, a log, usage stats or anything sent off the machine.
- The UI may hold `ConnectionInfo.databaseKey` in memory, to match rows an older app wrote. It never persists it.
- The only place an address is kept on disk is the desktop's connection store (`credential-store.ts`). It needs the address to connect.

A hash hides the address from someone reading the file. It is not a secret: anyone who guesses the address can hash it and compare. So never use the hash as a credential.

Why a hash: two people with the same database get the same hash, so a recipe or anything else can be shared for that database without showing where it is. A saved connection's id is random and local to one client. It shows nothing, but it also can't be matched across clients.

On desktop, preferences are saved in beamlynx.db as well as local storage (`store/preferences.ts`). So the same rule applies to every preference:
- Saved tabs (`pine-sessions`) keep the tab's connection id (`connectionId`). On desktop that is the saved connection's id, never pine's address-based one.
- Connection colours (`pine-connection-colors`) are keyed by `databaseKeyHash`.

Older versions saved pine's id in both, and saved tabs' saved-connection id as `profileId`. `GlobalStore` still reads those values (`restoredConnectionId`, `migrateConnectionColors`), and rewrites them once the saved connections load (`snapshotSessions`). Keep reading both forms whenever you change a stored key, so existing users lose nothing.

## A tab has one connection id

`Session.connectionId` is the only thing that says which database a tab is on. Its requests, its label, the connection menu's tick, its masking and the delete confirmation all read it. On desktop it is the saved connection's id, and pine-lang opens the pool under that same id. In the browser it is pine's own id.

Never add a second per-tab id, an app-wide "current connection", or a default a tab falls back to. Each of those once let a tab show one database and run on another. Code that runs a query reads the tab's `connectionId` when the person acts. A tab with none runs nothing, and pine-lang refuses a request that names no connection.

Known exception: the web build has no saved connections, so its tabs and colours still use pine's id.

## What runs is taken when the person acts

Anything that runs a query or a write takes its target once, at the moment the person (or an agent) acts, and passes it along as values. That target is the connection, the expressions and the keys. Never read the tab again after an `await`: the tab, its connection, its text and its rows can all change while a request is out.

- **Rows carry their stamp.** `Session.resultSource` records the connection and expressions of the run that produced the rows on screen. Grid edits, the JSON panel and result refreshes start from it, never from the editor's text.
- **Each edit gets its own session** (`GlobalStore.createEditSession`). No session is shared between edits.
- **A traversal keeps the connection it walked on.** It runs and names that connection only.
- **Moving a tab to another database clears its results** (`Session.clearResults`).
- **Anything that runs without a press of Run sends `allowWrites: false`,** and pine-lang refuses the write. A text check for `delete!` is for a friendlier message only.
- **Fail closed.** An agent's query on a connection agents may not use gets `SHOW_NOTHING`, not `[]`.

## Reaching pine-lang from a hosted dev copy

The UI calls pine-lang at the browser's `http://localhost:33333` (or the desktop bridge's URL). A dev copy served from somewhere else (a cloud preview) sets `PINE_SERVER_PROXY_URL` (e.g. `http://localhost:33333`) for `next dev`: next.config.js then forwards `/api/v1/*` to it, and `getBaseUrl` in `store/client.ts` returns `''` so the UI calls pine on its own origin. Unset, nothing changes. Not for the desktop static export.

## Library and Settings share one docked slot

The sidebar's Library (saved recipes, `components/recipes/LibraryPanel.tsx`) opens in `SettingsDock`, the slot Settings uses. `GlobalStore.showLibrary` and `showSettings` replace each other: anything that opens Settings closes Library. The one exception is Ctrl+, (`toggleSidebarPanel`). It closes whichever of the two is open, or reopens the one open last (`lastSidebarPanel`). While Library is open, `activeKeyboardPanel` is `'library'` (not `'settings'`), so Settings' Up/Down rail keys and the canvas keys stay off; Library listens for its own keys on the document. Ctrl+O opens the Library. Its Use inserts through `components/recipes/insertRecipe.ts`.

Desktop-only UI can be checked in a browser: run the dev server with `NEXT_PUBLIC_DESKTOP=1` and give the page a stand-in `window.beamlynxDesktop` (the project QA guide's `desktop-bridge` simulator does this).

## What loads with the app

Anything most sessions never use loads the first time it is shown, not with the first page:
- Vim mode: `components/vim-mode.ts`.
- The SQL formatter: `utils/formatSql.ts`. It returns SQL unformatted until the formatter loads.
- Settings and Library, which `SettingsDock` prewarms when the browser is idle.
- The changelog, the analysis dialog, the bar chart, traversal results, the export dialog and the JSON inspector, through `next/dynamic`.

Keep new heavy, rarely used parts out of the first load the same way. Check with `next build`'s First Load JS for `/`.

The results grid draws Text cells only. `next.config.js` aliases `marked` and `react-responsive-carousel` (Glide's Markdown and Image cells) to a stub. Read `components/results-grid/glide-unused-peers.ts` before using another cell kind.

## Crediting Contributors

When updating the changelog (CHANGELOG.md and utils/changelog.data.ts), contributors should be credited in the changelog entries themselves. The format is:

- Add contributor attribution at the end of each changelog entry in parentheses, e.g.:
  - `- Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider. (by @username)`
  - Or for multiple contributors: `(by @username1, @username2)`