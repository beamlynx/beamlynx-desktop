# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.70.2] - 2026-10-28
### Changed
- **The sidebar no longer lists an agent's investigation under Agent until it has a name.** While there is only one, and the agent hasn't said its question, **Agent** opens it.

### Fixed
- **The agent's question shows as soon as it says it.** This is in the sidebar and at the top of the timeline. It used to wait for the next step to appear.

## [0.70.1] - 2026-10-28
### Changed
- **The dialog for opening a connection in a tab with a query shows two choices.** Each says what happens: **Open in a new tab** keeps this tab as it is, and **Switch this tab** warns that the query may not work there. The new tab is the default.
- **Connecting another agent is a plug icon in the timeline's header.** It sits next to the arrow that hides the timeline, and opens Settings at the agent setup.
- **A column rule without a schema reads "in every schema".** This is the wording in Settings and on the agent's cards.

### Fixed
- **Applying an agent's proposed policy change saves it, or puts the policy back and says why.** The card also says when the agent had stopped waiting for the answer.
- **Undo on an applied proposal never erases a later change.** Once the policy has changed since Apply, Undo is refused and points to Settings.
- **An agent's queries in one investigation run one at a time, and each step shows its own result.** A query that runs too long is stopped, and a lost connection is made again once.
- **The timeline no longer looks stuck.** A call whose end never arrived, a reveal request that runs over 60 s, and a request the agent stopped waiting on each end, and each investigation says what its own agent is doing.
- **Buttons in the timeline and in Settings show an error when they fail.** Settings reads the policies again each time it opens, and **Show to agents** puts the Except rule back if it fails.
- **An agent's query is refused when its connection's policy can't be found.**
- **Long agent sessions use less memory.** A step keeps at most 500 rows to show again, older steps fewer, and finished investigations past the tenth are dropped.
- **The plug icon always shows the agent setup.** When Settings is already open there, the setup flashes.

## [0.70.0] - 2026-10-26
### Changed
- **Account is at the bottom of the sidebar.** It shows your initials once you sign in, and a dot until then. The settings at the top are about the app.
- **Picking a connection while the tab has a query offers a new tab.** **Open in new tab** is the default, and leaves this tab's query as it is. **Switch this tab** still switches it. Cancel, Escape or a click outside does neither.
- **The sign-in screen comes back at every launch until you sign in.** Only **Skip for now** closes it, until the next launch: a click outside it or Escape does nothing. The Skip link is smaller.

## [0.69.0] - 2026-10-26
### Breaking
- Needs pine-lang 0.51.0 and the matching beamlynx-desktop release.

### Added
- **Sign in once, or skip.** On desktop, a first-run screen offers sign-in with GitHub, so we know who uses Beamlynx. Skip is final: the screen never comes back on its own. It waits for a launch with an internet connection. **Settings → Account** shows who is signed in, signs out, or signs in later. Both link to the privacy policy and the terms. Needs a beamlynx-desktop with sign-in; older ones show nothing new.
- **Anonymous usage stats, and a switch for them.** The first-run screen says that Beamlynx sends anonymous usage stats, before anything is sent. The switch to turn them off is in **Settings → Account**. Each query run is counted as a user or agent run, in Pine or SQL, and nothing else about it.
- **Agents can propose access policy changes.** A proposal is a card in the agent's timeline that lists each change in plain words. Loosening an Except rule is marked in the warning colour. Nothing changes until you click **Apply**. **Decline…** sends the agent your reason, and **Undo** puts the rules back. This replaces the Allow card.

### Changed
- **Each connection has its own access policy.** Changing it never changes another connection, so the choice to copy a shared policy is gone. Settings → Access Policy is now **Policy templates**: a template is where a connection's policy starts. The built-in **Default** template can't be edited.
- **Agent access per connection: Off, Masked or Every column.** It replaces the MCP switch. **Masked** applies the connection's policy, and the first time you pick the template it starts from. **Every column** lets agents read every column, after asking, and keeps the policy for later. **Start over from a template…** resets a connection's rules. While agents have access, a line says that what they read goes to their AI provider, and that masking isn't a guarantee.
- **A clearer connection list.** A zap marks the tab's connection, and a robot shows agent access: dim when masked, in the warning colour for every column. A click on a row opens its settings, and **Connect** switches to it. **Add connection** is at the top right.
- **One way to confirm.** Anything that weakens protection or deletes something asks in a dialog. "Click again to delete" is gone.
- **One sidebar item for agents.** The robot is always there on desktop. It opens the setup until an agent has worked here, then the agent's work. MCP left Settings.
- **Tooltips wait 600 ms before showing,** and explanations sit behind small info icons.
- **The sidebar toggle is a double chevron,** so it no longer looks like the Database Connections icon.
- **A query that uses a hidden column is refused at once,** instead of waiting for your answer. The agent can propose a change.
- **The agent's timeline is shorter and follows the newest step.** A query takes two lines, and a run of lookups takes one. Scroll up to stop following, and **New steps below** brings you back.

### Fixed
- **A `group:` with no keys reads right on the canvas:** `group with count as n`. Needs pine-lang after 0.50.0.
- **Sort and filter chips keep newer Pine.** Flipping a sort keeps `nulls first` or `nulls last`, and editing a filter keeps a function on its left, like `jsonb_typeof(data) = 'array'`.
- **An agent's SQL no longer appears in the Pine editor** when it didn't convert. Its step shows the SQL and why it didn't convert.

## [0.68.0] - 2026-10-19
### Added
- **A shared policy is copied, not changed for everyone, if you choose.** When you show or hide a column for agents from the results, and the connection's access policy is also used by other connections, beamlynx asks first. **Copy for (this connection)** gives the connection a copy of the policy and changes only the copy; the other connections keep the original. **Change (policy)** changes it for all of them, as before. Undo after a copy puts the connection back on the original and removes the copy. The Allow card in an agent's investigation offers the same two choices. Needs the desktop app's new `access-policy:duplicate`.

### Changed
- **The agent sits at the bottom of the sidebar,** and only once an agent has started an investigation, since until then there's nothing to open. The connection and the settings stay at the top.

### Fixed
- **"Also restrict my own queries" now applies in an agent's investigation tab too.** A query you ran there was always masked, whatever the setting said, because the whole tab counted as the agent's. Now only the agent's own queries are always masked, while they run. Your own runs in that tab follow the setting, as in any other tab, and the agent's results in the timeline stay as it saw them.

## [0.67.0] - 2026-10-18
### Breaking
- Needs pine-lang 0.50.0 or later (was 0.49.0). Your own tabs ask pine-lang only to report which columns agents can't see (`access-policy-mode: annotate`), and an agent's refused query names the hidden column, so you can be asked to allow it. Pine-lang 0.49.0 knows neither, and would mask the results in your own tabs. Connecting to an older server shows the upgrade-required screen.

