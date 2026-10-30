# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]
### Changed
- **Beamlynx now always counts each launch, and who is signed in.** Each launch sends the app version and OS. If you are signed in, it also sends your name and email. The **Send detailed usage stats** switch in Settings → Account now covers only query counts and the database types you add. If you had turned usage stats off, launches are now counted again.

## [0.26.0] - 2026-10-28
### Added
- **Join on ids inside a JSON array:** `documents_package as dp | officer .id = .officers[*].id` joins each package to the officers its `officers` array lists. `[*]` means any element of the array. (bundled pine-lang 0.52.0)
- **The results show how long the query took,** next to the row count. (bundled beamlynx-ui 0.71.0)

### Changed
- **Access policies are now called masking policies.** The info icon next to Settings → Masking templates explains what masking does. (bundled beamlynx-ui 0.71.0)
- **Agents can filter, sort and join on a masked column again.** The masking policy hides what comes back, not what an agent asks. An agent that already knows an email can find the rows that hold it, but still sees `xxxxx` in place of the column. Agents are told this in their instructions. (bundled pine-lang 0.52.0)

## [0.25.2] - 2026-10-28
### Changed
- **An agent's investigation appears under Agent in the sidebar only once it has a name.** Until then, while there is only one investigation, clicking **Agent** opens it. (bundled beamlynx-ui 0.70.2)

### Fixed
- **The agent's question shows as soon as the agent states it.** You'll see it in the sidebar and at the top of the timeline. Before, it only appeared with the agent's next step. (bundled beamlynx-ui 0.70.2)

## [0.25.1] - 2026-10-28
### Changed
- **A column is no longer shown to agents just because its name ends in `_id`.** Number and uuid ids, and foreign keys, are still shown, but a text column like `national_id` is now hidden. Existing policies have this rule switched off once; switch it back on in the policy to undo.
- **An agent's query may run for 60 seconds, up from 30.** If it runs longer, or the agent cancels the call, the query also stops in its tab.
- **Results sent to an agent are capped at about 100,000 characters.** The result says how many rows were left out, and how to narrow the query.
- **When you open a connection in a tab that already has a query, a dialog offers two choices.** Open it in a new tab, which is the default, or switch this tab. (bundled beamlynx-ui 0.70.1)
- **To connect another agent, use the plug icon in the timeline's header.** (bundled beamlynx-ui 0.70.1)
- **An agent's query that joins on a hidden column is refused.** On MySQL and SQLite, a hidden column is also recognised when its name is written in a different case. (bundled pine-lang 0.51.1)

### Fixed
- **Applying an agent's proposed policy change no longer gets stuck.** It either saves, or puts the policy back and says why. Undo never erases a change you made after Apply. (bundled beamlynx-ui 0.70.1)
- **An agent's queries in one investigation run one at a time.** Each step in the timeline shows its own result. (bundled beamlynx-ui 0.70.1)
- **AI agents no longer hang while Beamlynx is starting or reloading.** They're told right away to try again in a few seconds.
- **Cards for an agent's policy proposals and requests to see hidden values come back after the window reloads.** Before, they disappeared while the agent kept waiting.
- **An agent that starts Beamlynx waits until its window is ready, for up to 60 seconds.** Its first call used to land on the loading screen.
- **An agent's request to see hidden values expires after 10 minutes without an answer.** Before, an unanswered request stopped agents asking again on that connection until you restarted Beamlynx.
- **When an agent cancels its `propose_policy_change` call, the proposal is withdrawn.** Its card no longer offers to apply it.
- **Messages Beamlynx adds to an agent's call can no longer slow it down.** If they take more than 2 seconds, the call goes on without them.
- **`list_connections` and `check_reveal` start Beamlynx when it isn't running, like the other agent tools.** If Beamlynx can't be reached, the agent is told it isn't running or is still starting.
- **An agent's connection to Beamlynx closes when the agent quits.** It used to stay behind as a background process.
- **Accented letters and other non-ASCII text in agent results are no longer garbled.** Some characters used to come out as "�".
- **A damaged `connections.json` is never written over.** Before, it read as empty, so the next save deleted every saved connection. Now Beamlynx shows no connections and refuses changes until the file is fixed.
- **`check_reveal` returns revealed rows only while the connection is still open to agents.** If you turn off agent access first, the agent gets nothing.

