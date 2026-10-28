# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.25.2] - 2026-10-28
### Changed
- **The sidebar no longer lists an agent's investigation under Agent until it has a name.** While there is only one, and the agent hasn't said its question, **Agent** opens it. (bundled beamlynx-ui 0.70.2)

### Fixed
- **The agent's question shows as soon as it says it.** This is in the sidebar and at the top of the timeline. (bundled beamlynx-ui 0.70.2)

## [0.25.1] - 2026-10-28
### Changed
- **Columns ending in `_id` are no longer shown to agents just for their name.** Integer and uuid ids are still shown by type, and foreign keys by the foreign-key rule, but a text column like `national_id` is now hidden. Existing policies have the built-in `_id` rule switched off once; switch it back on in the policy to undo.
- **An agent's query may run for 60 seconds, up from 30.** A query that takes longer, or whose tool call the agent cancels, is stopped in its tab too.
- **Agent results are capped at about 100,000 characters.** Rows past the cap are left out, and the result says how many, and how to narrow the query.
- **The dialog for opening a connection in a tab with a query shows two choices:** open it in a new tab, the default, or switch this tab. (bundled beamlynx-ui 0.70.1)
- **Connecting another agent is a plug icon in the timeline's header.** (bundled beamlynx-ui 0.70.1)
- **Agent queries that join on a hidden column are refused.** On MySQL and SQLite, a column name in another case is judged as the real column. (bundled pine-lang 0.51.1)

### Fixed
- **Applying an agent's proposed policy change no longer gets stuck.** It saves, or puts the policy back and says why. Undo never erases a change made after Apply. (bundled beamlynx-ui 0.70.1)
- **An agent's queries in one investigation run one at a time,** so each step shows its own result. (bundled beamlynx-ui 0.70.1)
- **Agent calls no longer hang while the window is loading or reloading.** The app answers right away to try again in a few seconds, until the page says it is ready with the new `mcp:bridge-ready` IPC message.
- **Policy proposals and reveal requests come back after the window reloads.** Their cards had disappeared while the agent kept waiting.
- **An agent that starts Beamlynx waits until its window is ready,** up to 60 seconds, not just until it accepts connections. The first call used to land on the loading screen.
- **Reveal requests expire after 10 minutes, like policy proposals, and the card is told with `mcp:reveal-request-expired`.** Unanswered ones used to block the connection from asking again until the app restarted.
- **Cancelling `propose_policy_change` withdraws the proposal,** so its card stops offering it.
- **Notes for the agent can no longer slow down a tool call.** The app gets 2 seconds to hand them over, and the call goes on without them after that.
- **`list_connections` and `check_reveal` start Beamlynx when it isn't running,** like the other tools. When it can't be reached, the agent is told it isn't running or is still starting.
- **An agent's connection to Beamlynx closes when the agent quits.** It used to stay behind as a background process.
- **Accented letters and other non-ASCII text in agent results are no longer garbled.** A character split between two network chunks came out as "�".
- **A damaged `connections.json` is never written over.** It used to read as empty, so the next save removed every saved connection; now the app shows none and refuses changes until the file is fixed.
- **`check_reveal` returns revealed rows only while the connection is still open to agents.**

## [0.25.0] - 2026-10-26
### Added
- **Website visits join the person who signs in.** After a sign-in, the browser tab moves on to beamlynx.com/signed-in, which tells PostHog that this browser belongs to the same person as the app. The sign-in is complete before that page loads, so it can't fail because of it. Not with usage stats off.

## [0.24.0] - 2026-10-26
### Changed
- **The sign-in screen comes back at each launch until you sign in.** Only **Skip for now** closes it, until the next launch (bundled beamlynx-ui 0.70.0).
- **Account is at the bottom of the sidebar,** with your initials once signed in and a dot until then (bundled beamlynx-ui 0.70.0).
- **Picking a connection while the tab has a query opens it in a new tab by default.** Switching this tab is the second choice (bundled beamlynx-ui 0.70.0).
- **Usage stats count queries per hour instead of sending one event per query.** Each hour with queries becomes one `queries_run` event with four counts: user or agent, Pine or SQL. It is sent once the hour is over, or at the next launch. Turning usage stats off drops counts not sent yet.

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
- **Beamlynx has its own app icon in the dock, taskbar and app launcher.** It used to show the stock Electron logo. The icon is the four-bar mark from beamlynx.com.

