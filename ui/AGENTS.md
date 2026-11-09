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

## Never store a database's address, only its hash

A database's address is its type, host, port and name, such as `postgres://localhost:5432/shop`. The desktop app calls it the database key (`databaseKeyOf` in beamlynx-desktop's `src/main/database-key.ts`). It tells anyone who reads a file where your databases are.

- Anything that needs to remember a database stores `databaseKeyHash`, the SHA-256 of the key. This covers recipes, column widths, links and logs.
- Never write `databaseKey`, a host, a port or pine-lang's connection id (`host:port:dbname`) to local storage, beamlynx.db, a log, usage stats or anything sent off the machine.
- The UI may hold `ConnectionInfo.databaseKey` in memory, to match rows an older app wrote. It never persists it.
- The only place an address is kept on disk is the desktop's connection store (`credential-store.ts`). It needs the address to connect.

A hash hides the address from someone reading the file. It is not a secret: anyone who guesses the address can hash it and compare. So never use the hash as a credential.

Known exception, still to fix: the UI's local storage keeps pine-lang's connection id, which is `host:port:dbname`. It is in each saved tab (`pine-sessions`, `connectionId`) and in the connection colours (`pine-connection-colors`). Don't add more.

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