## [0.25.0] - 2026-10-26
### Added
- **After you sign in, your visits to beamlynx.com count as the same person as the app.** The browser tab moves on to beamlynx.com/signed-in, which tells usage stats that this browser and the app belong together. Sign-in is already complete by then, so this page can't make it fail. Nothing is linked when usage stats are off.

## [0.24.0] - 2026-10-26
### Changed
- **The sign-in screen comes back at each launch until you sign in.** **Skip for now** closes it until the next launch. (bundled beamlynx-ui 0.70.0)
- **Account is at the bottom of the sidebar.** It shows your initials once you sign in, and a dot until then. (bundled beamlynx-ui 0.70.0)
- **Choosing a connection while the tab has a query opens it in a new tab by default.** Switching this tab is the second choice. (bundled beamlynx-ui 0.70.0)
- **Usage stats send one count per hour instead of one event per query.** Each hour with queries sends how many ran, split by you or an agent, and by Pine or SQL. It is sent when the hour is over, or at the next launch. Turning usage stats off drops counts not yet sent.

## [0.23.0] - 2026-10-26
### Added
- **You can sign in with GitHub, and the app sends anonymous usage stats.** Sign-in opens your browser, and you can skip it. The stats are a few events, such as app opened, connection added and query run, and never include query text, table names or connection details. Nothing is sent before you've seen the first-run screen, and you can turn stats off in Settings → Account. Beamlynx never waits for these services, so it works offline as before. (bundled beamlynx-ui 0.69.0)
- **Agents can read a connection's access policy and propose changes to it.** `get_access_policy` lists the rules, never data. `propose_policy_change` shows you the change as a card, and nothing changes until you apply it. The agent waits up to 10 minutes for your answer.
- **Each connection sets what agents may see: Off, Masked or Every column.** You'll find it in Settings → Connections. Every column lets agents read all values, and keeps the access policy for when you switch back. An older Beamlynx treats such a connection as Masked.
- **`group:` with no keys gives one row of totals.** Aggregates can be named: `orders | group: with count as n, total => sum as revenue`. (bundled pine-lang 0.51.0, beamlynx-ui 0.69.0)
- **Pine has `jsonb_typeof()` and `jsonb_array_length()`, and a function can go on the left of a condition.** For example, `where: jsonb_typeof(data) = 'array'`. (bundled pine-lang 0.51.0)
- **`order:` takes `nulls first` and `nulls last`.** (bundled pine-lang 0.51.0)
- **More SQL converts to Pine.** This includes JSON keys like `data->>'plan'`, `EXISTS` and `NOT EXISTS`, `COUNT(column)`, and `GROUP BY 1` / `ORDER BY 3`. (bundled pine-lang 0.51.0)

### Changed
- **Each connection has its own access policy.** Policies are no longer shared between connections. The policies listed in Settings are templates that you copy into a connection. After the upgrade, each connection keeps exactly the rules it had.
- **The Default template is built in, and can't be edited.** A stored policy called "Default" is removed once, on upgrade.
- **A new connection starts with no access policy.** Beamlynx asks for one when you turn on agent access.
- **An agent's query that uses a hidden column is refused at once.** It used to wait while Beamlynx asked you. The refusal tells the agent to ask for the column with `propose_policy_change`.
- **The Pine reference agents read covers the newer Pine.** That is `nulls first` and `nulls last`, `jsonb_typeof()`, `jsonb_array_length()`, and a function on the left of a condition. It also corrects the default sort order: Pine sorts descending.
- **The connection list is clearer, confirmations work one way, and the agent's timeline is shorter.** A zap marks the tab's connection, and a robot shows agent access. Anything that weakens protection or deletes something asks in a dialog. The timeline follows the newest step. (bundled beamlynx-ui 0.69.0)

### Removed
- **You can no longer pick a shared policy for a connection, or copy a shared one.** Every connection now has its own policy.