## [0.17.0] - 2026-09-26
### Added
- **You can follow every table that depends on a table, and count or delete their rows.** On the canvas, press `+` on a table and pick **traverse**. It follows every foreign key that points at the table, all the way down. **Count rows** lists each table with its row count; click one to open its rows in a new tab. **Delete rows…** writes the delete statements, deepest table first, as a script you can copy, or run from the same panel after you confirm (bundled beamlynx-ui 0.63.0).
- **A join can name several columns.** For example `note | note_ref .note_id, .other_id`, or `a | b .x = .p, .y = .q` to write the pairs out yourself. `delete!` takes several columns too (bundled pine-lang 0.46.0).

### Changed
- **Breaking: a foreign key made of several columns is joined on all of them.** Before, Pine joined only on the one column you named. If that column isn't unique on its own, the expression now returns fewer rows. These are the rows it should have returned all along (bundled pine-lang 0.46.0).
- **Breaking: `delete:` is gone from Pine.** The traverse action replaces it. A saved tab that still ends in `delete:` has it removed when it opens (bundled beamlynx-ui 0.63.0, pine-lang 0.46.0).
- **The Pine reference explains joins and deletes on a foreign key made of several columns.** The columns after a table name the relationship you mean, so one column of a key joins on all of it. Name more columns only when one can't tell two relationships apart. It also shows how to write the pairs out yourself (`.a = .b, .c = .d`). A join column that matches nothing now fails with a plain syntax error, and the reference says so.

### Fixed
- **A join from the canvas starts from the latest table unless you pick another.** Hovering over a table used to move keyboard focus to it, even with the pointer hidden while you typed. The next `|` could then join from an older table (bundled beamlynx-ui 0.63.0).
- **Ctrl+C on the canvas copies again.** It used to open the comment editor (bundled beamlynx-ui 0.63.0).
- **Switching tabs no longer shifts the layout** (bundled beamlynx-ui 0.63.0).
- **The error above the results is no longer cut off.** The message wraps over up to six lines, then scrolls (bundled beamlynx-ui 0.63.0).

### Security
- **AI agents can no longer change your data.** Before, only `delete!` was refused, and `update!`, `d!` and `u!` got through. The Pine server now refuses every form. The agent's tab also refuses writes when you press Run on it yourself. Your own tabs are unchanged (bundled beamlynx-ui 0.63.0, pine-lang 0.46.0).

## [0.16.0] - 2026-09-20
### Added
- **A tab can explain itself with a comment at the start of its expression.** Use `/* ... */` or a run of `--` lines. The canvas shows it in its top-left corner instead of as grey text. To write one from the canvas, press `c`, click the comment button in the toolbar, or click an existing comment to edit it (bundled beamlynx-ui 0.62.0, pine-lang 0.45.0).
- **AI agents are asked to start each query with a comment saying what they're looking for and why.** Beamlynx shows that comment as a note above the query. The tab an agent opens then shows its reasoning, not only rows.
- **AI agents can reach the columns of every table in a join.** `complete_query` lists the aliases in scope (`aliases in scope: u_0 = public.user, d_1 = public.document`). It also says how to list an earlier table's columns (`| select: u_0.`). Before, an agent saw only the last table's columns.
- **AI agents get a hint for three database errors they couldn't fix on their own.** These are a table name used as a column qualifier, a column from an earlier table in the pipeline, and a join column that doesn't exist. Agents never see the SQL, so each error now says what to change in Pine.
- **The Pine reference for `where:` covers more.** It says there is no `or` and what to use instead, and that there are no regex operators. It also covers the `::text`/`::uuid` casts, comma-separated conditions, and every comparison operator.
- **The Pine reference for joins warns about a join column that doesn't exist.** Pine doesn't reject it. The query fails later with `zero-length delimited identifier`, which doesn't say why.
- **You can save more than one connection to the same host and port,** as long as they point at different databases. Before, the second one was rejected (bundled beamlynx-ui 0.62.0, pine-lang 0.45.0).
- **The "Connection string" tab of the Add Connection form fills in from the Fields tab.** The two stay in sync both ways (bundled beamlynx-ui 0.62.0).

