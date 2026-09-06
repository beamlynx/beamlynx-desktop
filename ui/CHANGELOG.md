# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.59.0] - 2026-09-06
### Added
- Canvas mode: hovering a table node now spotlights that table's columns in the Results grid below, so it's easy to see which columns come from which joined table without needing to turn on the "Table colors" preference.
- Canvas mode: clicking an existing `order` chip now opens an Asc/Desc popover to change its direction, instead of reopening the column-add list. Arrow keys or the `a`/`d` mnemonics flip it; a "remove" action deletes the chip.

### Fixed
- Results grid: right-clicking a cell and choosing "Filter" now scopes the generated `where:` to the table that cell's column actually belongs to (`alias.column`), instead of an unqualified column name that silently filtered whichever table the query's pipe ended on.

## [0.58.0] - 2026-09-06
### Breaking
- Minimum required pine-lang server version is now 0.43.0 (up from 0.42.0) - the version that introduces `? table`, which canvas mode's new "path" action and the Pine editor's autocomplete both depend on.

### Added
- The Pine text editor's autocomplete (Ctrl+Space) now completes `? table` path searches too - shows the discovered routes once the target names a real table (reachability-filtered destination names before that), and accepting one replaces the whole `? target` fragment, not just the typed table name.
- Canvas mode: a node's action bar is now `select | where | join | +`, with order, group, and the new "path" action tucked behind the `+` (their own keyboard shortcuts - `o`, `g`, `p`, and now `+` itself to open the overflow directly - still work regardless of whether `+` is ever clicked). "Path" finds every way to reach a table that isn't directly joinable - not just the next hop, but multi-hop routes through the schema too - and lets you pick one to add all the way to the destination in one go.
- Canvas mode: click a join's icon to pick Inner, Left, or Right. It's the same two-circle diagram most SQL join references use - inner shades just the overlap, left/right shades one whole side plus the overlap - so the type reads at a glance with no text label needed.
- Canvas mode: click an existing `where` condition, selected column, order column, or group column to reopen it for editing, instead of removing it and adding a new one.
- Canvas mode: Shift+J and Shift+K step through the whole pipeline as one list - each node, then everything configured on it (its incoming join, selected columns, where conditions, order columns, group columns), then the next node's. Enter or Space opens whichever one is highlighted; Delete, Backspace, or `x` removes it.

### Changed
- Canvas mode: a resolved join's line is now a plain neutral color instead of the theme's accent - the accent now lives on the join-type icon itself (Inner/Left/Right), so it marks the one clickable, meaningful thing on that edge rather than the whole line. Broken and heuristic-only joins keep their own distinct (non-neutral) colors, unchanged.

### Fixed
- Canvas mode: adding an operation (`select`, `where`, `join`, ...) while the expression already ended in a stray `|` (typed by hand in the Pine panel, or left over from an earlier edit) left that dangling pipe in place after the new operation, instead of dropping it.
- Canvas mode: hovering a node revealed its action bar but didn't move keyboard focus there - the node last focused via the keyboard kept its "current" border even while a different node was being hovered. Hovering now moves focus, the same as it already does when navigating with the keyboard - including onto a specific chip or a join's own icon, which now show their own highlight on hover, exactly like Left/Right already does, instead of the whole node's border staying lit alongside it.
- Canvas mode: clicking an action button (`+`, `select`, `where`, ...) without the mouse having freshly crossed into the node first (it was already resting there from an earlier action) opened the picker but left the *previously* focused node's border showing, instead of moving focus to the node actually being acted on.
- Settings -> Connections: a connection's access policy could be set to "None" (unrestricted access - e.g. a local/sandbox database), but the UI still treated that exactly like an inactive policy - blocking MCP from turning on, and disabling "None" outright while MCP was already on. "None" is a deliberate choice, not a missing one, and the desktop app's own policy enforcement already treated it that way; the UI now matches, with wording that says so ("no redaction", not "select a policy").

## [0.57.0] - 2026-09-02
### Added
- Tabs can be reordered by dragging them, in both the horizontal strip and the vertical rail. Dragging to either end of a long rail scrolls it. The new order also drives Ctrl+Tab cycling and survives a reload.
- New Settings -> Appearance -> Tabs setting: show the session tabs as a vertical rail down the left side instead of the horizontal strip across the top, with a new-tab button at the top of the rail. Applies to both layouts, and is also available as a "Toggle Tab Orientation" command.

### Changed
- Tab close buttons now appear on hover of that tab, instead of on every tab at once. Hovering a tab also tints it and brightens its label.

### Fixed
- "Only apply to MCP server" (desktop) kept flipping back off. It was saved correctly to disk, but reloading the connections list -- which happens after almost any connection action -- rebuilt the in-memory list without this field, so the toggle (and the behavior behind it) reverted to off until the next app restart.