### Fixed
- **Dates and times in results are exact on Postgres.** A timestamp keeps its fraction of a second, and a `DATE` shows as `1990-07-22` instead of midnight UTC. (bundled pine-lang 0.51.0)
- **SQL to Pine: selecting only an earlier table's columns no longer adds every column of the last table.** (bundled pine-lang 0.51.0)

## [0.22.1] - 2026-10-19
### Fixed
- **Beamlynx no longer crashes at launch on macOS.** Since 0.20.0 it quit within seconds of opening, every time. The cause was the capital B in the app's internal name, which is lowercase again. Finder, the Dock and the app switcher still show "Beamlynx", but the bold app title in the menu bar shows "beamlynx".

## [0.22.0] - 2026-10-19
### Added
- **When you show or hide a column for agents and its policy is shared, you can change a copy instead.** Beamlynx asks whether to copy the policy for this connection only, or change it for every connection that uses it. The Allow card in an agent's investigation offers the same choice. (bundled beamlynx-ui 0.68.0)

### Changed
- **The agent sits at the bottom of the sidebar, and only appears once an agent has started an investigation.** (bundled beamlynx-ui 0.68.0)

### Fixed
- **Your own queries in an agent's investigation tab are no longer always masked.** They follow "Also restrict my own queries", like your other tabs. The agent's queries there are masked while they run. (bundled beamlynx-ui 0.68.0)

## [0.21.0] - 2026-10-18
### Added
- **Each AI agent session gets its own investigation tab.** Open it from the robot in the sidebar. A timeline beside the canvas keeps every step: each query, the agent's reason for it, and what came back, failures included. Click a query to see its rows again, exactly as the agent saw them. (bundled beamlynx-ui 0.67.0)
- **You can steer an agent by writing notes in its investigation tab.** The agent gets them at the start of its next call to Beamlynx. Beamlynx can't message the agent first, so a note waits for that call.
- **When an agent's query is refused for a hidden column, you can allow the column while the agent waits.** A card in the investigation's timeline asks you. If you allow it, the query runs again and the agent gets the rows; if you decline, the agent gets your answer. The agent waits up to 10 minutes. (bundled pine-lang 0.50.0, beamlynx-ui 0.67.0)
- **An agent's request to see hidden values shows as a card in its investigation.** It used to open a tab of its own. You can look at the real rows before revealing them. (bundled beamlynx-ui 0.67.0)
- **Two new agent tools: `set_question` and `note_finding`.** `set_question` names what the agent is investigating, and becomes the tab's title. `note_finding` records what it found, from Beamlynx or elsewhere, shown next to its queries.
- **Access policies can list exceptions.** A column that an Except rule matches stays hidden from agents, even when an Allow rule matches it too. A rule can match a column whose name contains, ends with or equals some text, or one exact column of one table. Settings → Access Policy lists the Allow rules, then the exceptions. (bundled pine-lang 0.50.0, beamlynx-ui 0.67.0)
- **Right-click a cell or column header to show or hide that column for agents.** Choose **Show to agents** or **Hide from agents**, and a message says which policy changed and which other connections use it, with Undo. A column hidden from agents has a crossed-out eye in its header, even in your own tabs, where you still see its values. (bundled pine-lang 0.50.0, beamlynx-ui 0.67.0)
- **There is a sidebar on the left.** The database connection is at its top, then the agent, the Settings sections and What's new. It shows icons only, or expands to show labels and the agent's investigations. (bundled beamlynx-ui 0.67.0)

### Changed
- **Every policy hides columns whose name contains `token`, `password` or `secret`.** New policies start with these exceptions, and existing policies got them once, switched on. Switch them off or remove them in Settings → Access Policy.

### Fixed
- **SQL to Pine: a column without a table name, in a query with a join, belongs to the one table that has it.** This matches SQL. It used to be refused. (bundled pine-lang 0.50.0)

