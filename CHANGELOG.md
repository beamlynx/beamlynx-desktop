# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.8.0] - 2026-08-26
### Added
- The MCP server teaches an AI agent Pine up front, instead of leaving it to guess. A short primer now arrives when an agent connects, before it makes a single tool call. When an expression fails to parse, the reference page for whatever operation it got wrong comes back with the error, rather than the agent needing two more calls to find it.
- A new `find_tables` MCP tool searches for a table by name fragment -- "ten" finds "tenant", "tenant_role" and "user_tenant_role". An agent no longer has to guess a table name (a singular/plural mismatch was the usual way that went wrong).
- Pine reference pages for `count:`, `delete!`, `from:` and `limit:` now have worked examples. All four previously shipped with empty example blocks.

### Changed
- Connecting to a second database on the same server and port as an existing connection now reports a clear error instead of appearing to work. The two share an identity internally and could never both be connected — previously the second one quietly took the first one's place, so queries you believed were running against the first database actually ran against the second. Disconnect the existing one first (bundled pine-lang 0.40.0).
- MCP tool results are now written for an agent to act on, not dumped as raw API JSON. Asking what can be added to `user | ` went from 5,930 bytes of JSON to about 1,250 bytes of ranked suggestions, and query results dropped by roughly two thirds. Joins backed by a real foreign key are now listed separately from ones guessed from column naming, so an agent knows which it can trust; long lists say how many entries they left out instead of truncating silently.
- `explain_query` is now `complete_query`, and answers "what can I add here?" rather than dumping a parse tree. Its old description promised validation it never performed -- a query against a table that does not exist still parses cleanly, and only fails when run.
- The MCP server no longer shows SQL to an AI agent anywhere, in either direction. It could not run SQL before; now it does not return or teach it either. The bundled Pine reference explains what each example does in words, where it previously showed the SQL each expression translates to. Pine is the layer where query restrictions can be enforced, so an agent that reasons in SQL undermines the point of it.
- `list_pine_docs` is gone. Its topic list is now part of `get_pine_doc`'s own description, so fetching a topic takes one call instead of two.
- `run_query`'s description no longer tells an agent to look up column types by querying the database's own catalog tables. Column *names* now come from `complete_query`, but nothing in the MCP surface reports a column's **type** any more. Exposing types properly is planned as a Pine language feature rather than a lookup the MCP server does behind the agent's back.

### Fixed
- Running a query could stop working entirely, with every query hanging and never finishing, while the app otherwise looked fine — expressions still parsed, and the relationship graph still updated. Once it happened it did not recover until the app was restarted, and it became more likely the longer the app stayed open. Two independent causes, both fixed: the bundled server printed every query it ran to a stream this app never read, and once that stream filled up the server blocked permanently (bundled pine-lang 0.40.0); and this app never drained that stream in the first place.
- Each reconnection to a database left the previous connection open. A long session could accumulate dozens of them and eventually be refused a new connection by the database server (bundled pine-lang 0.40.0).
- The MCP control plane's `/explain` route accepted any HTTP method rather than only POST, so a bodyless GET would enter the handler and stall waiting for a request body.

