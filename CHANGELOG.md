# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.23.0] - 2026-10-26
### Added
- **Supabase migrations only deploy from `main` or a release tag,** and the guard runs again right before each deploy. A test run of the release workflow from a branch no longer reaches the live database. A release stops if the app has a Supabase address but the secrets to set up its database are missing. The database checks in CI are required to merge into `main`, and pass in seconds when no database file changed.
- **Sign in once, and anonymous usage stats.** The app can now ask people to sign in with GitHub, once, and they can skip it. Google sign-in works too, but the bundled UI hides it until Google verifies the Beamlynx brand. The app also sends a few anonymous events (app opened, connection added, query run) to PostHog. Never query text, table names or connection details. Nothing is sent before the first-run screen has been seen, and usage stats can be turned off in Settings → Account (bundled beamlynx-ui 0.69.0). Sign-in uses the browser and a short-lived local web server on `127.0.0.1`, so it works in every packaging, AppImage included. New IPC calls under `account:*` and `usage-stats:capture`. A build without the service keys has neither; `scripts/setup-accounts.sh` sets them up; see `docs/accounts-and-usage-stats.md`. The app never waits for these services: offline, everything works as before.
- **The Supabase database, and how it changes safely.** Migrations live in `supabase/migrations/`, and apps only call the `record_profile` function, never a table. CI refuses a migration that drops, renames or tightens anything, and tests that every released app's call still works. Migrations go live on merge, and again as the first step of every release. See `supabase/README.md`.
- **Agents can read and propose access policy changes.** `get_access_policy` lists a connection's rules, never data. `propose_policy_change` sends changes that the app checks first, then shows the user as a card. Nothing changes until the user applies it, and only the window writes a policy. The call waits up to 10 minutes for an answer.
- **Agent access per connection: off, masked or every column,** set with `credentials:set-agent-access`. Every column keeps the policy for later, in the new connection field `agentsSeeEveryColumn`. An older app ignores that field and masks.
- **`group:` without keys gives one row of totals,** with named aggregates: `orders | group: with count as n, total => sum as revenue` (bundled pine-lang 0.51.0, beamlynx-ui 0.69.0).
- **`jsonb_typeof()`, `jsonb_array_length()`, and a function on the left of a condition,** like `where: jsonb_typeof(data) = 'array'` (bundled pine-lang 0.51.0).
- **`nulls first` and `nulls last` in `order:`** (bundled pine-lang 0.51.0).
- **More SQL converts to Pine:** JSON keys like `data->>'plan'`, `EXISTS` and `NOT EXISTS`, `COUNT(column)`, and `GROUP BY 1` / `ORDER BY 3` (bundled pine-lang 0.51.0).

### Changed
- **Each connection has its own access policy.** No policy is shared any more. The ones listed under Settings are templates, copied into a connection with `credentials:attach-template`. On first start, each connection keeps exactly the rules it had.
- **The Default template is built in.** It lives in code, so it can't be edited, and a stored "Default" is removed once.
- **A new connection starts with no access policy.** The app asks for one when agent access is turned on.
- **A query that uses a hidden column is refused at once.** The refusal points the agent to `propose_policy_change`.
- **The Pine reference agents read covers newer Pine:** `nulls first` and `nulls last`, `jsonb_typeof()`, `jsonb_array_length()`, and a function on the left of a condition. It also corrects the default sort order: Pine sorts descending.
- **A clearer connection list, one way to confirm, and a shorter agent timeline.** A zap marks the tab's connection and a robot shows agent access. Anything that weakens protection or deletes something asks in a dialog. The timeline follows the newest step (bundled beamlynx-ui 0.69.0).

### Removed
- `access-policy:duplicate`, `credentials:set-connection-policy`, and `run_query`'s wait for an approval.

### Fixed
- **Dates and times in results are exact on Postgres.** A timestamp keeps its fraction of a second, and a `DATE` reads `1990-07-22` instead of midnight UTC (bundled pine-lang 0.51.0).
- **SQL to Pine: selecting only an earlier table's columns** no longer returns every column of the last table too (bundled pine-lang 0.51.0).

## [0.22.1] - 2026-10-19
### Fixed
- **The app no longer crashes at launch on macOS.** Since 0.20.0 it quit within seconds of opening, on every launch. The app's name in `Info.plist` (`CFBundleName`) was "Beamlynx", but its helper apps are named "beamlynx Helper". Electron finds the helpers through that name, and aborted when the capital B didn't match the path on disk. `CFBundleName` is back to the lowercase default. Finder, the Dock and the app switcher still show "Beamlynx", but the bold app menu title in the menu bar shows "beamlynx".

## [0.22.0] - 2026-10-19
### Added
- **A shared policy can be copied instead of changed for everyone.** When you show or hide a column for agents and the connection's access policy is also used by other connections, beamlynx asks first: copy the policy for this connection and change only the copy, or change it for all of them. The Allow card in an agent's investigation offers the same choice. A new IPC call, `access-policy:duplicate`, makes the copy (bundled beamlynx-ui 0.68.0).

### Changed
- **The agent sits at the bottom of the sidebar,** and only once an agent has started an investigation (bundled beamlynx-ui 0.68.0).

### Fixed
- **"Also restrict my own queries" now applies in an agent's investigation tab too.** A query you ran there was always masked. Now only the agent's own queries are, while they run (bundled beamlynx-ui 0.68.0).