## [0.20.0] - 2026-10-17
### Added
- **The canvas draws checkpoints and query blocks.** A `limit:` or `group:` becomes its own node, named like `result_1`, that works like any table. A checkpoint, or a table that uses an earlier block's `|= name`, opens into a dashed box showing what it holds. With several query blocks in a tab, a strip at the top shows which is made from which. The toolbar's refresh icon puts dragged nodes back. (bundled beamlynx-ui 0.66.0)
- **Top N per group: `limit: 1 per customer_id`.** It keeps the first rows of each group, ranked by the `order:` before it, such as each customer's latest order. (bundled pine-lang 0.49.0)
- **`select:` can compute values.** For example `coalesce(title, 'untitled') as label`, `if ... then ... else`, or a condition as true or false. The arrow applies a function, as in `created_at => month`. A group takes aggregates after `with`: `group: customer_id with count, total => sum as spent`. (bundled pine-lang 0.49.0)
- **The SQL panel completes names and turns your SQL into Pine.** It completes table and column names, and suggests joins after `JOIN`. The canvas follows the SQL as you type. (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0)
- **A key inside a JSON column works like a column.** For example, `where: data.country = 'SE'`. It works on the canvas too, and you can edit its cell. (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0)
- **Stop a running query with the Stop button or Escape.** (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0)
- **The results remember column widths.** (bundled beamlynx-ui 0.66.0)
- **The robot in the header shows every call an AI agent makes.** It pulses while an agent works, and opens a log of each call: what the agent did, what it sent, and how it went. This includes calls that never open a tab, like `find_tables`. Logging never slows a call or opens the app. (bundled beamlynx-ui 0.66.0)
- **AI agents can send SQL with the new `run_sql_as_pine` tool.** Beamlynx converts it to Pine and runs only the Pine, in a visible tab, under the connection's access policy. An `UPDATE` or `DELETE` converts and shows in the tab, but never runs: only you can run a change. SQL that Pine can't express, like `OFFSET` or `UNION`, runs nothing and returns the reason. It is a separate tool, so you can allow Pine queries in your agent's settings and refuse SQL.
- **The Pine reference agents read covers the newer Pine.** It lists `>=` and `<=`, which it used to say Pine didn't have. It adds keys inside JSON columns, writing into a key with `update!`, negative and decimal numbers, computed values, aggregates in `group:`, and `limit: 1 per`. The instructions agents start with tell them to use one `limit: ... per` query instead of one query per group, since each run opens in your tab.
- **Beamlynx can open SQLite database files.** Choose SQLite as the database type and pick the file with **Browse…**. A SQLite connection saves only the file's path, so it needs no password, and saves even on a computer without secure credential storage.
- **Settings are kept in `beamlynx.db`, the app's own data file.** They used to be in the browser's storage, which Beamlynx still uses if the file can't be opened.

### Changed
- **Breaking: a group's aggregates come after `with`, as in `group: status with count`.** `group: status => count` is now an error that names the new form, in saved recipes too. Agents are taught the new form. (bundled pine-lang 0.49.0)
- **Breaking: editing a cell finds the row by the table's primary key, not by a column called `id`.** Tables without a primary key can't be edited from the results. (bundled beamlynx-ui 0.66.0)
- **A dev build keeps its own `beamlynx.db`, separate from the installed app's.** Experiments in a dev build no longer touch the installed app's settings and recipes. Recipes saved from a dev build before this stay in the installed app's file. Saved connections are still shared.
- **Beamlynx only opens `http`, `https` and `mailto` links in your browser.** Any other link is refused.
- **Cells longer than 2,000 characters are cut short in results sent to an agent.** The cell says how much was left out, so one large text or JSON value can't flood the agent's context.
- **The Pine reference agents read matches the bundled pine-lang.** It covers an apostrophe written twice in a string, date-time literals, `limit:` from 0 to 10,000, and `delete!` needing a `where:` or `limit:`. It also says that under an access policy, hidden columns can't be filtered, sorted or grouped on, and unindexed tables are refused.