### Changed
- **`check_reveal` waits up to 25 seconds for your answer.** It used to return "pending" right away. An agent can call it once and wait. If you haven't decided by then it says "still pending", and calling again keeps waiting.
- **Queries an AI agent runs open in a tab of their own, marked with a robot icon.** It is pinned to the end of the tab strip. The agent's next query replaces the last one, so closing the tab is always safe (bundled beamlynx-ui 0.62.0).
- **An agent's request to see hidden values opens in a pinned "Needs approval" tab.** Before, it opened a new tab and took focus. The tab names the connection, quotes the agent's reason, and offers Approve and Decline. Closing it counts as Decline, so a waiting agent never hangs (bundled beamlynx-ui 0.62.0).
- **An agent icon in the header, next to the bell, shows what the agent is doing.** A dot means a result arrived while you were elsewhere. A count means approvals are waiting. Click it to go to whichever needs you most (bundled beamlynx-ui 0.62.0).
- **Panels slide open and closed.** They follow your system's "reduce motion" setting (bundled beamlynx-ui 0.62.0).
- **Results columns fit their content instead of stretching to fill the pane.** A UUID column gets the room it needs, and a short "status" column stays short (bundled beamlynx-ui 0.62.0).
- **Table colors, and hovering a table on the canvas, tint only the column headers.** Before, they tinted every value too (bundled beamlynx-ui 0.62.0).
- **Switching a tab with a query in it to another connection asks first.** The query may use tables the new connection doesn't have. Before, it opened a new tab without saying so (bundled beamlynx-ui 0.62.0).
- **Each saved connection has a pencil icon to rename it.** Before, you had to expand the row first (bundled beamlynx-ui 0.62.0).

### Removed
- **The classic Graph mode and the Legacy Layout are gone, with their preferences.** The canvas, with the Canvas + Results layout, is the only way the app works (bundled beamlynx-ui 0.62.0).

### Fixed
- **`complete_query` taught AI agents two things that always fail.** It showed `| group: <col> => count:`, but the aggregate takes no colon. It now shows `=> count` next to the separate `count:` operation. It also told agents to qualify a column with a table name (`document.userId`). It now shows an alias, and says so when an agent uses a table name.
- **`check_reveal` no longer says you edited the expression when you didn't.** It said so on every reveal, because the review tab reformats the expression.
- **The Pine reference showed `not status = 'archived'`, which doesn't parse.** Use `!=`, `not like`, `not in` or `is not`.
- **Panels stay smooth with a full table of results on screen.** The results grid used to re-fit its columns on every frame. It now shows your column headers while the panel moves, and fits once at the end (bundled beamlynx-ui 0.62.0).
- **A results column you resized by hand keeps its width.** It used to snap back (bundled beamlynx-ui 0.62.0).
- **Leaving Zen mode keeps the canvas where you had panned and zoomed it** (bundled beamlynx-ui 0.62.0).
- **A blank line inside a `/* ... */` comment no longer breaks the expression** (bundled beamlynx-ui 0.62.0).
- **Typing a space while renaming a connection works.** It used to switch your active connection instead (bundled beamlynx-ui 0.62.0).
- **The rename pencil and the MCP badge line up across connection rows** (bundled beamlynx-ui 0.62.0).
- **Screen readers can name the icon-only buttons.** This covers close, download, save, notifications, the tab controls and the JSON inspector (bundled beamlynx-ui 0.62.0).
- **`? table` no longer suggests paths that loop back through a table you've already joined** (bundled pine-lang 0.45.0).
- **A comma inside one `where:` means OR: `where: id = 1, id = 2`.** Before, everything after the first condition was dropped without a word (bundled pine-lang 0.45.0).
- **A table you can't `SELECT` from still shows in hints.** Before, it was invisible (bundled pine-lang 0.45.0).
- **Names that start with an underscore, like `_user`, parse** (bundled pine-lang 0.45.0).

## [0.15.0] - 2026-09-12
### Added
- **You can connect to MySQL.** Pick Postgres or MySQL under "Database type" when you add a connection, or paste a `mysql://` connection string. The SQL panel shows MySQL's SQL (bundled pine-lang 0.44.0, beamlynx-ui 0.61.0).
- **A saved connection remembers whether it is Postgres or MySQL.** Before, a saved MySQL connection came back as Postgres after a restart. It then failed with "An error occurred while setting up the SSL connection".