### Added
- **A sidebar on the left.** The agent, What's new and the settings moved from the header's right corner to a sidebar on the left, next to where Settings and an investigation's timeline open. It runs the window's full height. The database connection moved to its top, as a workspace is in Slack: a tile in the connection's colour with its initial, filled when connected. Click it to switch the tab's connection, or to reconnect. It shows icons only, and expands to show labels and the agent's investigations by their questions. It remembers which you chose. Settings' sections are items of their own, each with an icon: Database Connections, Appearance, Preferences, Access Policy, MCP and About. One opens Settings at that section, and clicking it again closes it. The panel beside it shows only the open section, so it's narrower by default (520 px).
- **Agent investigations.** In the desktop app, each Claude session that uses beamlynx gets an investigation of its own, named for the question the agent says it is investigating. The robot in the sidebar opens it as a tab at the end of yours. Closing the tab only puts it away: the robot opens it again with everything the agent did. An agent's tabs are no longer restored as your own tabs when the app restarts. A timeline beside the canvas keeps every step: the tables it looked for, each query with the reason the agent gave and what came back, and what it found, including from other tools. Click a query to see its rows again, exactly as the agent saw them, without running anything. The tab follows the newest query until you pick an older one. A failed query is marked in the timeline, with its error. The robot opens the current investigation, or a decision an agent is waiting on. Its activity log is replaced by the timeline.
- **Allow a hidden column while the agent waits.** When an agent's query is refused because it filters, sorts or groups on a column the access policy hides, the timeline shows a card: which column, and the agent's reason. **Allow** adds that column to the Allow rules of the connection's policy, and the agent's query runs again in the same call. **Decline** sends your reason to the agent. A column hidden by an Except rule isn't offered, since the Except rule would win.
- **Reveal requests are cards in the investigation.** When an agent asks to see a query's real values (`request_reveal`), the request is a card in its investigation, with the agent's reason, instead of a "Needs approval" tab. The query runs once, read-only, so you can look at the real rows in the grid before deciding. **Reveal to the agent** sends exactly those rows. **Decline** sends your reason. A query that changes data is declined without asking, as before. You can no longer edit the agent's query before revealing it.
- **Write to the agent from beamlynx.** A box at the bottom of the timeline sends a note to the agent. It arrives with the agent's next call to beamlynx, and the timeline shows when it has. A query you run yourself in the agent's tab is added to the timeline, and the agent is told what you ran and what came back.
- **Exceptions to what agents may see.** In the desktop app, every column is hidden from agents unless an access policy's **Allow** rule matches it. Now a policy can also list **Except** rules: a column they match stays hidden, even when an Allow rule matches it. Every policy starts with exceptions for names containing `token`, `password` and `secret`, so a uuid column called `reset_token` stays hidden even though uuids are allowed. Settings → Access Policy lists the Allow rules, then the exceptions. Each list has a form to add a rule: a name that contains, equals or ends with a text, or one exact column. The rules that used to be called "Allow …" are now plain names, such as "Standard data types", under Allow.
- **Change the access policy from the results.** Right-click a cell or a column header and choose **Hide from agents** or **Show to agents**. The change is saved to the policy of that tab's connection. A message says what changed, which policy it was saved to, and which other connections use that policy, with **Undo** and **Open policy**. A column a broader exception covers, such as "name contains token", offers that exception instead, opened in Settings. A connection agents can query with no policy offers to choose one.
- **See which columns agents can't see.** On a connection agents can query, a column hidden from them has a crossed-out eye in its header, in your own tabs as well as the agent's. Your own tabs still show the real values.

## [0.66.0] - 2026-10-17
### Breaking
- Needs pine-lang 0.49.0 or later (was 0.48.0). The canvas's checkpoints, `limit: N per`, groups written with `with`, SQL to Pine, JSON paths and the database-down message all need it. Connecting to an older server shows the upgrade-required screen.
- A cell edit finds its row by the table's primary key, not by a column called `id`. Tables keyed on another column, or on several columns, can now be edited from the grid. Tables and views without a primary key can't be edited, even when they have an `id` column, and the grid says why. Primary key columns can't be edited. Needs pine-lang after 0.48.1, which marks each primary key column in the result.