## [0.56.0] - 2026-09-02
### Breaking
- Requires pine-lang 0.42.0 or later (was 0.41.0) -- lets MCP-run queries below show up prettified (see Fixed).

### Added
- New "Toggle Layout Orientation" command (command palette): switch New Layout between side-by-side and top/bottom without using the canvas toolbar icon.

### Changed
- Database Connections list (desktop): a connection's rename field, access policy, MCP access toggle, "only apply to MCP server" toggle, refresh, and delete are now behind an expand arrow instead of five icons crammed onto one row. The expanded panel orders them the way you'd actually use them -- pick a policy, then turn MCP on -- instead of leaving that dependency to a tooltip.

### Fixed
- New Layout: dragging the Pine/SQL panel's resize divider in top/bottom view no longer moves it in the opposite direction.
- MCP-run queries now show up nicely formatted in the Pine panel instead of the raw, unformatted expression the agent sent.
- Canvas's `where` picker: a long column name no longer gets hard-clipped mid-character (now truncates with `…` and shows the full name on hover), the operator and value fields have visible spacing between them instead of sitting flush together, and opening the picker now focuses the operator dropdown first instead of the value field.

## [0.55.0] - 2026-08-31
### Breaking
- Requires pine-lang 0.41.0 or later (was 0.39.0) -- the access policy feature below needs its new `access-policy` param.

### Added
- New Settings -> Access Policy section: create, rename, and delete named policies, each a toggleable set of rules deciding which columns show real values instead of `xxxxx` (Postgres types, foreign keys, `_id`-suffixed columns).
- Database Connections: pick which policy applies to each connection. MCP can only be turned on once its connection has an active policy, and the policy can't be cleared or swapped for an inactive one while MCP is on.
- New per-connection toggle, "Only apply to MCP server": see real data on your own queries without changing what the agent sees. Off by default.
- Redacted columns return `xxxxx` straight from the database query -- the real value never leaves it. Applies to every tab, not just MCP's.

### Changed
- "Vim keybindings" no longer gates the canvas's own `s`/`w`/`o`/`g`/`x`/`u`/`U`/`i` shortcuts -- only `j`/`k` and the query editor's vim mode are.
- The "Vim keybindings" preference is now app-wide (was per-tab) -- every open tab reflects the same value immediately.

### Fixed
- MCP queries now always re-read the current access policy before running, instead of a stale copy from app boot.
- Fixed an intermittent "X is not a function" from a duplicate MCP query listener left behind by dev-mode Fast Refresh.
- Fixed canvas keyboard shortcuts (e.g. `x`) getting stuck after picking a value in the canvas picker with Settings open.
- Fixed a canvas checkpoint's `|= agg` name reappearing after being deliberately removed, and the first click after (re)naming a checkpoint using stale query results.
- Tab order (New Layout): the notification bell and Settings gear no longer steal early Tab stops; connections in the docked Settings panel are now reachable by Tab (Enter/Space to switch).
- Settings no longer loses its own keyboard shortcuts to the canvas the moment focus lands somewhere neither claims.
- Arrow keys/`j`/`k` no longer scroll Settings' rail while a toggle switch has focus.

## [0.54.0] - 2026-08-30
### Added
- The join picker (canvas mode) now shows which foreign-key column a candidate uses (Pine's own disambiguation syntax, e.g. `.created_by`) whenever two candidates in the same group would otherwise name the same table and be indistinguishable -- a single unambiguous candidate for a table still renders with no extra text, same as before.

### Changed
- "Vim keybindings" (Preferences) now also gates the canvas's `j`/`k`-as-letters and single-letter shortcuts (`s`/`w`/`o`/`g`/`x`/`u`/`U`/`i`), not just the query editor -- previously those fired unconditionally regardless of the setting. Arrow-key navigation and Ctrl+Z/Ctrl+Y undo/redo are unaffected (they aren't vim-specific).

### Fixed
- Canvas's `j`/`k`/single-letter shortcuts (New Layout) no longer fire once the docked Settings panel is open, or while typing in the Pine/SQL panel -- keyboard input now routes to whichever panel actually has focus, falling back to the canvas when nothing else does. Opening Settings (however it's triggered -- the gear icon, `Ctrl`/`Cmd`+`,`, the command palette) hands it focus immediately, rather than only once something inside it is clicked. Settings' rail (Database Connections/Appearance/Preferences/MCP/About) also gained its own `j`/`k`/Arrow Up/Down navigation once it holds focus.