## [0.14.0] - 2026-09-10
### Added
- **An AI agent can ask you to see values its access policy hides.** It calls `request_reveal`, and the query opens in a tab (bundled beamlynx-ui). There you can edit the expression, show the real results, or decline with a comment. The agent checks for your answer with `check_reveal`.
- **"Copy result as CSV" copies the whole result to the clipboard.** It sits next to Export to CSV, and is also "Copy Result" in the command palette (bundled beamlynx-ui 0.60.0).
- **A filter on a date column offers "today" and "in the last".** You don't have to type a date (bundled beamlynx-ui 0.60.0).
- **Clicking a cell in a JSON column opens its value in a side panel.** It is formatted, highlighted and editable. Before, you edited it inside the grid row (bundled beamlynx-ui 0.60.0).

### Changed
- **An access policy applies only to AI agents unless you turn on "apply access policy to my own queries".** That setting is off by default. Before, the policy also covered your own queries unless you opted out (bundled beamlynx-ui).
- **Moving between tables on the canvas with the keyboard highlights their columns in the results.** Hovering with the mouse already did this (bundled beamlynx-ui 0.60.0).

### Fixed
- **Opening the Pine/SQL panel puts the cursor in it.** The graph also re-fits to the smaller canvas (bundled beamlynx-ui 0.60.0).
- **A filter added from the results grid's right-click "Filter" can always be edited or deleted.** It sometimes landed on the wrong table (bundled beamlynx-ui 0.60.0).
- **Reopening a filter that uses `ilike` no longer breaks the query when you save it** (bundled beamlynx-ui 0.60.0).

## [0.13.0] - 2026-09-06
### Added
- **Hovering a table on the canvas highlights its columns in the results.** You can see which columns come from which joined table without turning on "Table colors" (bundled beamlynx-ui 0.59.0).
- **Click a sort chip on the canvas to switch it between Asc and Desc** (bundled beamlynx-ui 0.59.0).

### Fixed
- **"Filter" from a cell's right-click menu filters the table that column belongs to.** Before, it used a bare column name, which in a join could filter the wrong table (bundled beamlynx-ui 0.59.0).

## [0.12.1] - 2026-09-06
### Added
- **`? table` finds every join path between two tables, including ones through several tables.** For example, `company | ? document`. Paths that follow a real ownership chain rank first. A shortcut column, such as a tenant id copied onto every row, ranks last even when it is shortest (bundled pine-lang 0.43.0).
- **A "path" action on the canvas joins all the way to a table in one step.** It's behind the `+` next to select, where and join, and uses the `? table` search. The Pine editor's completion offers the same search as you type (bundled beamlynx-ui 0.58.0).
- **Click a join's icon on the canvas to make it Inner, Left or Right** (bundled beamlynx-ui 0.58.0).
- **Click a where, select, order or group chip on the canvas to edit it.** Before, you removed it and added it again. Shift+J and Shift+K step through every table and chip in order (bundled beamlynx-ui 0.58.0).

### Changed
- **A connection open to AI agents can use the "None" access policy.** This suits a local or test database. Agents are still refused when the connection's policy has no active rule.
- **Join lines on the canvas are a neutral color.** The accent color marks the join-type icon, which is the part you can click (bundled beamlynx-ui 0.58.0).

### Fixed
- **A stray `|` at the end of the expression no longer stays behind after you add an operation** (bundled beamlynx-ui 0.58.0).
- **Hovering a table on the canvas moves keyboard focus to it, as clicking does.** Before, only its action bar appeared, and the focus border stayed on another table (bundled beamlynx-ui 0.58.0).

## [0.11.0] - 2026-09-02
### Added
- **Drag tabs to reorder them.** This works in the tab strip and in a new vertical tab rail (Settings → Appearance → Tabs). Ctrl+Tab follows the new order, and it survives a reload (bundled beamlynx-ui 0.57.0).
- **"Toggle Layout Orientation" in the command palette switches between side-by-side and stacked panes** (bundled beamlynx-ui 0.56.0).

### Changed
- **Beamlynx checks for a new release every 15 minutes while it is open.** Before, it checked only at launch.
- **A tab's close button appears when you hover that tab.** Hovering also tints the tab (bundled beamlynx-ui 0.57.0).
- **A connection's settings sit behind an expand arrow in the connection list.** These are rename, access policy, AI agent access, "only apply to MCP server", refresh and delete (bundled beamlynx-ui 0.56.0).