### Added
- **See what an AI agent is doing, as it does it.** In the desktop app, the robot icon in the header appears with the agent's first call of any kind, not only its first query. While the agent works, the robot pulses, here and on the agent's tab. It keeps pulsing for 20 seconds after each call, while the agent thinks about its next one. Its tooltip says what the agent is doing, like "Searching for tables like \"order\"". Clicking it opens the agent's activity log: every call, newest first, with its time and how long it took. Click a call to see what the agent sent, like its SQL or Pine, and how it went. Buttons there open the agent's tab, or a pending approval. Clicking the robot used to jump straight to the agent's tab. Needs a desktop app that reports the calls (beamlynx-desktop after 0.19.0); with an older one, nothing changes.
- **Reset the canvas layout.** Once you have dragged a node or a strip chip, the canvas toolbar shows a refresh icon at its right end. Clicking it puts every node back where the layout places it. Dragged positions are kept in memory only, so reloading also resets them.
- **Checkpoints and named results open into containers.** A checkpoint's node, or a table that uses an earlier block's `|= name`, has an arrow to expand it. Expanded, a dashed box with no fill is drawn right above the node, around everything it holds, with a short line from the box to the node. The tables inside work as usual. Opening and closing is animated. Everything starts closed, and `e` on the node opens or closes it. Animation follows the system's reduced-motion setting.
- **Several query blocks on the canvas.** A query block above the last one that ends in `|= name` is drawn as a nested query of it. The table that uses `name` says `|= name`; its arrow, or `e` on the table, draws the block above it in a container. Changes made on that block's tables edit that block's text. A strip at the top of the canvas shows how the blocks are made from each other: one chip per block, like `|= top` with `limit 10` under it, and `query` for the last block. An arrow goes from each block to the blocks that read it, labelled `in` when it's used in `where: x in name`. The arrows are dashed curves, unlike the square join lines below, so the join graph only shows joins. Clicking a chip expands that block; clicking `query` collapses it. A chip can be dragged anywhere; the tables below move down to make room for it. A block the last query doesn't join has no node: its chip stands for it, and expanded, its container stands alone above the graph. Only one nested query is expanded at a time, checkpoints and named blocks alike. A query block above the last without `|= name` still shows a banner.
- **`per` in the limit editor.** Besides the number, an optional "per" field takes columns of the stage's tables: the first N rows of each group of rows that share them. Opened from a checkpoint node's label, it shows the columns it already has.
- **Variables in the where editor.** Type `$name` as a value to use a variable: the tab's own are offered, and a new one gets a `$name = ` line in the values block, so the Variables list asks for its value. `in` and `not in` are in the operator list and take a list, `1, 2`, or a list variable, `$ids`. On an existing condition, **make variable** turns `status = 'shipped'` into `status = $status` and moves `'shipped'` into the values block, as `$status_2` if `$status` is taken. A `$name =` line with no value needs pine-lang after 0.48.1.
- **Checkpoints on the canvas are drawn as stages.** A `limit:` or `group:` seals everything before it, and the steps after it work on that result. The canvas now draws the query top to bottom, one stage per checkpoint. Each checkpoint is a node named as pine-lang names it: the `|= name`, or `result_1`, `result_2`, and so on. It is drawn and works like any table: select, where, join, the "+" menu and the keyboard all act on the result. Tables joined after a checkpoint are drawn in its stage, joined to its node. The node says what the checkpoint does, like `limit 10`, `limit 1 per c.id` or `group t.title with count`. Click a limit's label to change the number and its `per`. Changing a group's columns keeps its aggregates after `with` as typed. Its × removes the checkpoint, and the tables after it stay. After you add a `limit:` or `group:`, the new checkpoint's node is focused, so the next step builds on it. Before, the tables before a checkpoint always sat in a dashed box on the main graph. Needs pine-lang's `ast.checkpoints` (pine-lang after 0.48.1).
- **Set the limit from any table on the canvas.** `limit:` is in each table's and checkpoint's "+" menu, and on the `l` key, as well as on the multi-select toolbar. It changes the limit at the end of that table's stage, if there is one. Otherwise it adds a limit at the end of the query. It opens with the current limit filled in, and **clear** removes it. `l` is in the shortcut list at the bottom of the canvas.
- **AI agents can send SQL, which runs as Pine.** The desktop app's `run_sql_as_pine` tool takes SQL. The app converts it to Pine, and only the Pine runs, the same way as any agent query: in a visible tab, with the connection's access policy, and with writes refused. SQL itself never runs. An `UPDATE` or `DELETE` converts and shows in the agent's tab, but never runs. The agent gets back the Pine that ran, so it learns Pine as it goes. SQL that doesn't convert runs nothing, and the agent is told why, like "Line 3: OFFSET isn't in Pine." Needs beamlynx-desktop's matching release.
- **The SQL panel completes table and column names** from the connected database. The hints open the way they do in the Pine panel: Tab opens them and moves to the next one, Shift-Tab moves back, and Ctrl/Cmd-Space opens them too. They no longer pop up while you type. After `JOIN`, the hints start with the tables that join to the ones already in the query, with the `ON` clause written in your aliases, like `employee e ON e.company_id = c.id`. They are the joins the Pine panel suggests, from foreign keys and column names like `company_id`. After `FROM` or `JOIN` it offers tables. After an alias and a dot, like `e.`, it offers that table's columns. A name like `tenantId` is inserted in quotes where the database needs them. Tables in the default schema (`public` in Postgres) are offered without it. A reindex loads the names again. Needs pine-lang's `/api/v1/sql-schema`; with an older server there is no completion.
- **SQL becomes Pine as you type.** Typing or pasting a query in the SQL panel converts it to Pine after a short pause, and the canvas draws it: its tables, joins and conditions, editable by clicking. When the SQL doesn't convert, the canvas keeps the last query that converted, and a line under the SQL editor says so and why: "The canvas isn't showing this query. Line 3: OFFSET isn't in Pine." It is marked in amber, not red, because that SQL can still run; red is kept for a query that can't. The line is empty while the canvas shows what you typed, and SQL that is only unfinished is mentioned only if it stays that way for a moment. The SQL you typed stays in the panel. A burst of typing is one undo step on the canvas, so one Ctrl+Z brings back the query from before. Converting runs nothing: in SQL mode, Run still runs the SQL. Needs pine-lang after 0.48.1, which adds `/api/v1/sql-to-pine`.
- **JSON paths on the canvas.** A key inside a JSON column, like `data.address.city`, shows as that name on the select, where, order and group chips. Editing a where chip writes the path back, and a value compared with a key reads `SE`, not `"SE"`. Needs pine-lang after 0.48.1.
- **Edit a key inside a JSON column.** A cell like `dp.companies[0].id` can be edited in the grid, and the edit is saved into that key alone. It keeps the type the value had: in a number cell `12` is saved as a number and text that isn't a number is refused; in a string cell `5` stays the string `"5"`; a boolean cell takes `true` or `false`, or `1` or `0`, which is how SQLite shows them. A JSON `null` takes what is typed as a string. A cell whose key is missing in that row, or that holds an object or an array, stays read-only and says why. Needs pine-lang after 0.48.1, which sends each value's JSON type.
- **Hidden columns in SQL.** The SQL panel shows the query without the columns beamlynx adds so results can be edited: each table's key and each JSON value's type. They are still fetched. To see them, turn on the switch in Settings > Preferences, or use Toggle Hidden Columns in SQL in the command palette. The setting applies to every tab. Copy SQL copies what is shown. With pine-lang 0.48.1 or older, the SQL always includes them.
- **Stop a running query.** While a query runs, Run becomes Stop. Escape in the Pine or SQL editor does the same when no completion list is open. With Vim mode on, Escape may stay with Vim; use the button. The database stops the statement, a write is rolled back, and the results pane says "Query stopped." The command palette has Stop Query too. Needs pine-lang after 0.48.1.
- **SQLite** in the desktop app. Pick SQLite as the database type in Settings > Database Connections, then choose the database file with **Browse…** or type its absolute path. There is no server, port, user or password to enter. A connection string takes the form `sqlite:///path/to/file.db`. It needs a pine-lang with SQLite support (after 0.48.1); an older one refuses the connection. The web build doesn't offer SQLite: it would read the server's disk, not yours.
- **Preferences in the desktop app's data file.** On desktop, theme, fonts, text size, panel sizes, open tabs and the other settings are kept in `beamlynx.db`, the app's SQLite file, instead of the browser's storage. The first time the app starts with this, it copies your current settings into the file, once. A dev build has a file of its own. Browser storage still gets every change for one more release, so going back to an older version keeps them. The web build still uses browser storage. Needs beamlynx-desktop after 0.19.0; an older one keeps using browser storage.
- **Column widths are remembered** in the desktop app. A column you resize keeps that width the next time it shows up, in any tab, until you resize it again. Widths are kept per connection, by table and column heading, in the app's data file. A column that isn't from a table, like a count, is remembered by its heading. The web build doesn't remember widths.

### Changed
- Deleting through a traversal removes a table with more than 10 000 matching rows in batches of 10 000, because pine-lang now accepts `limit:` only up to 10 000. Each table still loses no more rows than were counted in the plan. The copyable SQL script uses the same limit and says to repeat a statement that has more rows.
- The canvas no longer makes up a checkpoint's name (`agg`, `agg2`, ...). When a gesture needs the name in the text, it writes the one pine-lang already gives the checkpoint, like `|= result_1`.
- The canvas reads each `where:` condition from pine-lang as a map with `alias`, `column`, `cast`, `operator` and `value`, not as a list read by position. With an older pine-lang, where chips don't show. Needs pine-lang after 0.48.1.
- The canvas reads named results from `/build`'s `named-results`, which pine-lang renamed from `variables`. With an older pine-lang, the canvas no longer recognises a named result used as a table. Needs pine-lang after 0.48.1.
- A `beamlynx://run` link opens a tab with the expression but no longer runs it. A banner names the connection it would run on. Check both and press Run. Any web page or message can carry such a link, and the browser's prompt doesn't show what it would do.

### Removed
- Sign-in with Clerk on the hosted web build, and the middleware that enforced it. The desktop app never had sign-in, and the web build is no longer deployed. The middleware also skipped sign-in for any hostname containing 'playground', and logged every request's hostname.
- The unused `marked` library.