## [0.53.0] - 2026-08-28
### Added
- Zen mode (New Layout, command palette only for now -- no dedicated key): a graph-only, distraction-free view that hides the header, tab strip, and Results, and turns auto-run off for as long as it's on (restored to whatever it was set to once you exit).
- `Ctrl`/`Cmd`+`Shift`+`,` toggles Settings open and closed, matching the gear icon.
- A "↻ Reconnect" action next to the connection label in the header, shown whenever a tab's assigned database connection isn't live (e.g. the database wasn't running yet when the app started) -- previously the only way to retry was switching tabs or reloading the whole app.

### Changed
- `Ctrl`/`Cmd`+`,` now toggles Settings (matching Slack's and most native Mac apps' Preferences convention) instead of the SQL panel. `Ctrl`/`Cmd`+`.` still toggles the Pine panel; `Ctrl`/`Cmd`+`Shift`+`.` now toggles the SQL panel.
- Settings in New Layout is now a docked panel on the left, spanning the full height (tab strip included) and staying open across tab switches, instead of living inside whichever tab was active when it was opened. No longer closes on Escape (that was a Modal convention; a docked panel isn't in anyone's way, and Escape is needed elsewhere, e.g. closing a picker).

### Fixed
- Canvas mode's node labels, chips, and toolbars now scale with the Text Size setting (previously only the rest of the app did) and are larger at every size to begin with. The keybinding legend at the bottom-left of the canvas is now bigger and shows each shortcut key in bold accent color instead of one uniformly dimmed string.
- Settings no longer opens as a floating modal on top of the canvas in New Layout (see "Changed" above) -- so it never covers the canvas or results while you tune a change against them. Changing Text Size while the Appearance panel is open no longer reflows the panel itself, which previously scrolled the Text Size control out from under you. Its border, and its top/bottom edges, now match Canvas's own pane instead of being the only misaligned, unbordered panel in New Layout.

## [0.52.0] - 2026-08-25
### Added
- A new Appearance section in Settings: three built-in themes (Light, Dark, Sepia), each with its own coordinated colors rather than a shared palette with a swappable accent. Picking one also determines light/dark behavior for the editor and canvas.
- Independent Interface font (System, Inter, IBM Plex Sans) and Code font (IBM Plex Mono, JetBrains Mono, Fira Code, System Monospace) choices, replacing one shared monospace-only font setting. Fira Code's ligatures now actually render.
- A Text size setting (Small/Medium/Large) that scales the app's text and spacing without resizing panels or the canvas.

### Changed
- "Toggle Theme" (command palette) now cycles through all three themes instead of switching between two.
- Canvas keyboard navigation between tables (arrow keys, or `j`/`k`) now wraps from the last table back to the first instead of stopping there.

### Fixed
- Two-finger trackpad scroll zoomed the graph instead of panning it, in both the classic graph and canvas mode -- it now pans, matching the Miro/Figma convention. The classic graph's mouse controls also now match canvas mode's: right-click drags the canvas, left-click drags a node or rubber-band-selects, with no modifier key needed for either.

## [0.51.2] - 2026-08-23
### Changed
- New Layout's Canvas/Results split now uses one consistent 8px gap on all sides and between the two panes, instead of a slightly different, unexplained width for the pane divider (10px) versus the surrounding margins (8px), and no gap at all at the bottom.

### Fixed
- Desktop's "update ready" notification said "restart" twice (in the message and the button) and its "Restart Now" button had no visible border or fill, reading as plain text rather than something to click.

## [0.51.1] - 2026-08-23
### Changed
- A connection's color is now set from Settings > Database Connections (click its status dot), alongside renaming and MCP access, instead of from the top-left connection picker. The picker's dot is now just a status indicator.
- The Updates modal shows a short title for each change first, with its fuller explanation (when there is one) underneath -- easier to skim than a flat bullet list.
- The new layout's Pine/SQL panel shortcuts are now `Ctrl`/`Cmd`+`.` for Pine and `Ctrl`/`Cmd`+`,` for SQL, replacing `Ctrl`/`Cmd`+`Shift`+`E`/`S`.
- A canvas filter now composes as its own `where:` step instead of joining a comma-separated list on one shared `where:` clause. Multiple filters on the same table still combine with AND, same as before.

### Fixed
- Table colors (Preferences > Table colors) disappeared the instant the SQL panel was opened, even though the results on screen hadn't gone stale -- opening the panel compared the newly-shown SQL text against the last-run Pine expression and always found a mismatch.
- Auto-run silently stopped firing on canvas edits whenever the SQL panel was the visible one, since a canvas gesture's own auto-run was gated on the Pine panel specifically being shown rather than on canvas mode being active.

## [0.51.0] - 2026-08-23
### Added
- A Canvas-first two-pane layout (Canvas and Results, side by side or stacked), on by default for new sessions. Switch back to the classic sidebar layout any time from the header, Settings, or the command palette.
- Auto-run: with canvas mode active, the query now runs automatically after each canvas edit instead of waiting for Run. Toggle it off from Settings or the command palette if you'd rather run explicitly.
- An optional Pine or SQL text panel next to the canvas in the new layout, for hand-editing alongside point-and-click use (`Ctrl+Shift+E` for Pine, `Ctrl+Shift+S` for SQL).
- `|` now also opens the join picker in canvas mode, alongside `i` -- a join is "pipe a new table onto this one".
- In canvas mode's select/order/group/join pickers, `,` now behaves like `Enter`, so a comma-separated list of columns doesn't need a keypress between each one.
- Conventional `Ctrl`/`Cmd`+`Z` and `Ctrl`/`Cmd`+`Shift`+`Z` (and `Ctrl`+`Y`) now undo/redo in canvas mode too, alongside `u`/`Shift+U`.
- Any table can now be removed from the canvas, not just the last one added. If another table's join was relying on the removed one implicitly, it now resolves against whatever's left instead -- if that connection isn't real, it already shows the existing dashed/warning-colored styling used for any other join the server can't resolve cleanly.
- The new layout's Pine/SQL panel can now be resized by dragging the divider between it and the canvas, instead of a fixed size.
- `Ctrl`/`Cmd`+`Tab` and `Ctrl`/`Cmd`+`Shift`+`Tab` move between tabs, matching a browser's own tab switching (`Ctrl`+`PageDown`/`PageUp` also work). Desktop app only -- a real browser already owns these for its own tabs.
- A PINE/SQL toggle in the canvas toolbar (new layout) opens the same panel `Ctrl`/`Cmd`+`Shift`+`E`/`S` already did, so it's reachable without a keyboard shortcut.

### Removed
- The "Compact mode" preference and its command-palette entry. It only ever affected the classic sidebar layout, and no longer had any effect once the new Canvas-first layout became the default -- the new layout already switches to a stacked arrangement on small screens on its own.

### Fixed
- Canvas mode's keyboard shortcuts (`s`/`w`/`o`/`g`/`i`/`x`/`u`) stopped responding after any query ran, and stayed unresponsive until the page was reloaded.
- A sidebar height saved from an earlier resize could overflow its own panel and stretch the graph/results panel taller than the window, showing an unwanted scrollbar.
- The join action's letter hint highlighted `j`, not `i` -- `i` is the actual shortcut for it.
- The checkpoint/container node's action bar didn't show which letter shortcuts were active while it had keyboard focus, unlike a table node's.
- Opening the new layout's Pine/SQL panel auto-focused its text editor, silently blocking every canvas keybinding until you clicked away from it once.
- Auto-run waited a fixed 500ms after every canvas edit before running, made to feel far slower than the query itself (typically a few milliseconds) -- cut to 150ms, still enough to collapse a burst of rapid picks into one run.
- A canvas gesture whose speculative build came back without a usable result (rather than failing outright) could crash the whole app instead of falling back gracefully.
- A join that no longer had a real column to connect on (for example, after deleting the table in between two others) could render as a plain, confident-looking solid line instead of the dashed warning styling used for any other join the server can't resolve -- and the table on the other end showed no columns at all. Both are now treated the same as any other unresolved join.
- Canvas edits silently did nothing while the new layout's SQL panel was open -- the graph and the SQL text both stayed frozen on whatever they showed before the edit. A session that reloaded with the SQL panel already open got stuck showing "Connecting…" forever for the same reason.

### Changed
- The canvas/graph mode switch moved out of the header and into the graph panel itself, since it only applies there; the header now only ever refers to which overall layout is active.

## [0.50.0] - 2026-08-22
### Breaking
- Requires pine-lang 0.39.0 or later -- the new connection refresh icon (below) needs its `POST /api/v1/connections/:id/reindex` endpoint.

### Added
- A refresh icon next to each live connection in Settings > Database Connections. Use it to pick up tables or columns added to the database after the connection was first opened, instead of restarting the server.
- A connection can now be renamed: an optional name field when adding it, and a pencil icon on its row in Settings > Database Connections afterward. Desktop app only, since that's the only place a connection's name is actually saved anywhere.
- Keyboard control for canvas mode. Move between nodes with the arrow keys or `j`/`k`, and use a single-letter shortcut for the highlighted node's operations: `s` select, `w` where, `o` order, `g` group, `i` join (or add the first table, from the start node), `x` delete, `u`/`Shift+U` undo/redo. The highlighted node is shown the same way as the query's current node, and its operations stay visible without needing to hover it. A checkpoint (a `group:`/`limit:` step) can now be navigated to and deleted the same way.

### Fixed
- The delete icon on a Database Connections row used to sit in a different column depending on whether that row also showed the refresh icon (only shown for a live connection), so rows didn't line up. It now sits in the same place on every row.
- On the desktop app, the graph view could get stuck showing "Connecting…" forever even once the connection was live. The very first query build for a tab, sent before its connection actually had a live pool yet, failed silently and nothing ever retried it once the connection came up. The connection reconnect step now asks for a fresh build once it succeeds.
- The MCP switch on a Database Connections row (desktop app) looked like a general on/off toggle for the connection itself. Replaced with a small robot icon, lit when MCP access is on -- consistent with the row's other icon actions, and specific about what it actually controls.

### Changed
- The Settings About section now labels its version row correctly ("Server version" -- it was always the connected pine-lang server's version, not this app's own). It also shows the UI's own version, and, in the desktop app, the installed app's own version.

## [0.49.0] - 2026-08-16
### Added
- A Settings page, opened from the gear icon next to the notification bell. It brings database connections, app preferences, and MCP setup into one place instead of scattered menus.
- MCP support for the desktop app. An AI agent like Claude Code can run queries directly against your saved connections. Turn it on per connection from Settings.
- A database type field when adding a connection. Picking a type fills in its default port automatically.
- "Open Settings" and "New Database Connection" command palette entries.

### Changed
- "Connections" is now called "Database Connections" everywhere in the app, to leave room for a future connection to the Pine server itself.
- Adding a connection now uses tabs to switch between typing in the fields and pasting a connection string, instead of an expandable section.
- The old onboarding screens (the Docker "Welcome" page and the "Pine server is not running" page) are gone. The app now goes straight to its normal view.

## [0.48.0] - 2026-08-13
### Breaking
- Requires pine-lang 0.38.1 or later.

### Added
- An experimental interactive view for building Pine queries by clicking through tables in a graph instead of writing text -- toggle it from the header, next to the version number.

### Changed
- Unified the app's visual design (the "schematic/blueprint" look) across the whole app.

## [0.47.0] - 2026-08-09
### Changed
- Each tab now connects to its own database lazily, only when it becomes the active tab, instead of every tab eagerly following whatever connection was picked most recently. Opening the app no longer forces the connections picker open -- it silently reconnects the tab you were on. A tab whose connection isn't live yet shows a hollow (outline-only) dot in its own connection's color, filling in solid once connected.

### Fixed
- Clicking a graph node (e.g. expanding a variable/checkpoint container) was mistaken for a Tab keypress, stealing focus into the Pine input and jumping the candidate-relation highlight to the first suggestion.
- Picking a connection from the auto-opened startup picker could open an unrelated new tab and silently change which connection *other*, already-open tabs appeared to be using -- both tabs and the toolbar were falling back to display whatever connection was last selected globally instead of each tab's own assigned connection.
- (Desktop) A tab restored from before this session-connection rework had no saved-profile id to reconnect from, so it silently never auto-connected -- it now falls back to resolving one from its connection id.
- (Desktop) The connections picker's "currently active" checkmark could point at a stale profile after switching tabs silently reconnected a different one in the background -- it's now derived directly from the active tab's own connection, so it can't drift.
- Every tab's assigned connection was silently wiped back to "not connected" on every app launch, before pine-server (a fresh process each launch) had any chance to reconnect it -- restarting the app looked like every saved connection had been forgotten. A tab's assigned connection is no longer cleared just because it isn't live *yet*; liveness is now tracked separately (see the lazy per-tab reconnect above).
- Failing to reconnect a saved profile (deleted/renamed on disk, or its DB unreachable) via the connections picker only logged to the console -- now shows the same connection-error banner as every other connection failure.
- (Desktop) The connections list/picker always showed a solid dot for every saved connection regardless of whether it actually had a live pool -- it was comparing pine's own connection id against the saved-profile id, two different id spaces that never matched. Not-yet-connected entries now correctly show as a hollow (outline-only) dot, matching the toolbar and tab indicators.
- (Desktop) On launch, a tab's connection briefly displayed as its raw `host:port` id instead of its saved name, before flashing to the real name once the saved-profile list finished loading -- looked like the connection had been renamed. Shows a neutral placeholder during that gap instead of the misleading raw id.

## [0.46.2] - 2026-08-04
### Breaking
- Requires pine-lang 0.37.2 or later.

### Fixed
- A failed attempt to connect (unreachable DB, wrong credentials, etc.) used to fail silently — the toolbar just stopped showing a "connecting" spinner with no indication anything went wrong. A new error toast now surfaces the actual failure.
- A previously-used connection restored from a past session could show as "connected" in the toolbar even when nothing was actually connected this session (pine-server's connection pools don't survive a process restart). Restored connections are now checked against the backend's live state before being trusted.
- When disconnected, the app now automatically opens the connections picker (or the add-connection form, if none exist yet) instead of leaving a dead "Not connected to database" label with no obvious next step.

## [0.46.1] - 2026-08-03
### Fixed
- The playground's shared connection could be deleted from the connection picker, breaking the playground for everyone else using it; the delete action is now hidden (and refused as a backstop) in playground mode.
- The changelog's relative-date label showed "-1 days ago" for a same-day entry when the local timezone is behind UTC.

## [0.46.0] - 2026-08-03
### Added
- Tabs (Pine/SQL text, input mode, connection) are now restored on reload instead of always starting from a single blank session.
- `Ctrl/Cmd+S` ("Save Tab") downloads the active tab's Pine expression as a `.pine` file.
- New "List Database Connections" / "New Database Connection" command palette entries.

### Fixed
- Pressing Tab while the graph had focus was falling through to React Flow's own node/edge navigation instead of cycling through Pine completion candidates.

## [0.45.2] - 2026-08-02
### Fixed
- The notification bell's color (for unread updates) was showing as blue instead of the intended warm accent.

## [0.45.1] - 2026-08-02
### Fixed
- In the desktop app, saved connections weren't showing their color or proper name in the connection picker.
- The "Database Connection" dialog no longer pops up automatically when you already have saved or active connections to pick from -- it now only does that when there's genuinely nothing to connect to yet.

### Changed
- The notification bell no longer shakes when there's something new -- it still changes color, just more subtly.

## [0.45.0] - 2026-08-02
### Added
- Beamlynx can now be downloaded and run as a desktop app, with no Docker required.
- New keyboard shortcuts in the desktop app: `Ctrl/Cmd+K` for the Command Palette, `Ctrl/Cmd+T` for a new tab, `Ctrl/Cmd+W` to close a tab.
- The desktop app now shows update progress in-app, instead of only in the background.
- In the desktop app, your saved connections are now remembered between sessions, encrypted using your device's own secure storage. The hosted/browser version is unchanged -- it still never stores credentials.

### Changed
- The small server-version label is now hidden in the desktop app, since it has its own separate release notes.

## [0.44.0] - 2026-07-31
### Added
- Pine variables: write multi-expression queries and name/reuse an intermediate result with `|= name` in a new multi-expression editor. Variables and checkpoint (`group:`/`limit:`) results render in the graph as collapsible container nodes, with the same FK-relation handles and join-type-aware (solid/dashed) edges as regular tables.
- The database connection dialog accepts a Postgres connection string (`postgresql://user:password@host:5432/database`) and parses it to fill in the host/port/user/password/database fields; manual entry stays the default, with pasting a string as a secondary, collapsible option. The connection string field is masked like a password so password managers can autofill it.
- The connection picker can remove a saved connection (click its trash icon to arm, click again to confirm), backed by pine-lang's new DELETE endpoint.

### Fixed
- Typing lag in the Pine input that worsened with more expression blocks/variables (unnecessary CodeMirror rebuilds on every keystroke).
- The autocomplete dropdown now shows a "Loading..." state instead of flashing "Nothing found" while results are still loading.

### Breaking
- Minimum required server version is now `0.37.0`.

## [0.43.0] - 2026-05-21
### Added
- Connection picker in each tab: click the connection dot to switch which database that tab queries (by @Koziar).

### Breaking
- Minimum required server version is now `0.36.0`.

## [0.42.0] - 2026-05-05
### Added
- Per-session database connections: each tab can connect to a different database. Queries from that tab always use its own connection.
- Connection color indicators: each database connection gets a distinct color (green, red, blue, orange, purple, teal, pink, yellow) shown as a dot in the header and tab bar. Click the dot to pick a different color. Colors persist across page refreshes.

### Breaking
- Minimum required server version is now `0.35.0`.

## [0.41.0] - 2026-05-04
### Added
- Command palette entries to copy the current Pine expression and the current SQL.
- Copying SQL (command palette or SQL panel click) prepends each line of the Pine expression as `--` line comments above the SQL.

## [0.40.0] - 2026-04-20
### Added
- Column hints for the `update!` / `u!` operation. Typing `u!` or `u! col = val,` suggests remaining assignable columns.

### Breaking
- Minimum required server version is now `0.33.0`.

## [0.39.1] - 2026-03-30
### Added
- Multi-table `update!` support: assignments targeting different tables now run as separate UPDATE queries.

### Fixed
- Recursive delete no longer follows heuristic relations. Only tables with real foreign key constraints are included in the generated DELETE statements.
- `update!` now correctly uses table aliases when columns are qualified (e.g. `c.name`).

## [0.39.0] - 2026-02-18
### Fixed
- Sticky column headers in the results table. The table header now stays visible when scrolling through results. (by @Koziar)

## [0.38.0] - 2026-02-16
### Added
- Table color decoration for Pine expressions and results. Expression segments and result columns are color-coded by table to help visualize the relationship between them. (collaboration with @Koziar)

### Changed
- Use server-side prettified expression and ranges from the build endpoint instead of client-side expression parsing. This fixes incorrect highlighting when string values contain `|` characters.

### Breaking
- Minimum required server version is now `0.31.0`.

## [0.37.1] - 2026-02-08
### Fixed
- Notification bell animation no longer affects scrollbars by preventing layout shifts during animation.

## [0.37.0] - 2026-02-08
### Added
- Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider. (by @Koziar)

### Changed
- Improved dark theme candidate node contrast for better visibility. (by @Koziar)

## [0.36.0] - 2026-01-09
### Added
- Command palette for finding and running commands. This is similar to how VS Code lets you find and run commands.

## [0.35.1] - 2025-12-26
### Added
- Support for hints at cursor position.
- Notification bell animates when there are unread updates.

### Changed
- Pine operations are not shown in the autocompletion.

### Fixed
- The candidate node was not being selected when cycling through suggestions.
This was only happening when there were multiple nodes with the same table name.

## [0.34.0] - 2025-12-08
### Added
- Option to render bar chart when results have 2 column with string and number values respectively.
- Prompt user to enter filename for CSV export.

## [0.33.0] - 2025-10-21
### Added
- Show the changelog.

## [0.32.0] - 2025-10-19
### Added
- Support for comments (line and block) in the pine language e.g.:

```
-- This is a line comment
/* This is a
   multi-line
   block comment */
```

### Fixed
- The graph was shown when there was an error in the expression.

### Changed
- Showing a toggle button to switch between pine and sql modes.

## [0.31.5] - 2025-09-16
### Changed
- Updated intro page with examples that are compatible with the playground.
- Support for `?data=<encoded-object-with-expression>` URL parameter which is json encoded object containing the expression.

## [0.31.2] - 2025-09-11
### Changed
- Using a company toggle button to switch input modes between pine and sql.


## [0.31.1] - 2025-09-11
### Changed
- Update model is not shown by default. It is shown when the inspect icon is clicked.

## [0.31.0] - 2025-09-10
### Added
- Showing an update modal before updating a record.

### Changed
- Farewell to the success messages.

## [0.30.1] - 2025-09-07
### Added
- Support for SQL mode.

## [0.29.1] - 2025-08-30
### Security
- The updated values weren't being escaped.

## [0.29.0] - 2025-08-28
### Added
- Force the user to upgrade the server if needed.

### Fixed
- Error message was not being shown when the update failed

## [0.28.1] - 2025-08-26
### Added
- Support for updating rows in the results.
- Filter on any value in the results using the context menu.

### Changed
- Values in the results can by copied using the context menu.

### Fixed
- Keybinding for reloading the tab wasn't working
- Cell values shouldn't be selectable

## [0.27.3] - 2025-08-20
### Fixed
- Related tables weren't being shown when clicking a table in the graph.
- The keybinding to run the expression also works on Mac.

### Changed
- The connection monitor is moved together with the other menu items in the settings.
- The graph has a minimize / maximize button.
- The resizable divider is slimmer - no icons are shown.

## [0.27.0] - 2025-08-19
### Added
- Support for `?query=<expression>` URL parameter.
- Show the graph in the secondary view when the results are shown.

## [0.26.2] - 2025-08-19
### Fixed
- Disabled user authentication for playground.

## [0.26.0] - 2025-08-18
### Added
- Setup for playground i.e. playground.beamlynx.com

## [0.25.0] - 2025-07-13
### Added
- Welcome page for new users
- Polling for server connection status

### Changed
- Default width of the sidebar is increased to 400px

## [0.24.1] - 2025-07-12
### Fixed
- Performance issue with the SQL view.
- Improved graph renders.

## [0.24.0] - 2025-07-12
### Added
- Autocompletions for `where:` operation.

### Changed
- The expression is prettified when a table expression is selected from the autocompletion.

### Fixed
- Mouse cursor was set to 'pointer'.
- Position of the 'Download CSV' button in compact mode was overlapping with the 'Run' button.
- Autocomplete was not showing if opened too fast. Now we always have a backup no-op completion i.e. `Nothing found`.

## [0.23.0] - 2025-07-07
### Added
- Autocompletions for `select:` and `order:` operations.

## [0.22.2] - 2025-07-07
### Changed
- Autocompletion is not activated automatically.

## [0.22.1] - 2025-07-07
### Fixed
Improved autocompletion:
- Pressing `Tab` now shows the suggestions.
- The first suggestion is selected when the suggestions are shown.

### Changed
- The expression is prettified when a pipe `|` is entered.

## [0.22.0] - 2025-07-07
### Added
- Download the results as a CSV file
- Autocompletion support for pine operations and table names

### Changed
- Keybinding to run the expression is changed to `Ctrl + Enter`
- Run button is moved within the text input

## [0.21.1] - 2025-07-04
### Fixed
- Focus (when pressing `Tab`) goes to the input window instead of settings.
- Improved colors for the graph in dark mode

### Changed
- The recursive delete queries also include the pine expressions



## [0.21.0] - 2025-07-02
### Added
- Support for running analysis templates

### Fixed
- Theme was being set for each tab and not globally

## [0.20.1] - 2025-07-01
### Fixed
- The SQL view was re-rendering causing a performance issue.

## [0.20.0] - 2025-07-01
### Added
- A code editor for writing pine expressions
- Dark mode
- Vim mode
- Syntax highlighting for SQL in dark mode

### Fixed
- Focus on the input when the Escape key is pressed. This wasn't working if the mouse was used to click on other components of the UI.

## [0.19.0] - 2025-05-15
### Added
- A button to evaluate the pine expressions
- The id column in the results are clickable. This adds a where condition and limits the results to the row clicked.
- For a screen size less than 1200px (i.e. lg), the we update the layout accordingly. Instead of showing the SQL query, the main view is shown.

### Fixed
- Handling errors when building recursive delete queries
- The graph is rendered for each table being evaluated when doing recursive deletes

### Changed
- The graph is rendered as soon as the expression is modified
- The focus goes to the node that is selected as the candidate

## [0.18.2] - 2025-05-13
### Fixed
- The delete queries use the correct column name i.e. column used in the previous join than the first column of the table

## [0.18.1] - 2025-05-09
### Added
- If the pine server isn't running, then the correct version is shown instead of `latest`.

## [0.18.0] - 2025-03-23
### Added
- Clicking on a suggested column (select or order) in the selected node updates the expression

### Changed
- UX for setting up pine server and connecting to the database is improved

## [0.17.0] - 2025-03-15
### Added
- The suggested nodes can be clicked to select them

## [0.16.0] - 2025-03-10
### Added
- Show the icons for the main view mode i.e. documentation, graph and results

## [0.15.0] - 2025-03-02
### Added

- Sidebar width can be adjusted by dragging the divider
- User preferences using local storage: sidebar width is supported to begin with

## [0.14.0] - 2025-02-26

### Added

- Remember the positions when previously selected nodes in the graph are moved


## [0.13.0] - 2025-02-09

### Added
- Database connection monitor

## [0.12.0] - 2025-02-02
### Added

- Show the selected and suggested columns for the `order` operation

### Fixed

- The graph was not being showing on modifying the expression that just ran.
- The graph was not being shown when a printable character was pressed.
- Sidebar width for smaller screens i.e. adjust the width when the dev console is opened

## [0.11.0] - 2025-01-11

### Added

- Arranged the layout so that the graph can take more space

### Fixed
- When selecting a suggested node, the graph is not re-rendered

## [0.10.2] - 2025-01-08
### Fixed

- Show the suggested columns for the relevant table when alias is used e.g.

```
company as c | document | select: c.id
```

## [0.10.1] - 2025-01-07

### Added

- Show selected columns for tables
- Show suggested columns for current table

## [0.9.0] - 2024-10-25

### Added

- Support for db connections

## [0.8.0] - 2024-10-19

### Added

- Support for tabs i.e. multiple sessions.
- Support for recursive deletes e.g.

```
company | id='...' | delete:
```

## [0.7.1] - 2024-09-22

### Fixed

- When adding a pipe `|`, the expression was always being prettified. This wasn't allowing for adding pipes in the middle of the expression.
- When a candidate is selected in the graph, entering a non-printable character was entering the name of that character to the expression.

## [0.7.0] - 2024-08-23

### Added

- Show aliases for selected tables

### Changed

- Focus on the input when `Escape` is pressed

## [0.6.1] - 2024-08-13

### Changed

- Prettify the expression when a pipe `|` is entered

### Fixed

- Focusing out and back in the input hides the results

## [0.6.0] - 2024-08-02

### Breaking

Changed how navigation works:

- `Tab` to focus on the graph. `Esc` or `Shift + Tab` to focus back on the input
- The focused frame is highlighted with a border
- When focused on the input, `Enter` fetches the results.
- When focused on the graph, `Enter` selects the current candidate. Any other character brings you back to the input.

## [0.5.0] - 2024-07-31

### Breaking

- Fetch results using `Ctrl + Enter` instead of `Enter`.

### Added

## [0.4.0] - 2024-07-30

### Added

- Support for `from: <alias>`. This lets us set the context for joins.

## [0.3.2] - 2024-07-26

### Changed

- Syntax erros are shown where the query is shown
- Removed deprecated code

## [0.3.1] - 2024-07-22

### Changed

- Show sql query besides the pine input

## [0.3.0] - 2024-07-22

### Added

- Copy the query on click
- Support for ambiguous joins

### Changed

- Obsolete version message is shown if version is not returned from the server
- `⏳ Fetching rows ...` message is shown during query execution
- Clerk is not needed in development more
- Sql query is indented:`tabular-right`

## [0.2.0] - 2024-07-11

### Added

- Clicking on a cell copies the value to the clipboard

### Fixed

- Navigation was breaking in case there were no candidates to select from
- In some cases, clicking on a cell would duplicate the rows / throw an error on moving away from the cell

## [0.1.1] - 2024-07-08

### Changed

- The graph now takes the full screen height.