### Fixed
- **"Only apply to MCP server" no longer switches itself off.** After almost any connection action, the access policy covered your own queries again until a restart (bundled beamlynx-ui 0.57.0).
- **Dragging the Pine/SQL panel's divider in the stacked layout moves it the right way** (bundled beamlynx-ui 0.56.0).
- **Queries an AI agent runs are formatted in the Pine panel** (bundled beamlynx-ui 0.56.0, pine-lang 0.42.0).
- **The canvas filter picker is easier to use.** Long column names no longer cut off mid-letter, and the fields have space between them. The operator field gets focus first (bundled beamlynx-ui 0.56.0).

## [0.10.0] - 2026-09-01
### Added
- **You can create and name your own access policies in Settings → Access Policy.** Rename or delete them, and switch rules on and off. Each saved connection picks the policy that applies to it.
- **AI agent access needs a policy with at least one active rule.** You can't clear that policy, or swap in one with no active rule, while agents have access.
- **"Only apply to MCP server" lets you see real data in your own queries.** What AI agents see stays protected.
- **Beamlynx checks the policy each time an AI agent runs a query.** If the policy has lost its active rules, the query fails instead of running unprotected.

### Fixed
- **Fixed an occasional "X is not a function" error in development builds.**

## [0.9.1] - 2026-08-28
### Fixed
- **Auto-update on macOS works.** The fix in 0.9.0 was incomplete, because the release still left out the `.zip` file the Mac updater needs.

## [0.9.0] - 2026-08-28
### Added
- **Zen mode shows only the graph.** It hides the header, the tab strip and the results, and turns auto-run off until you leave. Find it in the command palette (bundled beamlynx-ui 0.53.0).
- **A "Reconnect" action appears next to the connection name in the header when the tab's database isn't connected.** This helps at launch, when the server may still be starting (bundled beamlynx-ui 0.53.0).

### Changed
- **`Ctrl`/`Cmd`+`,` opens Settings, as in most Mac apps.** `Ctrl`/`Cmd`+`.` still opens the Pine panel. `Ctrl`/`Cmd`+`Shift`+`.` opens the SQL panel (bundled beamlynx-ui 0.53.0).
- **Settings opens on the left instead of on top of the canvas.** You can see the graph and results while you change things. It stays open when you switch tabs, and Escape no longer closes it (bundled beamlynx-ui 0.53.0).

### Fixed
- **Auto-update on macOS never worked, and gave no sign of failing.** The Mac updater needs a `.zip` download, and releases had only the `.dmg`. Mac releases include a `.zip` from this version. This mattered most for the Homebrew install, which relies on the app's own updates.
- **Canvas labels, chips and toolbars follow the Text Size setting.** They're also bigger at every size (bundled beamlynx-ui 0.53.0).

## [0.8.0] - 2026-08-26
### Added
- **AI agents learn Pine when they connect.** A short primer arrives before their first call. When an expression fails to parse, the reference page for that operation comes back with the error.
- **A new `find_tables` tool lets an AI agent search tables by part of a name.** "ten" finds "tenant", "tenant_role" and "user_tenant_role". Agents used to guess, and often got singular and plural wrong.
- **The Pine reference pages for `count:`, `delete!`, `from:` and `limit:` have examples.** They used to be empty.

### Changed
- **Connecting to a second database on the same host and port gives a clear error.** Before, it seemed to work but replaced the first connection. Queries you meant for the first database ran against the second. Disconnect the first one before you connect the second (bundled pine-lang 0.40.0).
- **What AI agents get back is shorter and easier to act on.** Suggestions are ranked, and query results are about a third of their old size. Joins backed by a real foreign key are listed apart from guessed ones. Long lists say how many entries they left out.
- **`explain_query` is now `complete_query`.** It answers "what can I add here?" instead of returning a parse tree. The old name promised a check it never did.
- **AI agents no longer see SQL anywhere.** They couldn't run it before, and now nothing shows or teaches it to them. The Pine reference explains each example in words. Pine is where query limits are enforced, so an agent that thinks in SQL works around them.
- **`list_pine_docs` is gone.** `get_pine_doc` lists its topics in its own description, so a topic takes one call instead of two.
- **AI agents can no longer look up column types.** `run_query` used to suggest querying the database's own catalog. `complete_query` gives column names, but not types. Types are planned as a Pine feature.