### Fixed
- Opening the app while a database is down no longer leaves the tabs stuck. The canvas said "Not parsing - showing last valid graph" while the results showed the connection error, and the canvas kept saying it after the database came back, on every tab, even once Run worked again. Now the tab shows one message, above the results, in plain text: "Can't reach the database", with the reason. The canvas shows no banner. The tab you're on tries again every 10 seconds. Other tabs don't, but switching to one tries it at once. When the database answers, every tab on it draws its graph again, and a successful run brings it back straight away. In the desktop app, a saved connection that can't connect at startup no longer pops an alert either. Needs pine-lang's matching release.
- A canvas popover opened near the edge of the canvas could be cut off. It now always stays inside the window.
- A `where:`, join or `group:` on a table before a checkpoint could land after it, once the query had two checkpoints. It now lands in the table's own stage.
- Removing a query's only `limit:` or `group:` on the canvas no longer leaves a name behind, like `| = agg`. It now goes when nothing is left for it to name, unless you wrote the name or later steps use it.
- Copy result and CSV export included the hidden key columns beamlynx adds for editing, such as `__c_0__id`. They now hold only the columns shown in the grid.
- A result column worked out by the query, like a date bucket (`created_at => month`), could be edited in the grid or the JSON inspector. Saving wrote the value into the stored column: `2024-01` into `created_at`. These columns are now read-only, and say why.
- Pressing Tab right after an alias and a dot, as in `s: t.`, offered nothing. The editor took the dot for the word being typed, and no column contains a dot. It now offers the alias's columns and inserts the chosen one after the dot. Choosing a table after a schema prefix, as in `public.te`, replaces the whole prefix instead of repeating the schema.
- Using a recipe (Ctrl+O) in a tab that already sets one of its `$variables` changed that tab's results. The recipe's values block came last, and the last value wins across the whole tab. The tab's value is now kept, and the recipe's assignment of that name is left out. Using the same recipe twice no longer adds its values twice.
- Approving a reveal request is disabled while the expression has been edited but not run, so the agent never receives rows the owner didn't look at. If the run fails, the banner shows why instead of doing nothing.
- Editing a cell to a value with an apostrophe, like O'Brien, saved it as O_Brien. A row whose text id contained an apostrophe couldn't be edited at all. The value is now written with the apostrophe doubled, which Pine reads as one apostrophe. Needs pine-lang after 0.48.1.
- A stored preference the app no longer understands, or browser storage that is blocked, could leave a blank page or an 'Application error' at start-up. An unknown theme, font or text size, a non-version 'last read' marker, and a damaged list of saved tabs each did it. Every preference is now checked, an unusable one falls back to its default, and damaged saved tabs are skipped.
- An unexpected error while drawing the app shows a page with Reload and 'Reset preferences and reload' buttons instead of a blank window. Resetting keeps your open tabs.
- A Pine server whose version isn't a plain x.y.z, such as `dev` or `0.48`, showed as 'No connection to Pine server'. It now connects. The upgrade-required screen also clears once the server is upgraded, instead of staying until a reload.
- Auto-run on the canvas no longer runs an expression that changes data. Adding a where chip to narrow an `update!` used to run the update 150 ms later. Such an expression now waits for Run, and the tab says why.
- Pressing Enter in a cell checks that the row is still there before saving. If it isn't, the save is refused and says so.
- A `?query=` share link containing `%`, such as `like '%a%'`, was silently ignored. It opens now.
- The bar chart is offered only up to 2 000 rows; past that, its button is disabled with a tooltip. A large result used to freeze the tab. Empty strings and Infinity no longer count as numbers to chart.
- A tab whose saved connection was deleted showed a 'Failed to reconnect' alert on every switch to it. It now forgets the connection once and asks you to pick one.
- The Inspect dialog's Run shows why an update failed instead of 'Update execution failed'. JSON values that the grid didn't recognise as JSON show as JSON instead of [object Object]. The connection monitor no longer logs an error every second while the server is down.

### Security
- The desktop app no longer writes the database password to the developer console when it connects to a saved connection. Other connection details are logged only in development builds.
- An expression an AI agent asks to reveal can no longer change data. The review tab runs it read-only, and a reveal request whose expression would change data is declined automatically, with a comment saying why. Before, `user | delete!` sent as a reveal request deleted the rows the moment it arrived.
- In the desktop app, every request to the bundled query server carries the secret the app makes at each launch, so no other program or web page can use the server. If the server refuses the app anyway, the connection indicator says so and suggests restarting beamlynx. Needs beamlynx-desktop with launch tokens (after 0.19.0) and pine-lang after 0.48.1.
- CSV export and copy neutralise a value a spreadsheet would run as a formula (one starting with =, +, -, @, a tab or a carriage return) by prefixing an apostrophe. A value with a carriage return is quoted. JSON values are written as JSON, not [object Object].
- Updated Next.js from 13.5.6 to 15.5.27, past every published Next.js advisory, including the middleware bypass (CVE-2025-29927). PostCSS, nanoid, source-map-js and yaml are lifted to fixed versions. `npm audit --omit=dev` reports no vulnerabilities. The lockfile is back in step with package.json.

## [0.65.0] - 2026-10-06
### Breaking
- Needs pine-lang 0.48.0 or later (was 0.47.0). Values blocks and named results after `in` need it. Connecting to an older server shows the upgrade-required screen.
- Ctrl+S no longer downloads the tab as a `.pine` file. Nothing in beamlynx opened those files. Ctrl+S now saves a recipe (see below). In the browser, where there are no recipes, Ctrl+S does nothing.