### Fixed
- **Opening the app while a database is down no longer leaves tabs stuck on "Not parsing".** The tab says it can't reach the database, and tries again every 10 seconds while it's open. It draws its graph once the database answers. (bundled beamlynx-ui 0.66.0, pine-lang 0.49.0)
- **If the port AI agents connect through can't open, Beamlynx says so.** It used to fail silently. Agents then get a clear error.
- **When the bundled query server fails to start, the error says why at once, with what the server printed.** It used to wait 15 seconds and say only that the server "did not become ready". A server that can't be started at all no longer crashes the app.
- **If the query server stops while the app is open, Beamlynx offers to restart it.** Before, every query failed until you reopened the app.
- **At start-up, Beamlynx no longer risks stopping an unrelated program.** It stops a server left behind by a crash only if that process is still a Pine server. After a reboot, the process number it remembered could belong to something else.
- **KDE Plasma 5 can save connections again.** Beamlynx asked for KWallet 6, which Plasma 5 doesn't have, so saving failed with no explanation.
- **A dev build opens `beamlynx://` links itself, not in a bare Electron.**

### Security
- **Beamlynx ignores every `beamlynx://` link except `beamlynx://run`.** A run link opens a tab with its query, but doesn't run it.
- **Other programs and web pages can no longer use the bundled query server or the port AI agents connect through.** Both need a secret the app creates at each launch. For agents, it is written to `control-plane.json` in the app's data folder, readable only by you, where `beamlynx --mcp` reads it. The agent port also refuses any request from a web page.
- **An agent can no longer ask to see the hidden values of a query that changes data.** Beamlynx checks the query first, and refuses unless it only reads. At most three such requests per connection can wait at once.
- **The bundled server only accepts connections from your own computer, even if `PINE_HOST` is set.**
- **The saved-connections file is readable only by you.** It lists each saved database's host, name and user. The passwords in it were already encrypted.

## [0.19.0] - 2026-10-06
### Changed
- **Breaking: Ctrl+S saves a recipe instead of downloading the tab as a `.pine` file.** (bundled beamlynx-ui 0.65.0)
- **Breaking: Beamlynx needs macOS 13 or later.** It now runs on Electron 44, up from Electron 31, which no longer gets security fixes. macOS 11 and 12 are no longer supported.
- **Building beamlynx-desktop needs Node 22 or later.** See DEVELOPMENT.md.

### Added
- **Variables: write `$name` in a query where a value goes.** Set it in a values block above the query, like `$company_name = 'Acme'`, or a list for `in`, like `$statuses = ('failed', 'stuck')`. On the canvas, a Variables list shows each `$name` and its value; click a value to change it. (bundled beamlynx-ui 0.65.0, pine-lang 0.48.1)
- **Save a query as a recipe with Ctrl+S.** A bar above the tab asks for a title. The recipe keeps the query's comments and the values blocks it uses. (bundled beamlynx-ui 0.65.0)
- **Open a recipe with Ctrl+O.** Search for any word in its title, comments or query, then click it or press Enter to put it in the tab. Delete a recipe with the trash icon on its row. (bundled beamlynx-ui 0.65.0)
- **A named result with one column can be used after `in`.** For example, `employee | where: id in acme_emps`. (bundled pine-lang 0.48.1)
- **AI agents can pass values for `$variables` when they run a query.** `run_query` takes `variables: {"company_name": "Acme", "tenant_ids": [17, 23]}`, and each is sent as a value, never pasted into the query. A whole number above 2^53 is refused, because JSON has already rounded it, so pass large ids as strings. The Pine reference agents read teaches values blocks and a one-column named result after `in`. Its new `variables` topic covers `$name`, and what it used to call variables (`|= name`) is now the `named-results` topic.
- **Beamlynx keeps recipes in its own data file, `beamlynx.db`.** It sits in the same folder as saved connections. Recipes are offered on every database, since local, staging and production usually share a schema, and each remembers which database it was saved from. If the file is damaged, Beamlynx keeps it as `beamlynx.db.bad` and starts a new one.
- **A dev build (`npm start`) shows an amber DEV chip in the header.** That way it can't be mistaken for the installed app when both are open.
- **A dev build can run next to the installed app.** It uses its own ports (43333 and 43334) and data folder, `beamlynx-desktop-dev`, but shares saved connections. In Settings → MCP it registers as `beamlynx-dev`, so an agent can use either copy. See DEVELOPMENT.md.