### Fixed
- **Queries could stop running for good until you restarted Beamlynx.** Every query hung, while the rest of the app looked fine. The longer the app stayed open, the likelier it was. The bundled server logged every query to an output that filled up and was never read. Both sides are fixed (bundled pine-lang 0.40.0).
- **Reconnecting to a database closes the old connection.** A long session could pile up dozens, until the database refused new ones (bundled pine-lang 0.40.0).
- **The local server behind AI agents accepts only the request type it expects.** Any other request could leave it waiting.

## [0.7.0] - 2026-08-25
### Added
- **Settings has an Appearance section with three themes: Light, Dark and Sepia.** Each has its own matching set of colors (bundled beamlynx-ui 0.52.0).
- **Pick the Interface font and the Code font separately.** Interface: System, Inter or IBM Plex Sans. Code: IBM Plex Mono, JetBrains Mono, Fira Code or System Monospace. This replaces the single font setting (bundled beamlynx-ui 0.52.0).
- **A Text size setting (Small, Medium, Large) scales text and spacing.** Panels and the canvas keep their size (bundled beamlynx-ui 0.52.0).
- **The loading screen matches your theme.** Without one, it follows your system's light or dark setting. It also shows a few status messages while the server starts.

### Fixed
- **Two-finger scrolling on a trackpad pans the graph instead of zooming,** as in Miro and Figma (bundled beamlynx-ui 0.52.0).
- **Keyboard navigation on the canvas wraps from the last table back to the first** (bundled beamlynx-ui 0.52.0).

## [0.6.2] - 2026-08-23
### Changed
- **The Canvas and Results panes have the same 8px gap on every side and between them** (bundled beamlynx-ui 0.51.2).

### Fixed
- **The "update ready" notice no longer says "restart" twice.** Its "Restart Now" button also looks like a button (bundled beamlynx-ui 0.51.2).

## [0.6.1] - 2026-08-23
### Changed
- **Set a connection's color in Settings → Database Connections by clicking its status dot.** Before, it was in the connection picker at the top left (bundled beamlynx-ui 0.51.1).
- **The Updates window shows a short title for each change, with the details underneath** (bundled beamlynx-ui 0.51.1).
- **New shortcuts for the Pine and SQL panels: Ctrl/Cmd+. for Pine, Ctrl/Cmd+, for SQL.** They replace Ctrl/Cmd+Shift+E and Ctrl/Cmd+Shift+S (bundled beamlynx-ui 0.51.1).
- **Each filter you add on the canvas becomes its own `where:` step.** Several filters on one table still all have to match (bundled beamlynx-ui 0.51.1).

### Fixed
- **Table colors no longer vanish when you open the SQL panel** (bundled beamlynx-ui 0.51.1).
- **Auto-run keeps working while the SQL panel is open** (bundled beamlynx-ui 0.51.1).

## [0.6.0] - 2026-08-23
### Added
- **The canvas is the default way to build a query.** Canvas and results sit side by side or stacked, and results update as you edit. The classic sidebar layout is one click away (bundled beamlynx-ui 0.51.0).
- **Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab switch tabs,** as in a browser (bundled beamlynx-ui 0.51.0).

### Fixed
- **The canvas could freeze while the Pine/SQL panel was open.** Edits did nothing. A session reopened with the panel open could show "Connecting…" forever (bundled beamlynx-ui 0.51.0).
- **A join with no column left to connect on shows as a dashed warning line.** This can happen after you delete the table between two others. Before, it looked like a normal join (bundled beamlynx-ui 0.51.0).

## [0.5.0] - 2026-08-22
### Added
- **You can rename a saved connection** (bundled beamlynx-ui 0.50.0).
- **A refresh icon next to each live connection in Settings → Database Connections picks up new tables and columns.** No restart needed (bundled beamlynx-ui 0.50.0, pine-lang 0.39.0).
- **Use the canvas from the keyboard.** Move between tables with the arrow keys or `j`/`k`. Press a single letter to run an operation on the highlighted table (bundled beamlynx-ui 0.50.0).

### Fixed
- **The graph could show "Connecting…" forever after the connection was live.** A tab's first query was sent before its connection was ready, failed silently, and was never retried (bundled beamlynx-ui 0.50.0).
- **A guessed join between columns of different types, such as text and uuid, works.** Postgres used to reject it (bundled pine-lang 0.39.0).