### Added
- **Variables.** Write `$name` in a query where a value goes, and set it in a values block of its own above the query: `$company_name = 'Acme'`, or a list for `in`, `$statuses = ('failed', 'stuck')`. A values block holds one or more `$name = value` lines, so the query and its values are all in the Pine text. Pressing Ctrl+Enter with the cursor in a values block runs the query below it. On the canvas, a Variables list shows each `$name` the query uses and its value, or "no value"; click a value to change it, which rewrites its line in the text. Condition chips show `$name`. Needs pine-lang with values blocks (0.48 or later).
- **One query's result in another:** a named result that selects one column can be used after `in`, like `employee | where: id in acme_emps` (pine-lang 0.48 or later).
- A recipe keeps its `$variables` and their values: saving one includes the values blocks the query uses, placed above the query, and using it puts them in with the query.
- An AI agent can pass values for `$variables` to `run_query`, overriding those written in the text (with beamlynx-desktop's matching change). The agent's tab shows the values it used in a values block above the query, so the run can be repeated.
- **Save a query as a recipe with Ctrl+S** (desktop app 0.19 or later). A bar above the tab asks for a title, offering the first line of the query's top comment. Enter saves, Esc cancels. It saves the block under the cursor, plus any block above it that the query uses through a named result. Comments are saved with the query: they are the recipe's explanation. Recipes are offered on every database.
- **Use a recipe with Ctrl+O.** Find it by any word in its title, comments or query, then click it or press Enter. Its query, comments included, goes into the tab as ordinary text. Nothing runs until you press Ctrl+Enter. Hover a recipe to see its query. Delete one with the trash icon on its row: click once, then again within 3 seconds. Editing comes later.
### Changed
- Vercel no longer deploys this repo. `vercel.json` turns off deployments for every branch, including `main` and `release/**`. The last deployed version stays online until the Vercel project is removed.
- The hosted web app builds on Node.js 24. Vercel stopped building with Node.js 20, so every deployment since 2026-10-03 had failed. `package.json` now sets `engines.node` to `24.x`, which overrides the Vercel project's setting, and `.nvmrc` says 24. `npm test` works on Node.js 22 and later again: it passes the test files, not the folder.
- A dev copy shows an amber **DEV** chip in the header, in place of the grey "[Development]" text. It also shows in a desktop dev build (beamlynx-desktop's `npm start`), which had no label at all, so it can't be mistaken for the installed app when both are open. Hover it to see which kind of dev copy it is.
- Inside beamlynx-desktop, the app now asks the desktop app which port its Pine server is on instead of assuming 33333. The desktop dev build uses a different port, so it can run next to the installed app. The browser and playground are unchanged.
- In the desktop dev build, the MCP setup instructions register the server as `beamlynx-dev`, so it can sit next to the installed app's `beamlynx` entry.
### Fixed
- The Access Policy section now says that a masked column can still be used in a query's conditions, so a query can test a guess about its values, for example by counting matching rows. That has always been true; it wasn't written down.
- Keys pressed in a dialog, such as the Ctrl+O recipe picker or the command palette, no longer reach the canvas behind it. Clicking a dialog's text and then pressing Backspace, Delete or `x` used to delete the selected item in your tab.
- **New Database Connection** in the command palette opens the add form again. It used to open Settings on the list of connections instead, because that section was already loaded in the background. The same fix covers a saved password that can't be unlocked: the form now opens filled in every time, not only the first time.
- The Access Policy section said agent (MCP) access needs an active rule in some policy. The rule is per connection: MCP access can be turned on for a connection whose own policy has an active rule, or that has no policy.
- The MCP section's setup steps named a toggle and a section that no longer exist. They now say to turn on **MCP access** under **Database Connections**.

## [0.64.0] - 2026-09-27
### Breaking
- Needs pine-lang 0.47.0 or later (was 0.46.0). Canvas filters that match any of several conditions are written with `or`, which pine-lang 0.47.0 added. Connecting to an older server shows the upgrade-required screen.

### Added
- After you edit a value, its cell glows briefly and a short message says it was saved. If it wasn't, the message says why.
- A value that can't be edited now says why as soon as you try, instead of opening an editor. That covers a row's `id` (an update uses it to find the row), a table whose `id` isn't in the result, and values the query works out rather than reads from a table.
- Move between result cells with the arrow keys. Select a range by dragging or with Shift, and copy it with Ctrl+C as tab-separated text that pastes into a spreadsheet.
- A canvas filter can match either of several conditions. In the filter panel, **+ or** adds another condition; pick its column from the same list as the first. The filter is written as one `where:` joined with `or`, like `where: c.status = 'blocked' or c.status = 'active'`. It needs pine-lang 0.47.0, which added `or`.

### Changed
- The results grid is new, and much faster. It draws only the cells in view, so scrolling stays smooth however many rows a result has. A result shows up in about half the time, and a 100,000-row result about four times sooner than before.
- The delete script from **traverse** now says in its first lines how its Run button works. Running the script yourself deletes everything in one transaction, between its `BEGIN;` and `COMMIT;`. Run doesn't send those: it deletes one table at a time, deepest first, and each table is committed as it goes.
- Opening or closing Settings or the Pine panel beside the results is smooth now. The results used to be swapped for a grey placeholder while the panel moved, then redrawn; now they resize along with it.
- Results are no longer split into pages of 100 rows. Every row the query returns is in one scrolling grid, with the row count underneath.

### Removed
- Sorting by clicking a column header, and the column menu (sort, filter, hide columns). Sorting and filtering will come back as changes to the Pine expression, so they show up in the query. To filter on a value for now, right-click the cell and choose **Filter**.

### Fixed
- Tab in the canvas filter panel moved focus out of the panel, usually to the Pine panel. It now moves through the panel's own fields and buttons, going to **add** right after the value, and wraps around. Escape still closes the panel.
- A filter typed by hand that matches any of several conditions disappeared from its table on the canvas. It now shows as one chip, and clicking it opens every condition in it for editing.
- The app's fonts now ship inside it. The desktop app showed IBM Plex Mono, JetBrains Mono, Fira Code, Inter and IBM Plex Sans only if they were installed on your computer, and a system font otherwise. The web app downloaded them from Google Fonts. Every build now carries its own copies, and works offline.

## [0.63.0] - 2026-09-25
### Breaking
- `delete:` is gone from Pine. Use the traverse action below instead. A saved tab that still ends in `delete:` has it removed when the tab opens, so the tab doesn't come back blank.
- Needs pine-lang 0.46.0 or later (was 0.45.0). The server now describes a join in a different shape, which this release needs to draw the canvas. Connecting to an older server shows the upgrade-required screen.

### Added
- Traverse from a table on the canvas: press `+` on it and pick **traverse**. It follows every table that points at it by foreign key, up to 25 levels deep, and offers two operations on them:
  - **Count rows** lists each table with its row count. Click one to open its rows in a new tab.
  - **Delete rows…** generates the delete statements, deepest table first, as a script you can copy or run from the same panel after a confirmation.

### Fixed
- Joins on the canvas now start from the latest table unless you pick another one. Hovering over a table used to move keyboard focus to it, even with the pointer hidden while you typed, so the next `|` could join from an older table. Hovering now only highlights. To join from an older table, click it or move to it with the keyboard.
- Ctrl+C on the canvas copies again instead of opening the comment editor. The same goes for Ctrl+V, Ctrl+A and Ctrl+F.
- Switching tabs no longer shifts the layout. Pane and panel sizes used to reset to their defaults and then jump to your saved sizes on every tab change.
- The error above the results is no longer cut off. The whole message wraps over as many lines as it needs, up to six before it scrolls.

### Security
- An agent can no longer change your data through MCP. The old check only refused `delete!`, found by searching the text, and let `update!`, `d!` and `u!` through. The Pine server now refuses every write from the agent's tab, even when you press Run on it yourself. Your own tabs are unchanged.
- Agent queries need pine-lang 0.46.0 or later. An older server would run the writes it was asked to refuse, so MCP refuses to run anything against it.

### Removed
- The `BEAMLYNX_MCP_ALLOW_DELETE` environment variable. It turned off the agent delete check for the whole machine.

## [0.62.0] - 2026-09-20
### Added
- A tab can now explain itself. Start an expression with a comment -- either `/* ... */` across lines, or a run of `--` lines -- and the canvas shows it in its top-left corner instead of leaving it as grey text to scroll past. Write what you are looking for and why when you open a tab, and it is still there when you come back to it.
- You can write that comment from the canvas itself: press `c` (shown at the front of the bottom-left keybinding legend), click the comment button in the toolbar, or click an existing comment to edit it. A dim "Add a comment" marks the spot when there isn't one. What you type is spliced into the expression as a comment, the same way picking a table splices in an operation, so the canvas and the expression can never disagree. Emptying it removes the comment. Enter is a line break; Cmd/Ctrl+Enter or clicking away saves, Esc cancels.
- MCP: an agent now leads every query it runs with a comment saying what it is looking for and why, so the tab it opens shows its reasoning, not just its results.
- Database Connections: you can now have more than one connection to the same host and port, as long as they point at different databases. Previously the second one was rejected.
- Add Connection form: switching to the "Connection string" tab rebuilds the string from whatever's in the Fields tab, so the two stay in sync in both directions instead of only string-to-fields.

### Changed
- Panels now open and close with a short animation instead of appearing in a single frame. Settings, the Pine/SQL panel, Zen mode, the error band above the results, the agent's pinned tabs and every dialog all move now, so you can see where something came from. All of it follows your operating system's "reduce motion" setting -- turn that on and everything is instant again.
- Results columns size to their own content instead of stretching to fill the pane. A UUID column gets the room it needs and a short "status" column isn't stretched to match; scroll horizontally if a wide result doesn't fit, the same as any spreadsheet.
- Table colors, and hovering a table on the canvas, now tint each column's header only, not every value under it. Coloring every cell read as noise -- and the hover spotlight did it even with "Table colors" turned off, which made the preference look like it had no effect.
- Database Connections: switching the active tab's connection while it still has a query in it no longer silently opens a new tab. You get a warning that the query may reference tables or columns the new connection doesn't have, and the choice to switch anyway or cancel.
- Database Connections: renaming a connection now has its own pencil icon next to the name. Previously renaming only worked by first expanding the row.
- MCP: queries an agent runs now show in their own tab, pinned to the end of the tab strip and marked with a robot icon so it doesn't read as one of your own. It always shows the same query slot -- an agent's next query replaces whatever was there -- so closing it is always safe.
- MCP: when an agent asks to see something its access policy redacted, the request gets its own "Needs approval" pinned tab instead of opening as a new tab and stealing focus. The tab names the connection, quotes the agent's reason, and offers Approve/Decline. Closing it without deciding declines, so an agent waiting on a decision never hangs.
- MCP: an agent icon in the header, next to the bell, covers everything the agent is doing -- a dot when a result landed while you were looking elsewhere, a count when approvals are waiting. Clicking it goes to whichever needs you most: an approval first, since an agent is blocked on it, otherwise the activity tab.
- Settings opens faster the first time. Its contents are built once while the app is idle and kept afterwards, which also preserves your scroll position and the section you were last on.
- Dragging a pane divider no longer selects the text it passes over.

### Removed
- The classic Graph mode (the non-interactive node diagram you got with "Canvas mode" off) is gone. Canvas is now the only graph editor, and the preference and its command-palette entry are gone with it.
- Legacy Layout (the classic sidebar arrangement) is gone. The Canvas + Results two-pane layout is now the only one. The "Switch to legacy layout" header link, the "New layout" toggle and their command-palette entries are gone with it. Settings always opens as a docked panel now, never a floating window.

### Fixed
- Panels open and close smoothly, including with a full table of results on screen. The results grid re-fits its columns whenever its container resizes, which is expensive, so a panel opening beside it used to redo that work on every frame. The grid now stands still while the panel moves -- a skeleton of your real column headers stands in for that moment -- and fits itself once, afterwards.
- Upgraded the results grid library (`@mui/x-data-grid` 7.15.0 -> 7.29.13, 14 minor releases of fixes), measured as a ~18% cut in the main-thread work it does when its container resizes.
- Resizing a results column by hand no longer snaps back to its default width. The grid was rebuilding its whole column list on every render -- including renders that had nothing to do with it, like hovering a table on the canvas -- and losing the width you'd just dragged.
- Entering and leaving Zen mode no longer resets the canvas. It used to rebuild the canvas from scratch each way, losing whatever you had panned or zoomed to.
- A blank line inside a `/* ... */` comment no longer breaks the expression. Blank lines separate one expression block from the next, and that rule used to apply inside a comment too -- so a comment with a paragraph break was split down the middle and sent to the server as an unterminated comment followed by loose text.
- Header: the version badge no longer shows "obsolete" when you're simply not connected yet. It stays hidden until there's a real version to show.
- Database Connections: typing a space while renaming a connection did nothing to the text and silently switched your active connection instead. The row's own Enter/Space shortcut was intercepting keystrokes meant for the rename field inside it.
- Database Connections: the rename pencil and the MCP badge could misalign across rows, and the badge shifted sideways the moment you clicked the pencil. The rename and expand icons now form a stable column regardless of a row's MCP state.
- Various icon-only buttons across the app (close, download, save, notifications, tab controls, the JSON inspector) now have accessible labels for screen readers.

### Breaking
- Minimum required pine-lang server version raised to 0.45.0 (from 0.44.0). Canvas comments need it: an older server deletes a comment the moment you touch the canvas, since it strips comments when it reformats an expression. Multiple connections to one host and port need it too. Connecting to an older server now shows the upgrade-required screen instead of the app.

## [0.61.0] - 2026-09-12
### Added
- **You can add MySQL databases, not only Postgres.** Pick the database type when you add a connection, and the port fills in to match. Pasting a `mysql://` connection string sets the type for you.

### Fixed
- **A query that can't reach the server no longer leaves the spinner running forever.** Before, no error appeared. Now the spinner stops and the error shows.

### Breaking
- **Requires pine-lang 0.44.0 or later (was 0.43.0).** MySQL support needs it. With an older server, Beamlynx shows a screen asking you to upgrade it.

## [0.60.0] - 2026-09-10
### Added
- **An AI agent can ask you to show it values that your access policy hides.** The agent calls `request_reveal`, and its query opens in a tab where you can edit it. You then reveal the real results to the agent, or decline with a comment saying why so it can adjust.
- **Copy a whole result as CSV, ready to paste into a spreadsheet.** Use the "Copy result as CSV" button next to Export to CSV, or the "Copy Result" command.
- **Date columns get "today" and "in the last" filters on the canvas.** They appear next to the usual operators when you add a `where` on a column that looks like a date. Each one adds a pair of `where:` conditions for you.
- **Clicking a JSON cell opens its formatted value in an editor on the right.** Edit it there and save with Mod+Enter or the checkmark. JSON cells no longer edit inline, and Copy in the right-click menu gives the formatted JSON.
- **Scrollbars in code editors match the app's theme instead of your system's.**

### Changed
- **Access policies no longer hide values in your own queries unless you turn that on.** Each connection has an "apply access policy to my own queries" switch, off by default. Before, it was on unless you chose to bypass it.
- **Moving between tables with the keyboard highlights their columns in the results, like hovering does.** This works with the arrow keys and `j`/`k` on the canvas.

### Fixed
- **Opening the Pine or SQL panel moves the keyboard focus into it and refits the graph.** Before, your keystrokes could go nowhere, and the graph could stay partly cut off by the smaller canvas.
- **A filter added with "Filter" in the results grid's right-click menu can always be edited or deleted on the canvas.** Before, editing or deleting it could do nothing, or change a different filter.
- **Editing an existing `ilike` filter on the canvas no longer breaks the query.** The editor wrote the operator back as `ILIKE`, which Pine rejects.

## [0.59.0] - 2026-09-06
### Added
- **Hovering a table on the canvas highlights its columns in the results.** You can see which columns come from which table without turning on "Table colors".
- **Click an `order` on the canvas to switch it between ascending and descending.** The arrow keys or `a`/`d` flip it, and "remove" deletes it. Before, clicking it opened the column list again.

### Fixed
- **"Filter" in the results grid's right-click menu filters the table the cell belongs to.** Before, it filtered whichever table the query ended on.

## [0.58.0] - 2026-09-06
### Breaking
- **Requires pine-lang 0.43.0 or later (was 0.42.0).** The canvas's new "path" action and path search in the Pine editor need it.

### Added
- **The Pine editor's autocomplete (Ctrl+Space) completes `? table` path searches.** A `? table` search finds the joins that lead to a table. Autocomplete lists the routes, and picking one replaces the whole search.
- **The canvas's new "path" action adds the whole chain of joins to reach a table that isn't directly joinable.** It sits behind the new `+` button, together with order and group. Their shortcuts still work: `o`, `g`, `p`, and `+` to open the menu.
- **Click a join's icon on the canvas to pick Inner, Left or Right.** The icon is the familiar two-circle diagram, so you can tell the join type at a glance.
- **Click a filter, selected column, order or group on the canvas to edit it.** Before, you had to remove it and add it again.
- **Shift+J and Shift+K step through everything in the query, one item at a time.** That is each table, then its join, columns, filters, order and group. Enter or Space opens the highlighted item, and Delete, Backspace or `x` removes it.

### Changed
- **Join lines on the canvas are a neutral color, and only the join-type icon uses the accent color.** Broken and guessed joins keep their own warning colors.

### Fixed
- **Adding a step on the canvas removes a stray `|` left at the end of the query.** Before, the dangling pipe stayed after the new step.
- **Hovering or clicking a table on the canvas moves the keyboard focus to it.** Before, the highlight could stay on the table you last reached with the keyboard. Hovering a filter or a join icon also highlights just that item.
- **A connection's access policy can be "None" while AI agent access is on.** Before, Settings → Connections treated "None" as no policy and blocked agent access. "None" means no values are hidden, as the desktop app already treated it.

## [0.57.0] - 2026-09-02
### Added
- **Drag tabs to reorder them.** The order survives a reload, and Ctrl+Tab follows it. Dragging to the end of a long vertical rail scrolls it.
- **Tabs can run down the left side instead of across the top.** Turn it on in Settings → Appearance → Tabs, or with the "Toggle Tab Orientation" command.

### Changed
- **A tab's close button appears only when you hover that tab.** Hovering also tints the tab.

### Fixed
- **The "Only apply to MCP server" switch no longer turns itself off.** In the desktop app, it switched back off after most connection actions until you restarted.

## [0.56.0] - 2026-09-02
### Breaking
- **Requires pine-lang 0.42.0 or later (was 0.41.0).** It formats the queries AI agents run (see Fixed).

### Added
- **The "Toggle Layout Orientation" command switches the new layout between side by side and top and bottom.** It's in the command palette, so you don't need the canvas toolbar icon.

### Changed
- **In the desktop app, each connection's options fold out under an arrow in Settings → Database Connections.** That is rename, access policy, AI agent access, "Only apply to MCP server", refresh and delete. They're in the order you use them: pick a policy, then turn on agent access.

### Fixed
- **Dragging the Pine/SQL panel's divider in the top and bottom view moves it the right way.** It used to move the opposite way.
- **Queries run by AI agents appear formatted in the Pine panel.** Before, you saw the agent's expression exactly as it sent it.
- **The canvas's `where` picker is easier to read and use.** A long column name ends in "…", with the full name on hover. The operator field gets focus first, and the fields have space between them.

## [0.55.0] - 2026-08-31
### Breaking
- **Requires pine-lang 0.41.0 or later (was 0.39.0).** Access policies need it.

### Added
- **Access policies decide which columns show real values and which show `xxxxx`.** Create, rename and delete them in Settings → Access Policy. Each policy has rules you switch on, for example for a Postgres type, foreign keys, or columns ending in `_id`.
- **Pick the access policy for each database connection.** AI agent access can only be turned on once the connection has an active policy. While it's on, you can't remove the policy or switch to an inactive one.
- **"Only apply to MCP server" lets you see real values in your own queries on a connection.** What the agent sees doesn't change. It's off by default.
- **Hidden columns show `xxxxx`, and the real value never leaves the database.** This applies to every tab, not only the agent's.

### Changed
- **"Vim keybindings" no longer switches off the canvas's letter shortcuts.** It only affects `j`/`k` and the query editor's Vim mode. This undoes part of 0.54.0.
- **"Vim keybindings" applies to every tab at once.** It used to be set per tab.

### Fixed
- **AI agents' queries always use the current access policy.** Before, they could use the policy as it was when the app started.
- **Canvas shortcuts such as `x` keep working after you pick a value while Settings is open.**
- **A removed name on a canvas checkpoint no longer comes back.** A checkpoint is a `group:` or `limit:` step, named with `|= name`. The first click after naming one also no longer shows old results.
- **You can reach connections in the docked Settings panel with Tab.** The bell and gear no longer take the first Tab stops. Settings also keeps its own shortcuts and arrow keys instead of losing them to the canvas.

## [0.54.0] - 2026-08-30
### Added
- **The canvas's join picker shows which foreign key a join uses when a table appears twice.** It uses Pine's own syntax, such as `.created_by`. A table with only one way to join shows no extra text.

### Changed
- **"Vim keybindings" also controls the canvas's letter shortcuts.** With it off, `j`/`k` and `s`, `w`, `o`, `g`, `x`, `u`, `U`, `i` do nothing on the canvas. The arrow keys and Ctrl+Z/Ctrl+Y still work.

### Fixed
- **Canvas shortcuts no longer fire while you're in Settings or typing in the Pine/SQL panel.** Keys go to the panel that has focus, and Settings gets focus as soon as it opens. You can also move through Settings' sections with `j`/`k` and the arrow keys.

## [0.53.0] - 2026-08-28
### Added
- **Zen mode shows only the canvas.** It hides the header, tabs and results, and pauses auto-run until you leave. Open it from the command palette.
- **Ctrl/Cmd+Shift+, opens and closes Settings.**
- **"↻ Reconnect" appears in the header when a tab's database isn't connected.** This happens, for example, when the database wasn't running yet when Beamlynx started. Before, you had to switch tabs or reload the app.

### Changed
- **Ctrl/Cmd+, opens and closes Settings, as in most Mac apps.** It used to open the SQL panel, which moved to Ctrl/Cmd+Shift+. instead. Ctrl/Cmd+. still opens the Pine panel.
- **In the new layout, Settings is a panel docked on the left.** It stays open when you switch tabs. Escape no longer closes it.

### Fixed
- **Canvas text follows the Text Size setting and is larger at every size.** The shortcut legend at the bottom left is bigger too, with each key in bold.
- **Settings no longer covers the canvas and results in the new layout.** Changing Text Size also no longer scrolls the control out from under you.

## [0.52.0] - 2026-08-25
### Added
- **Pick a theme in the new Appearance section of Settings: Light, Dark or Sepia.** Each has its own colors, and the editor and canvas follow it.
- **Choose the interface font and the code font separately.** The interface offers System, Inter and IBM Plex Sans. Code offers IBM Plex Mono, JetBrains Mono, Fira Code (with its ligatures) and System Monospace.
- **A Text size setting (Small, Medium, Large) scales text and spacing.** Panels and the canvas keep their size.

### Changed
- **"Toggle Theme" in the command palette cycles through all three themes.**
- **The arrow keys and `j`/`k` wrap from the last table on the canvas back to the first.**

### Fixed
- **Two-finger trackpad scrolling pans the graph instead of zooming it.** This matches Miro and Figma. In the classic graph, right-drag moves the view and left-drag moves a node or selects, as on the canvas.

## [0.51.2] - 2026-08-23
### Changed
- **The Canvas and Results panes have the same 8px gap on every side.** Before, the gaps differed, and there was none at the bottom.

### Fixed
- **The desktop app's "update ready" message no longer says "restart" twice.** Its "Restart Now" button also looks like a button.

## [0.51.1] - 2026-08-23
### Changed
- **Set a connection's color in Settings → Database Connections by clicking its status dot.** The dot in the connection picker at the top left only shows status.
- **The Updates list shows a short title for each change, with details underneath.** This makes it easier to skim.
- **The Pine and SQL panels open with Ctrl/Cmd+. and Ctrl/Cmd+, instead of Ctrl/Cmd+Shift+E and Ctrl/Cmd+Shift+S.**
- **Each filter you add on the canvas becomes its own `where:` step.** Before, they were joined with commas in one `where:`. Several filters on one table must still all match.

### Fixed
- **Table colors no longer disappear when you open the SQL panel.** The results hadn't changed, but the app thought they were out of date.
- **Auto-run works while the SQL panel is open.** Before, canvas edits only ran the query while the Pine panel was showing.

## [0.51.0] - 2026-08-23
### Added
- **A new layout puts the canvas and the results side by side, or one above the other.** It's the default for new sessions. Switch back to the classic sidebar layout from the header, Settings or the command palette.
- **Auto-run: each edit on the canvas runs the query.** Turn it off in Settings or the command palette if you'd rather run queries yourself.
- **A Pine or SQL text panel can sit next to the canvas in the new layout, for editing by hand.** Open it with Ctrl+Shift+E (Pine), Ctrl+Shift+S (SQL) or the PINE/SQL toggle in the canvas toolbar. Drag the divider to resize it.
- **`|` also opens the join picker on the canvas, like `i`.** A join pipes a new table onto the current one.
- **In the canvas's select, order, group and join pickers, `,` works like Enter.** You can type a comma-separated list of columns in one go.
- **Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y undo and redo on the canvas.** `u` and Shift+U still work too.
- **Remove any table from the canvas, not only the last one.** Joins that depended on it reconnect to the tables that are left. If such a join isn't real, it's drawn dashed as a warning.
- **Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab switch tabs in the desktop app.** Ctrl+PageDown and Ctrl+PageUp work too. In a browser, these keys belong to the browser's own tabs.

### Removed
- **The "Compact mode" preference is gone.** It only affected the classic layout. The new layout stacks its panes on small screens by itself.

### Fixed
- **Canvas shortcuts keep working after a query runs.** Before, `s`, `w`, `o`, `g`, `i`, `x` and `u` stopped working until you reloaded.
- **A saved sidebar height no longer makes the window scroll.** It could stretch the graph and results taller than the window.
- **The join action's letter hint shows `i`, its real shortcut.** It used to show `j`.
- **A checkpoint shows its letter shortcuts when it has keyboard focus, like a table does.** A checkpoint is a `group:` or `limit:` step.
- **Opening the Pine/SQL panel no longer blocks canvas shortcuts.** It used to put the cursor in its editor, so keys didn't reach the canvas until you clicked away.
- **Auto-run starts 150 ms after an edit instead of 500 ms.** Queries usually take a few milliseconds, so the longer wait made auto-run feel slow.
- **A canvas edit the server couldn't fully build no longer crashes the app.**
- **A join left with no column to connect on shows as a dashed warning line.** Before, it looked like a normal join, and the table at its far end showed no columns. This could happen after you deleted a table between two others.
- **Canvas edits work while the SQL panel is open.** Before, the graph and the SQL stayed frozen. A session reloaded with the SQL panel open also got stuck on "Connecting…".

### Changed
- **The canvas/graph switch moved from the header into the graph panel.** The header only switches the overall layout.

## [0.50.0] - 2026-08-22
### Breaking
- **Requires pine-lang 0.39.0 or later.** The connection refresh icon needs it.

### Added
- **A refresh icon on each live connection picks up new tables and columns.** It's in Settings → Database Connections. Before, you had to restart the server.
- **Give a connection a name in the desktop app.** Set it when you add the connection, or later with the pencil icon in Settings → Database Connections.
- **Use the canvas from the keyboard.** Move between tables and checkpoints with the arrow keys or `j`/`k`. Then press `s` select, `w` where, `o` order, `g` group, `i` join, `x` delete, or `u` and Shift+U to undo and redo.

### Fixed
- **The delete icon lines up on every row in Settings → Database Connections.** It used to shift when a row also showed the refresh icon.
- **The desktop app's graph no longer sticks on "Connecting…" once the database is connected.** A tab's first query could fail before its connection was ready, and nothing tried again.
- **AI agent access on a connection is shown as a small robot icon, lit when it's on.** The switch it replaces looked like it turned the whole connection on or off.

### Changed
- **Settings → About labels the pine-lang version "Server version".** It also shows the version of this interface, and of the desktop app when you use it.

## [0.49.0] - 2026-08-16
### Added
- **A Settings page brings database connections, preferences and AI agent setup together.** Open it with the gear icon next to the notification bell.
- **In the desktop app, AI agents such as Claude Code can query your saved connections.** They connect through MCP. Turn it on for each connection in Settings.
- **Pick the database type when you add a connection, and its default port fills in.**
- **"Open Settings" and "New Database Connection" are in the command palette.**

### Changed
- **"Connections" is called "Database Connections" everywhere.** This leaves room for a future connection to the Pine server itself.
- **When you add a connection, tabs switch between filling in fields and pasting a connection string.** They replace the expandable section.
- **The Docker "Welcome" page and the "Pine server is not running" page are gone.** The app opens straight to its normal view.

## [0.48.0] - 2026-08-13
### Breaking
- **Requires pine-lang 0.38.1 or later.**

### Added
- **Build Pine queries by clicking through tables in a graph (experimental).** Turn it on from the header, next to the version number.

### Changed
- **The whole app shares one visual design, the "schematic/blueprint" look.**

## [0.47.0] - 2026-08-09
### Changed
- **Each tab keeps its own database connection and connects only when you open it.** Before, every tab followed the connection you picked last. At start-up, Beamlynx reconnects the tab you were on, and a hollow dot means it isn't connected yet.

### Fixed
- **Clicking a graph node no longer jumps into the Pine input.** It was taken as a Tab key press and moved the suggestion highlight.
- **Picking a connection at start-up no longer changes which connection other tabs show.** It could also open an unrelated new tab.
- **In the desktop app, tabs saved by an older version reconnect on their own.** Before, they never connected automatically.
- **In the desktop app, the connection picker's checkmark always marks the open tab's connection.** It could point at another connection after you switched tabs.
- **Restarting Beamlynx no longer makes tabs forget their connection.** Each tab was reset to "not connected" before the server could reconnect it.
- **A failed reconnect from the connection picker shows an error.** This happens when a saved connection was deleted or renamed, or its database can't be reached. Before, nothing appeared on screen.
- **In the desktop app, a saved connection that isn't live shows a hollow dot.** Before, every saved connection showed a solid dot, connected or not.
- **In the desktop app, a tab no longer shows its connection's `host:port` at start-up before its name.** It shows a neutral placeholder until the name loads.

## [0.46.2] - 2026-08-04
### Breaking
- **Requires pine-lang 0.37.2 or later.**

### Fixed
- **A failed connection attempt shows an error.** Before, the "connecting" spinner just stopped, for example with a wrong password or an unreachable database.
- **A connection restored from a past session shows as connected only if it really is.** The server's connections don't survive a restart, so Beamlynx checks first.
- **When you're not connected, the connection picker opens for you.** If you have no connections yet, the form to add one opens. Before, you only saw "Not connected to database".

## [0.46.1] - 2026-08-03
### Fixed
- **The playground's shared connection can't be deleted.** Deleting it broke the playground for everyone.
- **The Updates list no longer says "-1 days ago" for a change made today.** This happened when your time zone is behind UTC.

## [0.46.0] - 2026-08-03
### Added
- **Tabs come back after a reload.** Each keeps its Pine or SQL text, input mode and connection.
- **Ctrl/Cmd+S saves the tab's Pine expression as a `.pine` file.**
- **"List Database Connections" and "New Database Connection" are in the command palette.**

### Fixed
- **Tab cycles through Pine suggestions while the graph has focus.** Before, it moved between the graph's nodes and edges instead.

## [0.45.2] - 2026-08-02
### Fixed
- **The notification bell shows unread updates in the warm accent color, not blue.**

## [0.45.1] - 2026-08-02
### Fixed
- **In the desktop app, saved connections show their color and name in the connection picker.**
- **The connection dialog opens by itself only when there's nothing to connect to.** Before, it opened even when you had saved or active connections.

### Changed
- **The notification bell no longer shakes for new updates.** It still changes color.

## [0.45.0] - 2026-08-02
### Added
- **Beamlynx runs as a desktop app, with no Docker needed.**
- **The desktop app has shortcuts for the command palette and tabs.** Ctrl/Cmd+K opens the command palette, Ctrl/Cmd+T opens a tab and Ctrl/Cmd+W closes it.
- **The desktop app shows update progress.** Before, updates only ran in the background.
- **The desktop app remembers your saved connections between sessions.** They're encrypted with your device's secure storage. The browser version still never stores credentials.

### Changed
- **The desktop app hides the small server version label.** The desktop app has its own release notes.

## [0.44.0] - 2026-07-31
### Added
- **Name an intermediate result with `|= name` and reuse it in later expressions.** A new editor holds several expressions. Named results and checkpoints (`group:` and `limit:` steps) show in the graph as boxes you can collapse, joined like tables.
- **Paste a Postgres connection string to fill in the connection fields.** For example `postgresql://user:password@host:5432/database`. The field is masked like a password, so password managers can fill it in.
- **Delete a saved connection from the connection picker.** Click its trash icon, then click again to confirm.

### Fixed
- **Typing in the Pine input no longer slows down as you add expressions.**
- **Autocomplete shows "Loading..." instead of "Nothing found" while it loads.**

### Breaking
- **Requires pine-lang 0.37.0 or later.**

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