## [0.21.0] - 2026-10-18
### Added
- **Agent investigations.** Each Claude session that uses beamlynx is now an investigation of its own. The MCP relay sends an id with every call, so the app can give each session its own tab, opened from the robot in the sidebar. A timeline beside the canvas keeps every step: each query with the agent's reason and what came back, failures included. Click a query to see its rows again, exactly as the agent saw them (bundled beamlynx-ui 0.67.0).
- **Steering an agent from beamlynx.** Notes the user types in an investigation's tab reach the agent at the top of its next beamlynx call. beamlynx can't send the agent a message, only answer its calls, so a note waits for that call.
- **Allowing a hidden column while the agent waits.** A query refused for a hidden column now waits inside the agent's `run_query` call while beamlynx asks the user. If they allow the column, the query runs again and the agent gets the rows. If they decline, it gets their answer. The call gives up after 10 minutes. The card that asks is in the investigation's timeline (bundled pine-lang 0.50.0, beamlynx-ui 0.67.0).
- **Reveal requests belong to their investigation.** A `request_reveal` call carries the id of the Claude session that made it, so the app shows it as a card in that investigation instead of a tab of its own. You can look at the real rows before revealing them (bundled beamlynx-ui 0.67.0).
- **Two new MCP tools:** `set_question` names what the agent is investigating, which becomes the tab's title. `note_finding` records what it found, from beamlynx or another source, shown next to its queries.
- **Access policy: exceptions.** Besides its Allow rules, a policy can now list Except rules: a column they match stays hidden from agents, even when an Allow rule matches it. (In pine-lang's rules they are `hide` rules.) Rules can name a column by what its name contains, ends with or equals, or name one exact column of one table. Every rule has an id, so a policy can hold any number of them. New IPC calls add, remove and switch one rule, and put a policy's rules back for Undo: `access-policy:add-rule`, `access-policy:remove-rule`, `access-policy:set-rule-enabled` and `access-policy:set-rules`. They replace `access-policy:set-module-enabled`. Settings → Access Policy lists the Allow rules, then the exceptions (bundled pine-lang 0.50.0, beamlynx-ui 0.67.0).
- **Change the access policy from the results.** Right-click a cell or a column header and choose **Show to agents** or **Hide from agents**. A message says which policy changed and which other connections use it, with Undo. A column agents can't see has a crossed-out eye in its header, in your own tabs too, where you still see its values (bundled pine-lang 0.50.0, beamlynx-ui 0.67.0).
- **A sidebar on the left.** The database connection is at its top, then the agent, the settings sections and What's new. It shows icons only, or expands to show labels and the agent's investigations (bundled beamlynx-ui 0.67.0).

### Changed
- **Every policy now hides columns whose name contains `token`, `password` or `secret`.** New policies start with these exceptions, and existing policies get them once, switched on. This only hides more from agents. Switch them off or remove them under Settings → Access Policy.

### Fixed
- **SQL to Pine: a column without its table, in a query with a join,** now belongs to the one table that has it, as in SQL. It used to be refused (bundled pine-lang 0.50.0).

## [0.20.0] - 2026-10-17
### Added
- **Canvas: checkpoints and query blocks.** A `limit:` or `group:` is drawn as its own stage, a node named like `result_1` that works like any table. A checkpoint, or a table that uses an earlier block's `|= name`, opens into a dashed box showing what it holds. A tab with several query blocks shows which block is made from which, in a strip at the top. Dragged nodes go back with the toolbar's refresh icon (bundled beamlynx-ui 0.66.0).
- **Top N per group.** `limit: 1 per customer_id` keeps the first rows of each group, ranked by the `order:` before it, like each customer's latest order. The result comes group by group (bundled pine-lang 0.49.0).
- **Computed values.** `select:` can name a value that isn't just a column: `coalesce(title, 'untitled') as label`, `if ... then ... else`, or a condition as true or false. The arrow applies a function: `created_at => month`. A group takes aggregates after `with`: `group: customer_id with count, total => sum as spent` (bundled pine-lang 0.49.0).
- **The SQL panel.** It completes table and column names, suggests joins after `JOIN`, and turns the SQL you type into Pine, so the canvas follows it (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0).
- **JSON paths.** A key inside a JSON column works like a column, `where: data.country = 'SE'`, on the canvas too, and its cell can be edited (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0).
- **Stop a running query** with the Stop button or Escape (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0).
- Column widths in the results are remembered (bundled beamlynx-ui 0.66.0).
- **The app sees every call an AI agent makes.** Each MCP tool call is reported to the app as it starts and as it ends: what the agent is doing, what it sent, and how it went. That includes calls that never reach a tab, like `find_tables` and `get_pine_doc`. Reporting never delays a call and never opens the app; with the app closed, it is skipped. The robot in the header pulses while an agent works, and opens a log of every call it made (bundled beamlynx-ui 0.66.0).
- **AI agents can send SQL.** A new MCP tool, `run_sql_as_pine`, takes SQL: a `SELECT`, or an `UPDATE` or `DELETE`, with `WITH` queries. It is a tool of its own, so a person can allow Pine queries in their MCP client and refuse SQL. The SQL is converted to Pine, and only the Pine runs, in a visible tab, with the connection's access policy and with writes refused. SQL never runs. The result starts with the Pine that ran, so an agent learns Pine from its own queries. An `UPDATE` or `DELETE` converts and shows in the agent's tab, but is refused when it runs: only a person can run a change. SQL that Pine can't say, like `OFFSET` or `UNION`, runs nothing and returns the reason. The instructions every session starts with say so. Needs the bundled pine-lang and beamlynx-ui to include SQL to Pine and beamlynx-ui #133, which this release bundles.
- The Pine reference AI agents read, and the instructions every session starts with, no longer say Pine has no `>=` or `<=`. Both are listed with the other operators, and an `in` list is shown holding numbers. Needs the bundled pine-lang to include pine-lang #111, which this release bundles.
- A `json` topic in the Pine reference AI agents read (`get_pine_doc`), and a line about it in the instructions every session starts with. It covers keys inside a JSON column, like `customer | where: data.country = 'SE' | select: data.address.city`. Needs the bundled pine-lang to include JSON paths (pine-lang #107), which this release bundles.
- The Pine reference AI agents read says how to write into a key with `update!` (`update! data.plan = 'pro'`), and that a number can be negative or have a decimal part. Needs the bundled pine-lang to include pine-lang #109 and #110, which this release bundles.
- The Pine reference AI agents read covers computed values, in a new `computed-values` topic: `coalesce()`, `concat()`, `now()`, `if ... then ... else`, conditions as true or false columns, and the date functions `minute` to `year`. It explains the arrow: `x => f` is `f(x)`, and `x => f(a)` is `f(x, a)`. The `group` topic lists the aggregates beside `count`: `min`, `max`, `sum`, `avg`, `any` and `all`, each with an optional `where` filter, as in `group: customer_id with count, total => sum as spent`. The `limit` topic covers `limit: 1 per customer_id`, which answers a question about each group, like each customer's latest order, in one query. The instructions every session starts with show all three, and tell agents not to run one `limit:` query per group, since each run opens in the user's tab. Needs the bundled pine-lang to include pine-lang #121 to #131, which this release bundles.
- **SQLite.** Connect to a SQLite database file: choose SQLite as the database type and pick the file with **Browse…**. A saved SQLite connection holds only the file's path, so it needs no password and is saved even on a computer with no secure credential storage. The bundled server is started with `PINE_SQLITE=1`, which lets it open files by path. Needs the pine-lang and beamlynx-ui releases that add SQLite, which this release bundles.
- **Preferences in `beamlynx.db`.** The app's UI keeps its settings in the app's SQLite file instead of the browser's storage. It reads them all in one blocking call before the UI starts, because the UI reads settings synchronously. If the file can't be opened, the UI keeps using browser storage. Needs the beamlynx-ui release that adds this, which this release bundles.

### Changed
- **Breaking:** a group's aggregates come after `with`: `group: status with count`. `group: status => count` is now an error that names the new form, including in saved recipes (bundled pine-lang 0.49.0). The Pine reference AI agents read, the instructions every session starts with, and `complete_query`'s list of operations teach the new form.
- **Breaking:** a cell edit finds its row by the table's primary key, not by a column called `id`. Tables without a primary key can't be edited from the grid (bundled beamlynx-ui 0.66.0).
- A dev build has its own `beamlynx.db`, in its own data folder, instead of sharing the installed app's. Experiments in a dev build, including new migrations, no longer touch the installed app's settings and recipes. Recipes saved from a dev build until now stay in the installed app's file. Saved connections are still shared.
- Links the app opens in your browser must be `http`, `https` or `mailto`. Anything else is refused.
- Results sent to an AI agent cut any cell longer than 2 000 characters, saying how much was left out, so one large text or JSON column can't flood the agent's context.
- The Pine reference AI agents read (`get_pine_doc`) matches the bundled pine-lang. A string can hold an apostrophe written twice. Date-time literals work. `limit:` takes 0 to 10 000. `delete!` needs a `where:` or `limit:`. Under an access policy, hidden columns can't be filtered, sorted or grouped on, and unindexed tables are refused.

### Fixed
- Opening the app while a database is down no longer leaves the tabs stuck on "Not parsing". The tab says it can't reach the database, tries again every 10 seconds while it's open, and draws its graph once the database answers (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0).
- If the AI-agent control port can't start, the app now says so instead of failing silently, and agents then get a clear error.
- When the bundled query server fails to start, the error says why, with what it printed, as soon as it stops. It used to wait 15 seconds and report only that it 'did not become ready'. A server binary that can't be started at all no longer crashes the app.
- If the query server stops while the app is open, the app offers to restart it. Every query failed until the app was reopened before.
- At start-up the app stops a server left behind by a crashed run only if that process is still a pine server. The process number it remembered could belong to an unrelated program after a reboot.
- KDE Plasma 5 can save connections again. The app asked for KWallet 6, which Plasma 5 doesn't have, so saving was refused with no explanation.
- A development build registers `beamlynx://` links for itself, not for a bare Electron. The app data file failing to open is logged once, with the reason, instead of on every call.

### Security
- A `beamlynx://` link is ignored unless it is a `beamlynx://run` link. With the bundled beamlynx-ui after 0.65.0, a run link opens a tab with its expression but doesn't run it.
- Other programs on the computer, and web pages open in the browser, could use the bundled query server and the AI-agent control port. Both now require a secret the app creates at each launch. The query server's goes to it as `PINE_TOKEN` and to the app's own UI. The control port's is written to `control-plane.json` in the app's data folder, readable only by you, where `beamlynx --mcp` reads it. The control port also refuses any request from a web page. Needs pine-lang and beamlynx-ui newer than the ones 0.19.0 bundled (pine-lang 0.48.1, beamlynx-ui 0.65.0); this release bundles both.
- An AI agent can no longer ask to reveal an expression that changes data. The app builds the expression first and refuses the request unless pine-lang reports it as read-only. At most three reveal requests per connection can wait at once.
- The bundled server always listens on 127.0.0.1, even if `PINE_HOST` is set in your environment.
- The saved-connections file is readable only by you. It lists every saved database with its host, name and user; the passwords in it were already encrypted.

## [0.19.0] - 2026-10-06
### Changed
- **Breaking:** Ctrl+S no longer downloads the tab as a `.pine` file. It saves a recipe instead (bundled beamlynx-ui 0.65.0).
- **Breaking:** beamlynx now runs on Electron 44 (Chromium 152, Node 24), up from Electron 31, which no longer gets security fixes. It needs macOS 13 or later. macOS 11 and 12 are no longer supported.
- Electron 44 includes SQLite. beamlynx will use it to keep its own data, such as settings and saved recipes. A new release check confirms it works in the packaged app on Linux, macOS and Windows.
- Building beamlynx-desktop needs Node 22 or later. See DEVELOPMENT.md.

### Added
- **Variables.** Write `$name` in a query where a value goes, and set it in a values block of its own above the query: `$company_name = 'Acme'`, or a list for `in`, `$statuses = ('failed', 'stuck')`. On the canvas, a Variables list shows each `$name` the query uses and its value; click a value to change it (bundled beamlynx-ui 0.65.0, pine-lang 0.48.1).
- **Save a query as a recipe with Ctrl+S.** A bar above the tab asks for a title. It saves the query with its comments and the values blocks it uses (bundled beamlynx-ui 0.65.0).
- **Use a recipe with Ctrl+O.** Find it by any word in its title, comments or query, then click it or press Enter to put it in the tab. Delete one with the trash icon on its row (bundled beamlynx-ui 0.65.0).
- **One query's result in another:** a named result that selects one column can be used after `in`, like `employee | where: id in acme_emps` (bundled pine-lang 0.48.1).
- The Pine reference agents read now teaches values blocks (`$name = value` lines above the query, which `run_query`'s `variables` overrides) and using a one-column named result after `in`. Needs a bundled pine-lang with both.
- An AI agent can pass values for `$variables` to `run_query`, as `variables: {"company_name": "Acme", "tenant_ids": [17, 23]}`. pine-lang binds each as a value, never pasted into the query. A name must be a valid `$name`. An integer larger than 2^53 is refused, because JSON has already rounded it; pass a large id as a string. `request_reveal` and `open_in_desktop` take no `variables`, so their description tells the agent to write the values in a values block. The Pine reference agents read has a new `variables` topic, and what it used to call variables (`|= name`) is now the `named-results` topic. Needs a bundled pine-lang with variables.
- beamlynx has a SQLite file for its own data, `beamlynx.db`, in the same folder as saved connections. A dev build and the installed app share it. It can store recipes: saved Pine queries, with values you fill in each time. Recipes are offered on every database, because a local, staging and production database usually share one schema. Each recipe remembers which database it was saved from. Settings, open tabs and column widths move into the file in a later release. If the file is ever damaged, beamlynx keeps it as `beamlynx.db.bad` and starts with an empty one. A file that is only busy, because the other copy of the app has it open, is never treated as damaged.
- A dev build (`npm start`) shows an amber **DEV** chip in the header, so it can't be mistaken for the installed app when both are open (with beamlynx-ui's matching change).
- A dev build (`npm start`) can run next to the installed app. It uses its own ports (43333 and 43334) and its own data folder, `beamlynx-desktop-dev`, but shares the installed app's saved connections. In Settings > MCP it registers itself as `beamlynx-dev`, so an AI agent can use either copy. See DEVELOPMENT.md. The dev build needs a pine-server staged from a pine-lang that reads `PINE_PORT`. The installed app still uses 33333.

### Fixed
- Keys pressed in a dialog, such as the Ctrl+O recipe picker or the command palette, no longer reach the canvas behind it. Clicking a dialog's text and then pressing Backspace, Delete or `x` used to delete the selected item in your tab (bundled beamlynx-ui 0.65.0).
- **New Database Connection** in the command palette opens the add form again, instead of Settings on the list of connections (bundled beamlynx-ui 0.65.0).
- A cast after an `in` list, as in `where: name in ('a') ::text`, was read as one more value, so the query matched `'text'` too. It now applies to the column (bundled pine-lang 0.48.1).
- Opening beamlynx while it's already open now says so. It used to quit without a word, and on some desktops, such as Hyprland, the open window didn't come forward either.
- If a port beamlynx needs is taken, it now says what's using it: another copy of beamlynx, a Pine server started some other way, or another program. A taken MCP port (33334) used to go unhandled.
- On Linux, the AppImage's MCP setup instructions pointed at a temporary folder (`/tmp/.mount_…`) that gets a new name on every launch, so the registration broke after the app was closed. They now point at the AppImage file itself. The MCP relay also starts the app from that file, so the app no longer depends on the relay's own temporary folder, which is removed when the relay exits.

## [0.18.0] - 2026-09-28
### Added
- After you edit a value in the results, its cell glows briefly and a short message says it was saved. If it wasn't, the message says why (bundled beamlynx-ui 0.64.0).
- A value that can't be edited now says why as soon as you try, instead of opening an editor: a row's `id`, a table whose `id` isn't in the result, and values the query works out rather than reads from a table (bundled beamlynx-ui 0.64.0).
- Move between result cells with the arrow keys. Select a range by dragging or with Shift, and copy it with Ctrl+C as tab-separated text that pastes into a spreadsheet (bundled beamlynx-ui 0.64.0).
- A canvas filter can match either of several conditions. In the filter panel, **+ or** adds another condition (bundled beamlynx-ui 0.64.0, pine-lang 0.47.0).

### Changed
- **Breaking:** conditions inside one `where:` are joined with `or`, not a comma: `where: status = 'blocked' or status = 'active'`. A comma there is now a parse error, and so is `and`. To require several conditions, chain `where:` steps: `where: status = 'active' | where: country = 'SE'` (bundled pine-lang 0.47.0).
- The instructions and the `where` reference an AI agent reads now say how to combine conditions: `or` inside one `where:` for either, another `where:` step for both. They used to say a comma meant AND and that Pine had no `or`. Both were wrong: a comma meant OR. The reference also told agents to run a separate query per column and combine the results themselves, which is no longer needed. It goes with the bundled pine-lang change that makes a comma or `and` inside `where:` a parse error.
- The results grid is new, and much faster. It draws only the cells in view, so scrolling stays smooth however many rows a result has. Results are no longer split into pages of 100 rows; every row is in one scrolling grid, with the row count underneath (bundled beamlynx-ui 0.64.0).
- Opening or closing Settings or the Pine panel beside the results is smooth now, instead of swapping the results for a grey placeholder while the panel moved (bundled beamlynx-ui 0.64.0).
- The delete script from **traverse** now says in its first lines how its Run button works: running the script yourself deletes everything in one transaction, while Run deletes one table at a time, each committed as it goes (bundled beamlynx-ui 0.64.0).

### Removed
- Sorting by clicking a column header, and the column menu (sort, filter, hide columns). Sorting and filtering will come back as changes to the Pine expression. To filter on a value for now, right-click the cell and choose **Filter** (bundled beamlynx-ui 0.64.0).

### Fixed
- The app's fonts now ship inside it. IBM Plex Mono, JetBrains Mono, Fira Code, Inter and IBM Plex Sans used to show only if they were installed on your computer, and a system font otherwise (bundled beamlynx-ui 0.64.0).
- Tab in the canvas filter panel moved focus out of the panel. It now moves through the panel's own fields and buttons (bundled beamlynx-ui 0.64.0).
- A filter typed by hand that matches any of several conditions disappeared from its table on the canvas. It now shows as one chip (bundled beamlynx-ui 0.64.0).
- Hints for a condition typed after a complete one (`where: id = 1 or e.`) listed the current table's columns instead of the ones for what was being typed (bundled pine-lang 0.47.0).

## [0.17.1] - 2026-09-26
### Changed
- beamlynx has its own app icon, in the dock, taskbar, and app launcher. It used to show the stock Electron logo. The icon uses the four-bar mark from beamlynx.com.

## [0.17.0] - 2026-09-26
### Added
- Traverse from a table on the canvas: press `+` on it and pick **traverse**. It follows every table that points at it by foreign key, all the way down, and offers two operations on them (bundled beamlynx-ui 0.63.0):
  - **Count rows** lists each table with its row count. Click one to open its rows in a new tab.
  - **Delete rows…** generates the delete statements, deepest table first, as a script you can copy or run from the same panel after a confirmation.
- Joins can name several columns: `note | note_ref .note_id, .other_id`, or `a | b .x = .p, .y = .q` to write the pairs out yourself. `delete!` takes several columns too (bundled pine-lang 0.46.0).

### Changed
- **Breaking:** a foreign key made of more than one column is now one join on all of its columns. Before, Pine joined on whichever one column you named. An expression that named a column that isn't unique on its own now returns fewer rows -- the rows it should have returned all along (bundled pine-lang 0.46.0).
- **Breaking:** `delete:` is gone from Pine, replaced by the traverse action. A saved tab that still ends in `delete:` has it removed when it opens (bundled beamlynx-ui 0.63.0, pine-lang 0.46.0).
- Pine reference: the join and delete topics now describe a foreign key made of more than one column. The columns after a table **name which relationship** you mean rather than spelling out the `ON` clause, so naming one column of a key joins on all of it, and several columns can be named when one isn't enough to tell two relationships apart. `delete!` takes several columns too, which a table with no single identifying column needs. Also documents writing the pairs out yourself (`.a = .b, .c = .d`), and corrects the note about a join column that matches nothing -- the query now fails with a plain syntax error rather than `zero-length delimited identifier`.

### Fixed
- Joins on the canvas now start from the latest table unless you pick another one. Hovering over a table used to move keyboard focus to it, even with the pointer hidden while you typed, so the next `|` could join from an older table (bundled beamlynx-ui 0.63.0).
- Ctrl+C on the canvas copies again instead of opening the comment editor (bundled beamlynx-ui 0.63.0).
- Switching tabs no longer shifts the layout (bundled beamlynx-ui 0.63.0).
- The error above the results is no longer cut off. The whole message wraps over as many lines as it needs, up to six before it scrolls (bundled beamlynx-ui 0.63.0).

### Security
- An agent can no longer change your data through an operation the old check missed. MCP only refused `delete!`, found by searching the text, and let `update!`, `d!` and `u!` through. The Pine server now refuses every form, and the agent's tab refuses writes even when you press Run on it yourself. Your own tabs are unchanged (bundled beamlynx-ui 0.63.0, pine-lang 0.46.0).

## [0.16.0] - 2026-09-20
### Added
- A tab can now explain itself. Start an expression with a comment -- either `/* ... */` across lines, or a run of `--` lines -- and the canvas shows it in its top-left corner instead of leaving it as grey text. Write it from the canvas too: press `c`, click the comment button in the toolbar, or click an existing comment to edit it (bundled beamlynx-ui 0.62.0, pine-lang 0.45.0).
- MCP: an agent is now told to lead every expression it runs with a comment saying what it is looking for and why. beamlynx renders that comment as a note above the query, so the tab an agent opens shows its reasoning rather than only rows. Taught in the server instructions and repeated in `run_query`'s own description, since that is the tool that puts a tab in front of you.
- MCP: `complete_query` now lists the aliases in scope for a joined expression (`aliases in scope: u_0 = public.user, d_1 = public.document`) and says how to list an earlier table's columns (`| select: u_0.`). An agent could previously see only the last joined table's columns, with no way to discover that the others were still reachable.
- MCP: three database errors an agent cannot otherwise act on -- it never sees the generated SQL -- now come back with a line saying what to fix in Pine: a table name used as a column qualifier, a column that belongs to an earlier table in the pipeline, and a `.column` join suffix naming a column that does not exist.
- Pine reference: `where:` now documents that there is no `or` (and what to use instead), that there are no regex operators, the `::text`/`::uuid` casts, comma-separated conditions, and the full list of comparison operators.
- Pine reference: `join` now warns that a `.column` suffix naming a column that does not exist is not rejected. The query fails later with `zero-length delimited identifier`, which says nothing about the cause. Tracked as a pine-lang fix in `beamlynx-plans/pending/2026-09-19-pine-invalid-join-column.md`.
- Database Connections: you can now have more than one saved connection to the same host and port, as long as they point at different databases. Previously the second one was rejected (bundled beamlynx-ui 0.62.0, pine-lang 0.45.0).
- Add Connection form: switching to the "Connection string" tab rebuilds the string from whatever's in the Fields tab, so the two stay in sync in both directions (bundled beamlynx-ui 0.62.0).

### Changed
- MCP: `check_reveal` now waits up to 25 seconds for you to respond instead of returning "pending" immediately. An agent can call it once and wait for a decision rather than inventing its own retry delay. It still returns "still pending" if you haven't decided within that window; calling again keeps waiting.
- MCP: queries an agent runs now show in their own tab, pinned to the end of the tab strip and marked with a robot icon so it doesn't read as one of your own. It always shows the same query slot -- an agent's next query replaces whatever was there -- so closing it is always safe (bundled beamlynx-ui 0.62.0).
- MCP: when an agent asks to see something its access policy redacted, the request gets its own "Needs approval" pinned tab instead of opening as a new tab and stealing focus. The tab names the connection, quotes the agent's reason, and offers Approve/Decline. Closing it without deciding declines, so an agent waiting on a decision never hangs (bundled beamlynx-ui 0.62.0).
- MCP: an agent icon in the header, next to the bell, covers everything the agent is doing -- a dot when a result landed while you were looking elsewhere, a count when approvals are waiting. Clicking it goes to whichever needs you most (bundled beamlynx-ui 0.62.0).
- Panels now open and close with a short animation instead of appearing in a single frame, and follow your operating system's "reduce motion" setting (bundled beamlynx-ui 0.62.0).
- Results columns size to their own content instead of stretching to fill the pane, so a UUID column gets the room it needs and a short "status" column isn't stretched to match (bundled beamlynx-ui 0.62.0).
- Table colors, and hovering a table on the canvas, now tint each column's header only, not every value under it (bundled beamlynx-ui 0.62.0).
- Database Connections: switching the active tab's connection while it still has a query in it now warns that the query may reference tables the new connection doesn't have, instead of silently opening a new tab (bundled beamlynx-ui 0.62.0).
- Database Connections: renaming a connection now has its own pencil icon, instead of only working once the row is expanded (bundled beamlynx-ui 0.62.0).

### Removed
- The classic Graph mode and Legacy Layout are both gone, along with their preferences. Canvas and the Canvas + Results two-pane layout are now the only way the app works (bundled beamlynx-ui 0.62.0).

### Fixed
- MCP: the operations footer printed on every `complete_query` response taught `| group: <col> => count:`, which is a parse error -- the aggregate takes no colon. It now shows `=> count` next to the standalone `count:` operation so the two are not conflated.
- MCP: the same footer told agents to qualify a column by table name (`document.userId`), which always fails -- only an alias works. It now shows the alias form, and says so when a table name is used as one.
- MCP: `check_reveal` reported that you had edited the expression on every successful reveal, because the review tab returns it re-prettified. Only a real change is flagged now.
- Pine reference: `where:` documented `not status = 'archived'` as the way to negate, which does not parse. `!=`, `not like`, `not in` and `is not` do.
- Panels stay smooth even with a full table of results on screen. The results grid used to re-fit its columns on every frame of the animation; it now holds still, shows a skeleton of your real column headers, and fits itself once afterwards (bundled beamlynx-ui 0.62.0).
- Resizing a results column by hand no longer snaps back to its default width (bundled beamlynx-ui 0.62.0).
- Entering and leaving Zen mode no longer resets whatever you had panned or zoomed the canvas to (bundled beamlynx-ui 0.62.0).
- A blank line inside a `/* ... */` comment no longer breaks the expression (bundled beamlynx-ui 0.62.0).
- Database Connections: typing a space while renaming a connection did nothing to the text and silently switched your active connection instead (bundled beamlynx-ui 0.62.0).
- Database Connections: the rename pencil and the MCP badge no longer misalign across rows (bundled beamlynx-ui 0.62.0).
- Icon-only buttons (close, download, save, notifications, tab controls, the JSON inspector) now have accessible labels for screen readers (bundled beamlynx-ui 0.62.0).
- `? table` no longer suggests join paths that route back through a table the expression has already joined (bundled pine-lang 0.45.0).
- A comma inside one `where:` now means `OR`, as the syntax always suggested: `where: id = 1, id = 2`. Previously everything after the first condition was silently dropped (bundled pine-lang 0.45.0).
- A table your database role can't `SELECT` from now still shows up in hints -- its columns were never indexed before, so it was invisible (bundled pine-lang 0.45.0).
- A table, column, or alias starting with an underscore (`_user`) now parses (bundled pine-lang 0.45.0).

## [0.15.0] - 2026-09-12
### Added
- Database Connections: MySQL support -- a "Database type" picker (Postgres/MySQL) when adding a connection, `mysql://` connection strings, and correctly-rendered SQL (bundled pine-lang 0.44.0, beamlynx-ui 0.61.0).
- Saved connections now remember their database type (Postgres/MySQL), so a saved MySQL connection reconnects as MySQL on relaunch instead of silently defaulting back to Postgres and failing with a confusing "An error occurred while setting up the SSL connection" error.

## [0.14.0] - 2026-09-10
### Added
- Two new MCP tools, `request_reveal` and `check_reveal`, let an agent ask the user to review a query an access policy is redacting: `request_reveal` opens it in a real tab (bundled beamlynx-ui), where the user can edit the expression, reveal the real results, or decline with a comment, and returns a request id right away; `check_reveal` polls that id for the outcome.
- Results grid: a "Copy result as CSV" button (next to Export to CSV) copies the whole result to the clipboard as CSV. Also available as a "Copy Result" command palette entry (bundled beamlynx-ui 0.60.0).
- Canvas mode: adding a `where` filter on a date-looking column now offers "today" and "in the last" alongside the usual operators, adding a pair of `where:` conditions instead of asking for a literal value (bundled beamlynx-ui 0.60.0).
- Results grid: clicking a cell in a JSON column now opens its formatted, syntax-highlighted value in an editable side panel instead of editing inline in the grid row (bundled beamlynx-ui 0.60.0).

### Changed
- A connection's "apply access policy to my own queries" toggle is now off by default and opt-in, instead of on by default with an opt-out "bypass" -- an access policy protects the MCP agent only unless the owner explicitly turns this on too (bundled beamlynx-ui).
- Canvas mode: moving between table nodes with the keyboard now spotlights that table's columns in the Results grid, the same way hovering a node with the mouse already did (bundled beamlynx-ui 0.60.0).

### Fixed
- New Layout: opening the Pine/SQL panel now moves keyboard focus into it and reframes the graph to fit the canvas's new size (bundled beamlynx-ui 0.60.0).
- Canvas mode: a `where` chip added via the Results grid's right-click "Filter" action can now always be deleted or edited, instead of sometimes landing on the wrong table (bundled beamlynx-ui 0.60.0).
- Canvas mode: reopening an existing `where` chip using `ilike` no longer breaks the query on save (bundled beamlynx-ui 0.60.0).

## [0.13.0] - 2026-09-06
### Added
- Canvas mode: hovering a table now spotlights its columns in the Results grid below, so it's easy to see which columns come from which joined table without needing to turn on the "Table colors" preference (bundled beamlynx-ui 0.59.0).
- Canvas mode: click an existing order chip to open an Asc/Desc popover and change its direction, instead of reopening the column-add list (bundled beamlynx-ui 0.59.0).

### Fixed
- Results grid: right-clicking a cell and choosing "Filter" now scopes the generated `where:` to the table that cell's column actually belongs to, instead of an unqualified column name that could silently filter the wrong table in a join (bundled beamlynx-ui 0.59.0).

## [0.12.1] - 2026-09-06
### Added
- `? table` finds every join chain between two tables through the schema graph, not just the direct next hop -- e.g. `company | ? document` searches for every route, multi-hop ones included. Results are ranked by how much of a real ownership relationship each route stays within, not just by length: a denormalized shortcut column (the classic "every row also stores its tenant id" pattern) ranks last even when it's shortest, since it duplicates what a longer, more specific chain already reaches (bundled pine-lang 0.43.0).
- Canvas mode: a new "path" action (tucked behind a "+" next to select/where/join) runs the `? table` search above and lets you commit one of the discovered routes all the way to the destination in one go. The Pine editor's own autocomplete completes the same search when typed directly (bundled beamlynx-ui 0.58.0).
- Canvas mode: click a join's icon to pick Inner, Left, or Right, using the same two-circle diagram most SQL join references use (bundled beamlynx-ui 0.58.0).
- Canvas mode: click an existing where/select/order/group chip to edit it in place, instead of removing and re-adding it. Shift+J/Shift+K step through the whole pipeline -- each node, then everything configured on it -- as one flat list (bundled beamlynx-ui 0.58.0).

### Changed
- A connection's access policy can now be explicitly set to "None" (unrestricted access) even while MCP is on for it, instead of being refused -- useful for a local or sandbox database the owner doesn't need redacted. MCP still refuses to turn on, or keep running, against a named policy that has no active rule.
- Canvas mode: a resolved join's line is now a plain neutral color instead of the theme's accent -- the accent now lives on the join-type icon itself, marking the one clickable thing on the edge rather than the whole line (bundled beamlynx-ui 0.58.0).

### Fixed
- Canvas mode: a stray trailing pipe (typed by hand, or left over from an earlier edit) no longer survives adding an operation -- it used to stay in the committed expression as a dangling `| ` (bundled beamlynx-ui 0.58.0).
- Canvas mode: hovering a node now moves keyboard focus there too, matching what clicking or arrow-key navigation already did -- previously only its action bar appeared, while the "current" border stayed on whichever node the keyboard had last focused (bundled beamlynx-ui 0.58.0).

## [0.11.0] - 2026-09-02
### Added
- Tabs can be reordered by dragging them, in both the horizontal strip and a new vertical rail layout (Settings -> Appearance -> Tabs). Dragging to either end of a long rail scrolls it. The new order also drives Ctrl+Tab cycling and survives a reload (bundled beamlynx-ui 0.57.0).
- New "Toggle Layout Orientation" command (command palette): switch New Layout between side-by-side and top/bottom without using the canvas toolbar icon (bundled beamlynx-ui 0.56.0).

### Changed
- The app now re-checks for a new release every 15 minutes it stays open, not just at launch, so a session left running for hours or days still picks up a release that ships in the meantime.
- Tab close buttons now appear on hover of that tab, instead of on every tab at once. Hovering a tab also tints it and brightens its label (bundled beamlynx-ui 0.57.0).
- Database Connections list: a connection's rename field, access policy, MCP access toggle, "only apply to MCP server" toggle, refresh, and delete are now behind an expand arrow instead of five icons crammed onto one row (bundled beamlynx-ui 0.56.0).

### Fixed
- "Only apply to MCP server" kept flipping back off after almost any connection action, even though it was saved correctly to disk -- your own queries were silently protected by the policy again until the app restarted (bundled beamlynx-ui 0.57.0).
- New Layout: dragging the Pine/SQL panel's resize divider in top/bottom view no longer moves it in the opposite direction (bundled beamlynx-ui 0.56.0).
- MCP-run queries now show up nicely formatted in the Pine panel instead of the raw, unformatted expression the agent sent (bundled beamlynx-ui 0.56.0, pine-lang 0.42.0).
- Canvas's where picker: a long column name no longer gets hard-clipped mid-character, the operator and value fields have visible spacing between them, and opening the picker now focuses the operator dropdown first instead of the value field (bundled beamlynx-ui 0.56.0).

## [0.10.0] - 2026-09-01
### Added
- Named, user-creatable access policies (Settings -> Access Policy in beamlynx-ui): create/rename/delete a policy, toggle its rules. Each saved connection picks which one applies to it.
- MCP can only be enabled for a connection once its assigned policy has an active rule, and the policy can't be cleared or swapped for an inactive one while MCP is on -- there's no "reachable but unprotected" state.
- New per-connection toggle, "Only apply to MCP server": lets the owner see real data on their own queries without weakening what the agent sees.
- The control-plane server now double-checks a connection's access status at the moment an MCP call actually runs (not just when MCP was last toggled on), so a policy that went inactive afterward fails loud instead of running unprotected.

### Fixed
- Fixed an intermittent "X is not a function" from a duplicate MCP query listener left behind by dev-mode Fast Refresh.

## [0.9.1] - 2026-08-28
### Fixed
- macOS auto-update still didn't work in 0.9.0, despite that release's own fix -- the release workflow's artifact-upload step never actually included the `.zip` file `electron-builder` produces (only its `.blockmap`, matched by a broader pattern, which is what made the miss easy to overlook). `MacUpdater` requires the real `.zip` to apply an update, not just its blockmap.

## [0.9.0] - 2026-08-28
### Added
- Zen mode: a graph-only, distraction-free view that hides the header, tab strip, and Results, and turns auto-run off for as long as it's on, restored once you exit. Reachable from the command palette for now (bundled beamlynx-ui 0.53.0).
- A "Reconnect" action next to the connection label in the header, shown whenever a tab's assigned database connection isn't live -- particularly relevant here, since the bundled server can still be starting up when the window first opens (bundled beamlynx-ui 0.53.0).

### Changed
- `Ctrl`/`Cmd`+`,` now opens Settings (matching most native Mac apps' Preferences convention) instead of the SQL panel; `Ctrl`/`Cmd`+`.` still opens the Pine panel, and `Ctrl`/`Cmd`+`Shift`+`.` now opens the SQL panel (bundled beamlynx-ui 0.53.0).
- Settings now docks on the left in New Layout instead of floating on top of the canvas, so it never covers the graph or results while you tune a change against them. It also stays open across tab switches now, and no longer closes on Escape (bundled beamlynx-ui 0.53.0).

### Fixed
- Auto-update never actually worked on macOS -- `electron-updater`'s `MacUpdater` requires a `.zip` release asset to apply an update and throws `ERR_UPDATER_ZIP_FILE_NOT_FOUND` when only the `.dmg` is published, but that error was swallowed silently (no UI, only a console log), so it looked like nothing was happening. Mac releases now also publish a `.zip`. This particularly affected the Homebrew cask, which sets `auto_updates true` and has no fallback update path of its own.
- Canvas node labels, chips, and toolbars didn't scale with the Text Size setting, and were quite small even so -- they now scale, and are bigger at every size to begin with (bundled beamlynx-ui 0.53.0).

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