### Changed
- **The menu bar is gone on Windows and Linux.** It only repeated the app's own header. macOS keeps a small one, because copy, paste and undo in text fields need its Edit menu.
- **Settings → About shows the app's version** (bundled beamlynx-ui 0.50.0).

## [0.4.0] - 2026-08-17
### Added
- **AI agents such as Claude Code can query your saved connections through MCP.** Turn it on for each connection, and copy the setup command, in the new Settings page (bundled beamlynx-ui 0.49.0).
- **A `beamlynx://` link opens a saved connection with a query filled in.**
- **A Settings page, behind the gear icon next to the bell, holds connections, preferences and MCP setup** (bundled beamlynx-ui 0.49.0).
- **Pick a database type when you add a connection, and its default port fills in** (bundled beamlynx-ui 0.49.0).

### Security
- **The bundled server is reachable only from your own computer.** It used to listen on every network interface, and it has no password, so anyone on your network could reach it (bundled pine-lang 0.38.2).

## [0.3.0] - 2026-08-14
### Added
- **`beamlynx --app-version` prints the installed app's version and exits,** without opening the window.

## [0.2.2] - 2026-08-14
### Changed
- **macOS builds are signed and notarized by Apple.**

## [0.2.0] - 2026-08-14
### Added
- **An experimental view builds Pine queries by clicking through tables in a graph** (bundled beamlynx-ui 0.48.1).

### Changed
- **The whole app has one visual style, a schematic, blueprint look** (bundled beamlynx-ui 0.48.1).

### Fixed
- **The loading screen uses the new colors.** Before, its colors flashed to the new look once the app loaded.

## [0.1.19] - 2026-08-09
### Changed
- **Each tab connects to its own database when you open it.** Before, every tab followed the connection you picked last. The app no longer opens the connection picker at launch; it reconnects the tab you were on. A hollow dot in the connection's color means it isn't connected yet; it fills in once it is (bundled beamlynx-ui 0.47.0).

### Fixed
- **A query that fed a checkpoint into a final `group:` produced broken SQL** (bundled pine-lang 0.37.3).
- **Clicking a graph node no longer moves focus into the Pine input.** It counted as a Tab press and jumped to the first suggestion (bundled beamlynx-ui 0.47.0).
- **Picking a connection at startup no longer opens a stray tab or changes the connection of your other tabs** (bundled beamlynx-ui 0.47.0).
- **Restarting the app no longer forgets every tab's connection.** Tabs from older versions reconnect too (bundled beamlynx-ui 0.47.0).
- **The connection picker's checkmark shows the right connection after you switch tabs** (bundled beamlynx-ui 0.47.0).
- **A saved connection that can't reconnect shows an error.** This happens when it was deleted, renamed, or its database is down. Before, nothing appeared (bundled beamlynx-ui 0.47.0).
- **The connection list shows a solid dot only for connections that are live.** Others show a hollow dot (bundled beamlynx-ui 0.47.0).
- **A tab's connection no longer flashes as `host:port` at launch before its name appears** (bundled beamlynx-ui 0.47.0).

## [0.1.18] - 2026-08-04
### Fixed
- **Join hints for a column like `tenant_id` survive a checkpoint (`l:` or `group:`).** They used to disappear unless `id` was selected too (bundled pine-lang 0.37.2).
- **Adding a connection to a database that can't be reached gives a clear error** (bundled pine-lang 0.37.2).
- **A failed connection shows an error message.** Before, a wrong password or an unreachable database failed silently (bundled beamlynx-ui 0.46.2).
- **A saved connection no longer shows as connected at launch before it really is** (bundled beamlynx-ui 0.46.2).
- **When nothing is connected, the connection picker opens.** If you have no connections yet, the form to add one opens. Before, you saw only "Not connected to database" (bundled beamlynx-ui 0.46.2).

## [0.1.17] - 2026-08-03
### Fixed
- **The changelog no longer says "-1 days ago" for an entry from today.** This happened in time zones behind UTC (bundled beamlynx-ui 0.46.1).

## [0.1.16] - 2026-08-03
### Added
- **Your tabs come back after a reload.** Each keeps its Pine or SQL text, input mode and connection (bundled beamlynx-ui 0.46.0).
- **`Ctrl/Cmd+S` ("Save Tab") downloads the tab's Pine expression as a `.pine` file** (bundled beamlynx-ui 0.46.0).
- **"List Database Connections" and "New Database Connection" are in the command palette** (bundled beamlynx-ui 0.46.0).