### Fixed
- **Keys pressed in a dialog no longer reach the canvas behind it.** In a dialog such as the Ctrl+O recipe picker or the command palette, Backspace, Delete or `x` used to delete the selected item in your tab. (bundled beamlynx-ui 0.65.0)
- **New Database Connection in the command palette opens the add form again.** It had opened Settings on the list of connections. (bundled beamlynx-ui 0.65.0)
- **A cast after an `in` list applies to the column.** In `where: name in ('a') ::text`, the cast was read as one more value, so the query matched `'text'` too. (bundled pine-lang 0.48.1)
- **Opening Beamlynx while it's already open says so.** It used to quit without a word, and on some desktops, such as Hyprland, the open window didn't come forward.
- **If a port Beamlynx needs is taken, it says what's using it.** That could be another copy of Beamlynx, a Pine server started some other way, or another program. A taken agent port (33334) used to go unhandled.
- **On Linux, agent setup for the AppImage keeps working after you close the app.** The setup instructions pointed at a temporary folder (`/tmp/.mount_…`) that gets a new name on every launch. They now point at the AppImage file itself.

## [0.18.0] - 2026-09-28
### Added
- **After you edit a value in the results, its cell glows briefly and a message says it was saved.** If it wasn't saved, the message says why. (bundled beamlynx-ui 0.64.0)
- **A value that can't be edited says why as soon as you try.** It used to open an editor anyway. This covers a row's `id`, a table whose `id` isn't in the result, and values the query computes rather than reads from a table. (bundled beamlynx-ui 0.64.0)
- **Move between result cells with the arrow keys.** Select a range by dragging or with Shift, and copy it with Ctrl+C. It pastes into a spreadsheet as tab-separated text. (bundled beamlynx-ui 0.64.0)
- **A canvas filter can match any of several conditions.** In the filter panel, **+ or** adds another condition. (bundled beamlynx-ui 0.64.0, pine-lang 0.47.0)

### Changed
- **Breaking: conditions inside one `where:` are joined with `or`, not a comma.** For example, `where: status = 'blocked' or status = 'active'`. A comma or `and` there is now a parse error. To require several conditions, chain `where:` steps: `where: status = 'active' | where: country = 'SE'`. (bundled pine-lang 0.47.0)
- **The instructions agents read explain how to combine conditions.** Use `or` inside one `where:` for either, and another `where:` step for both. They used to say a comma meant AND and that Pine had no `or`, but a comma actually meant OR.
- **The results grid is new and much faster.** It draws only the cells in view, so scrolling stays smooth with any number of rows. Results are no longer split into pages of 100 rows; the row count shows underneath. (bundled beamlynx-ui 0.64.0)
- **Opening or closing Settings or the Pine panel beside the results is smooth.** Before, the results turned into a grey placeholder while the panel moved. (bundled beamlynx-ui 0.64.0)
- **The delete script from traverse explains its Run button in its first lines.** Running the script yourself deletes everything in one transaction. Run deletes one table at a time, committing each as it goes. (bundled beamlynx-ui 0.64.0)

### Removed
- **Sorting by clicking a column header, and the column menu for sort, filter and hide, are gone.** Sorting and filtering will come back as changes to the Pine expression. To filter on a value for now, right-click the cell and choose **Filter**. (bundled beamlynx-ui 0.64.0)

### Fixed
- **The app's fonts ship inside it.** IBM Plex Mono, JetBrains Mono, Fira Code, Inter and IBM Plex Sans used to show only if they were installed on your computer. (bundled beamlynx-ui 0.64.0)
- **Tab in the canvas filter panel moves through the panel's own fields and buttons.** It used to move focus out of the panel. (bundled beamlynx-ui 0.64.0)
- **A hand-typed filter that matches any of several conditions shows on its table on the canvas.** It used to disappear; now it shows as one chip. (bundled beamlynx-ui 0.64.0)
- **Hints after a complete condition suggest the right columns.** In `where: id = 1 or e.`, they listed the current table's columns instead of `e`'s. (bundled pine-lang 0.47.0)

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