## [0.7.0] - 2026-08-25
### Added
- A new Appearance section in Settings: three built-in themes (Light, Dark, Sepia), each with its own coordinated colors rather than a shared palette with a swappable accent (bundled beamlynx-ui 0.52.0).
- Independent Interface font (System, Inter, IBM Plex Sans) and Code font (IBM Plex Mono, JetBrains Mono, Fira Code, System Monospace) choices, replacing one shared monospace-only font setting (bundled beamlynx-ui 0.52.0).
- A Text size setting (Small/Medium/Large) that scales the app's text and spacing without resizing panels or the canvas (bundled beamlynx-ui 0.52.0).
- The loading screen now matches your chosen theme (or the OS's light/dark preference) instead of always showing a fixed dark palette, and rotates through a few status messages while the server starts instead of showing one static line.

### Fixed
- Trackpad two-finger scroll zoomed the graph instead of panning it, in both graph views -- it now pans, matching the Miro/Figma convention (bundled beamlynx-ui 0.52.0).
- Canvas keyboard navigation between tables now wraps from the last table back to the first instead of stopping there (bundled beamlynx-ui 0.52.0).

## [0.6.2] - 2026-08-23
### Changed
- New Layout's Canvas/Results split now uses one consistent 8px gap on all sides and between the two panes, instead of a slightly different, unexplained width for the pane divider (10px) versus the surrounding margins (8px), and no gap at all at the bottom (bundled beamlynx-ui 0.51.2).

### Fixed
- The "update ready" notification said "restart" twice (in the message and the button), and its "Restart Now" button had no visible border or fill, reading as plain text rather than something to click (bundled beamlynx-ui 0.51.2).

## [0.6.1] - 2026-08-23
### Changed
- A connection's color is now set from Settings > Database Connections (click its status dot), alongside renaming and MCP access, instead of from the top-left connection picker (bundled beamlynx-ui 0.51.1).
- The Updates modal shows a short title for each change first, with its fuller explanation underneath -- easier to skim than a flat bullet list (bundled beamlynx-ui 0.51.1).
- The Pine/SQL panel's keybindings changed to Ctrl/Cmd+. for Pine and Ctrl/Cmd+, for SQL, replacing Ctrl/Cmd+Shift+E/S (bundled beamlynx-ui 0.51.1).
- A canvas filter now composes as its own `where:` step instead of joining a comma-separated list on one shared `where:` clause -- multiple filters on the same table still combine with AND (bundled beamlynx-ui 0.51.1).

### Fixed
- Table colors disappeared the instant the SQL panel was opened, even though the results on screen hadn't gone stale (bundled beamlynx-ui 0.51.1).
- Auto-run silently stopped firing on canvas edits whenever the SQL panel was the visible one (bundled beamlynx-ui 0.51.1).

## [0.6.0] - 2026-08-23
### Added
- Canvas mode is now the default way to build a query, in a new two-pane layout (canvas and results, side by side or stacked) with results running automatically as you edit -- the classic sidebar layout is still one click away (bundled beamlynx-ui 0.51.0).
- Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab switch between tabs, matching a browser's own tab switching (bundled beamlynx-ui 0.51.0).
- F12 (or Ctrl/Cmd+Shift+I) now opens Chrome DevTools when running unpackaged (`npm start`) -- there's no menu bar to reach it from otherwise. Not available in packaged builds.

### Fixed
- Canvas mode could freeze up while its optional Pine/SQL text panel was open -- edits went nowhere, and a session reloaded with the panel already open could get stuck showing "Connecting…" forever (bundled beamlynx-ui 0.51.0).
- A join that no longer had a real column to connect on (for example, after deleting a table in between two others) could render as a plain, confident-looking line instead of the dashed warning styling used for any other unresolved join (bundled beamlynx-ui 0.51.0).

## [0.5.0] - 2026-08-22
### Added
- A saved connection can now be renamed (bundled beamlynx-ui 0.50.0) -- a new `credentials.rename` call updates its stored label.
- A refresh icon next to each live connection in Settings > Database Connections, to pick up tables or columns added to the database after the connection was first opened -- no restart needed (bundled beamlynx-ui 0.50.0 / pine-lang 0.39.0's new reindex endpoint).
- Keyboard control for canvas mode: navigate between tables with the arrow keys or `j`/`k`, and trigger a highlighted table's operations with a single letter, without touching the mouse (bundled beamlynx-ui 0.50.0).

### Fixed
- The graph view could get stuck showing "Connecting…" forever even once the connection was live -- the very first query build for a tab, sent before its connection pool actually existed yet, failed silently and nothing ever retried it (bundled beamlynx-ui 0.50.0).
- A heuristic join between columns of different database types (e.g. text vs uuid) generated SQL Postgres rejected outright; both sides are now cast to a common type instead (bundled pine-lang 0.39.0).

### Changed
- Removed the native menu bar (File/Edit/View/Window) on Windows/Linux -- it only duplicated beamlynx-ui's own header. Kept a minimal one on macOS (app name + Edit), since Cmd+C/V/X and undo/redo rely on the Edit menu to work at all in text fields.
- Exposes this app's own version to the Settings About section's new "App version" row (bundled beamlynx-ui 0.50.0).

## [0.4.0] - 2026-08-17
### Added
- MCP support. An AI agent like Claude Code can run queries directly against your saved connections. Turn it on per connection, and copy the setup command, from the new Settings page (bundled beamlynx-ui 0.49.0).
- A `beamlynx://` URL scheme for opening a saved connection with a query already filled in.
- A Settings page, opened from the gear icon next to the notification bell, for connections, preferences, and MCP setup (bundled beamlynx-ui 0.49.0).
- A database type field when adding a connection. Picking a type fills in its default port automatically (bundled beamlynx-ui 0.49.0).

### Security
- Bundles pine-lang 0.38.2. The server now binds to `127.0.0.1` (loopback only) by default instead of every network interface -- it has no authentication, so the old default left it reachable from your whole network.

## [0.3.0] - 2026-08-14
### Added
- `beamlynx --app-version` prints the installed desktop app's own version and exits, without opening the GUI.

## [0.2.2] - 2026-08-14
### Changed
- macOS builds are now code-signed and notarized by Apple.

## [0.2.0] - 2026-08-14
### Added
- An experimental interactive view for building Pine queries by clicking through tables in a graph instead of writing text (bundled beamlynx-ui 0.48.1).

### Changed
- Unified the app's visual design (the "schematic/blueprint" look) across the whole app (bundled beamlynx-ui 0.48.1).

### Fixed
- The loading screen's colors were hardcoded to the app's old dark-theme palette, so it visually flash-swapped once the real (now "schematic/blueprint") UI loaded -- updated to match.

## [0.1.19] - 2026-08-09
### Changed
- Each tab now connects to its own database lazily, only when it becomes the active tab, instead of every tab eagerly following whatever connection was picked most recently. Opening the app no longer forces the connections picker open -- it silently reconnects the tab you were on. A tab whose connection isn't live yet shows a hollow (outline-only) dot in its own connection's color, filling in solid once connected (bundled beamlynx-ui 0.47.0).

### Fixed
- A checkpoint feeding into a pipeline's terminal `group:` had its own CTE silently dropped from the generated SQL, leaving the group's wrapper CTE referencing a relation that was never defined (bundled pine-lang 0.37.3).
- Clicking a graph node (e.g. expanding a variable/checkpoint container) was mistaken for a Tab keypress, stealing focus into the Pine input and jumping the candidate-relation highlight to the first suggestion (bundled beamlynx-ui 0.47.0).
- Picking a connection from the auto-opened startup picker could open an unrelated new tab and silently change which connection *other*, already-open tabs appeared to be using (bundled beamlynx-ui 0.47.0).
- A tab restored from before this session-connection rework had no saved-profile id to reconnect from, so it silently never auto-connected -- it now falls back to resolving one from its connection id (bundled beamlynx-ui 0.47.0).
- The connections picker's "currently active" checkmark could point at a stale profile after switching tabs silently reconnected a different one in the background (bundled beamlynx-ui 0.47.0).
- Every tab's assigned connection was silently wiped back to "not connected" on every app launch, before pine-server (a fresh process each launch) had any chance to reconnect it -- restarting the app looked like every saved connection had been forgotten (bundled beamlynx-ui 0.47.0).
- Failing to reconnect a saved profile (deleted/renamed on disk, or its DB unreachable) via the connections picker only logged to the console -- now shows the same connection-error banner as every other connection failure (bundled beamlynx-ui 0.47.0).
- The connections list/picker always showed a solid dot for every saved connection regardless of whether it actually had a live pool -- not-yet-connected entries now correctly show as a hollow (outline-only) dot (bundled beamlynx-ui 0.47.0).
- On launch, a tab's connection briefly displayed as its raw `host:port` id instead of its saved name, before flashing to the real name once the saved-profile list finished loading (bundled beamlynx-ui 0.47.0).

## [0.1.18] - 2026-08-04
### Fixed
- Relation/join hints for a column like `tenant_id` were lost whenever a checkpoint (`l:`/`group:`) sealed the selection into an anonymous CTE and `id` wasn't also selected (bundled pine-lang 0.37.2).
- Creating a database connection now returns a proper error instead of an uncaught server error when the target database is unreachable (bundled pine-lang 0.37.2).
- A failed attempt to connect (unreachable DB, wrong credentials, etc.) used to fail silently; a new error toast now surfaces the actual failure (bundled beamlynx-ui 0.46.2).
- A saved connection could show as "connected" on launch even though nothing was actually connected yet this session — pine-server is a fresh process every launch, so a previously-used connection is no longer trusted until it's confirmed live (bundled beamlynx-ui 0.46.2).
- When disconnected, the app now automatically opens the connections picker (or the add-connection form, if none exist yet) instead of leaving a dead "Not connected to database" label (bundled beamlynx-ui 0.46.2).

## [0.1.17] - 2026-08-03
### Fixed
- The changelog's relative-date label showed "-1 days ago" for a same-day entry when the local timezone is behind UTC (bundled beamlynx-ui 0.46.1).

## [0.1.16] - 2026-08-03
### Added
- Tabs (Pine/SQL text, input mode, connection) are now restored on reload instead of always starting from a single blank session (bundled beamlynx-ui 0.46.0).
- `Ctrl/Cmd+S` ("Save Tab") downloads the active tab's Pine expression as a `.pine` file (bundled beamlynx-ui 0.46.0).
- New "List Database Connections" / "New Database Connection" command palette entries (bundled beamlynx-ui 0.46.0).

### Fixed
- Pressing Tab while the graph had focus was falling through to React Flow's own node/edge navigation instead of cycling through Pine completion candidates (bundled beamlynx-ui 0.46.0).

## [0.1.15] - 2026-08-02
### Fixed
- Changes could fail to survive a restart if a stale/orphaned instance of the app was still running in the background (e.g. left behind by a crash) -- the app now refuses to run a second instance at all, and instead brings the existing window to the front.
- A brief blank/white flash when the app first opens, before the loading screen has rendered.
- Notification bell color correction (bundled beamlynx-ui 0.45.2).

## [0.1.14] - 2026-08-02
### Fixed
- Saved connections weren't showing their color or proper name in the connection picker.
- The "Database Connection" dialog no longer pops up automatically when you already have connections to pick from.

### Changed
- The notification bell no longer shakes for new updates -- it still changes color, just more subtly.

## [0.1.13] - 2026-08-02
### Added
- Connections you add are now saved to disk, encrypted via the OS's own credential storage (`safeStorage` -- Keychain on macOS, DPAPI on Windows, the Secret Service/libsecret or KWallet on Linux), and reloaded the next time you open the app instead of only lasting for the session. If no real OS secret store is available, connections aren't persisted rather than being stored with weak/no protection -- you'll need to re-enter them, same as before.
- Forces the Linux `safeStorage` backend explicitly (`--password-store`) instead of relying on Chromium's desktop-environment auto-detection, which only recognizes a fixed list of DEs (GNOME, KDE, XFCE, ...) -- on tiling window managers like Hyprland it reported no key storage available at all, even with a real secret service (e.g. gnome-keyring) running.

### Changed
- Deleting a connection from the picker now also forgets its saved credential, in addition to closing the live session.

## [0.1.12] - 2026-08-02
### Changed
- The auto-update banner (introduced in 0.1.10) now uses the app's own palette colors instead of MUI's stock info/success colors, matching the existing `Alert` styling convention in `beamlynx-ui`'s settings page.

## [0.1.11] - 2026-08-02
### Fixed
- User preferences (vim mode, sidebar width, theme, etc.) could silently revert after an auto-update -- Chromium buffers localStorage writes and only periodically flushes them to disk, and the abrupt quit-and-relaunch auto-update performs could race that flush and lose whatever hadn't been written yet. Both quit paths now force a flush (`session.flushStorageData()`) before quitting.

## [0.1.10] - 2026-08-02
### Added
- Auto-update progress is now shown in-app (bundled from `beamlynx-ui`'s `DesktopUpdateBanner`) -- "Downloading update... NN%", then "Update ready -- Restart to install". Replaces the previous console-only/native-OS-notification behavior (`checkForUpdatesAndNotify()` swapped for `checkForUpdates()` to avoid a redundant native toast alongside the in-app one).

## [0.1.9] - 2026-08-02
### Added
- A loading splash (`assets/loading.html`) shown immediately on launch, instead of a blank window for several seconds while the bundled server boots.
- Desktop-only keybindings: `Ctrl/Cmd+K` (command palette), `Ctrl/Cmd+T` (new tab), `Ctrl/Cmd+W` (close tab), bundled from `beamlynx-ui`'s `desktop-app` branch. See its `utils/keybindings.ts`.
- `DEVELOPMENT.md` documenting the local dev/test workflow.

### Changed
- An explicit application menu, so `Ctrl/Cmd+W` reaches the page's own close-tab handler instead of Electron's default menu closing the whole window.
- The connected server's version chip (e.g. `[0.37.0]`) no longer shows in the UI -- bundled from the same `beamlynx-ui` commit as the keybindings above.

### Fixed
- The window now appears immediately on launch instead of only after the bundled server finishes booting (up to ~15s).

## [0.1.8] - 2026-08-02
### Changed
- Sign-in is no longer required -- reverts the Clerk auth added in 0.1.6. Google OAuth's redirect flow doesn't work from a `file://`-loaded static export ("The provided redirect url has a prohibited URL scheme"), and email/password-only auth wasn't enough on its own to justify keeping it. Desktop goes back to the pre-0.1.6 behavior: no login screen, `[Desktop]` label shown instead of the user box.

## [0.1.7] - 2026-08-01
### Changed
- No functional change -- verifies that a symlink pointing at the stable `beamlynx.AppImage` filename (introduced in 0.1.6) survives an actual auto-update instead of dangling.

## [0.1.6] - 2026-08-01
### Added
- Sign-in is now required, matching the hosted product, via `beamlynx-ui`'s `desktop-app` branch (client-side Clerk gating, since a static export can't run `middleware.ts`). Not present in any earlier release -- this is the first one that includes it.

### Fixed
- The Linux AppImage's filename no longer changes across auto-updates (was `beamlynx-X.Y.Z.AppImage`, now a stable `beamlynx.AppImage`) -- previously, a symlink pointing at a specific version's filename would dangle the moment the app self-updated.

## [0.1.5] - 2026-08-01
### Changed
- No functional change -- verifies that differential/delta auto-update still works now that the new AppImage toolset embeds the blockmap inside the binary instead of publishing it as a separate sidecar file.

## [0.1.4] - 2026-08-01
### Fixed
- The Linux AppImage no longer requires FUSE to run. Many distros (Arch, Ubuntu 22.04+, Fedora, etc.) don't ship `libfuse.so.2` by default anymore, which made the AppImage fail outright with "dlopen(): error loading libfuse.so.2" unless the user separately installed `fuse2` or ran it with `--appimage-extract-and-run`. Switched to electron-builder's newer static, FUSE-less AppImage runtime (`toolsets.appimage: "1.0.3"`), which needed bumping `electron-builder` from 24.x to 26.x.

## [0.1.3] - 2026-08-01
### Changed
- No functional change -- verifies an installed 0.1.2 correctly detects, downloads, and applies this version via electron-updater (the actual M5 gate test).

## [0.1.2] - 2026-08-01
### Added
- Console logging for auto-update lifecycle events (checking/available/downloading/downloaded), needed to actually observe the round-trip while verifying it -- previously silent unless something errored.

## [0.1.1] - 2026-08-01
### Changed
- No functional change -- this release exists to verify the auto-update round-trip (an installed 0.1.0 correctly detects, downloads, and applies this version).

## [0.1.0] - 2026-08-01
### Added
- Initial release: an Electron app that bundles the pine-lang server (as a
  self-contained jpackage runtime, no Docker required) and a static export of
  beamlynx-ui, so the two can never drift out of version sync.
- Auto-update via electron-updater and GitHub Releases.
- Linux (AppImage, deb) and Windows (nsis) installers; macOS (dmg) unsigned
  for now -- code signing/notarization is a separate, later milestone.