### Fixed
- **Tab cycles through Pine suggestions while the graph has focus.** It used to move between graph nodes instead (bundled beamlynx-ui 0.46.0).

## [0.1.15] - 2026-08-02
### Fixed
- **Only one copy of Beamlynx runs at a time.** Opening it again brings the open window to the front. A copy left running after a crash could stop your changes being saved.
- **No more white flash when the app opens.**
- **The notification bell has the right color** (bundled beamlynx-ui 0.45.2).

## [0.1.14] - 2026-08-02
### Fixed
- **Saved connections show their color and name in the connection picker.**
- **The "Database Connection" dialog no longer opens by itself when you already have connections.**

### Changed
- **The notification bell no longer shakes for new updates.** It still changes color.

## [0.1.13] - 2026-08-02
### Added
- **Connections you add are saved and come back when you reopen the app.** They're encrypted with your system's secret store: Keychain on macOS, DPAPI on Windows, and libsecret or KWallet on Linux. Without a secret store, connections aren't saved, and you enter them again each time.
- **Saving connections works on Linux desktops the system doesn't recognize, such as Hyprland.** Before, those reported no secret store, even with gnome-keyring running.

### Changed
- **Deleting a connection from the picker also forgets its saved password.**

## [0.1.12] - 2026-08-02
### Changed
- **The update banner uses the app's own colors.**

## [0.1.11] - 2026-08-02
### Fixed
- **Your preferences survive an auto-update.** Settings such as vim mode, sidebar width and theme could revert, because the restart for an update could happen before they were saved to disk.

## [0.1.10] - 2026-08-02
### Added
- **The app shows auto-update progress.** You see "Downloading update... NN%", then "Update ready -- Restart to install". This replaces the system notification.

## [0.1.9] - 2026-08-02
### Added
- **A loading screen appears right away at launch.** Before, the window was blank for several seconds while the server started.
- **Desktop shortcuts: `Ctrl/Cmd+K` opens the command palette, `Ctrl/Cmd+T` a new tab, `Ctrl/Cmd+W` closes the tab.**

### Changed
- **`Ctrl/Cmd+W` closes the tab, not the whole window.**
- **The server version chip (such as `[0.37.0]`) is gone from the header.**

### Fixed
- **The window opens right away at launch.** Before, it waited for the server to start, which took up to 15 seconds.

## [0.1.8] - 2026-08-02
### Changed
- **Sign-in is no longer required.** It was added in 0.1.6. Signing in with Google doesn't work from the desktop app, and email and password alone weren't worth keeping it for.

## [0.1.7] - 2026-08-01
### Changed
- **No changes you'll notice.** This release tested that a link to the AppImage still works after an auto-update.

## [0.1.6] - 2026-08-01
### Added
- **Sign-in is required, as in the hosted app.**

### Fixed
- **The Linux AppImage keeps the same file name across updates: `beamlynx.AppImage`.** It used to be `beamlynx-X.Y.Z.AppImage`, so a link to it broke after each update.

## [0.1.5] - 2026-08-01
### Changed
- **No changes you'll notice.** This release tested that auto-update still downloads only what changed.

## [0.1.4] - 2026-08-01
### Fixed
- **The Linux AppImage runs without FUSE.** Many distributions, such as Arch, Ubuntu 22.04 and later, and Fedora, no longer include it. The AppImage failed with "dlopen(): error loading libfuse.so.2" unless you installed `fuse2` or ran it with `--appimage-extract-and-run`.

## [0.1.3] - 2026-08-01
### Changed
- **No changes you'll notice.** This release tested that an installed 0.1.2 finds, downloads and installs an update.

## [0.1.2] - 2026-08-01
### Added
- **Auto-update writes its progress to the console log.** It used to log nothing unless something failed.

## [0.1.1] - 2026-08-01
### Changed
- **No changes you'll notice.** This release tested that an installed 0.1.0 finds, downloads and installs an update.

## [0.1.0] - 2026-08-01
### Added
- **First release: one app with the Pine server and the Beamlynx interface built in.** It needs no Docker, and the two always match.
- **The app updates itself from GitHub Releases.**
- **Installers for Linux (AppImage, deb) and Windows.** The macOS dmg is not signed yet.
