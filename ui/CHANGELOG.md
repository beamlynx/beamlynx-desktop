# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]
### Breaking
- Needs the matching beamlynx-desktop release. It uses the desktop app's new `credentials.attachTemplate` and its policy proposal events, and no longer uses `access-policy:duplicate` or `credentials.setConnectionPolicy`.

### Added
- **An agent can propose a change to the access policy.** It reads its connection's policy, then proposes changes, such as showing one column, or hiding one it noticed should stay hidden. The proposal is a card in the agent's investigation: the agent's reason, then each change in plain words, like "Show public.activity.type". Turning off or removing an Except rule is marked in the warning colour. Nothing changes until you click **Apply**. **Decline…** sends the agent your reason, if you give one. After Apply, **Undo** puts the rules back. The agent isn't told about an Undo. A card the agent stopped waiting on can no longer be answered. This replaces the Allow card.

### Changed
- **Agent access: one setting per connection.** A connection's row says what agents can do there, with three choices. **Off**: agents can't use it. **Masked**: agents see what the connection's own access policy allows, and the row says how many of its rules are on and which template they came from, with **Edit rules**. The first time, a dialog asks which template to start from. **Every column**: agents read every column, unmasked. It asks first, in a dialog with a red **Allow every column** button. The policy and its rules are kept, and apply again under Masked. Under Masked, **Start over from a template…** replaces the connection's rules with a fresh copy of a template, after asking. The dialog offers the built-in Default and your own templates. **Mask my own queries too** comes last, under Masked. Changing a connection's policy never changes another connection. Needs the matching beamlynx-desktop.
- **The connection list shows agent access.** A robot next to a connection's name says agents can use it: dim when masked by its policy, in the warning colour when agents read every column, absent when off. It stays when the row is expanded, and its tooltip says how many rules are on. It replaces the "MCP" chip, which disappeared on expanding and didn't tell masked from every column. Templates are listed by name, with Default first.
- **Connect is a button.** A click on a connection's row opens its settings, and **Connect** switches the tab to that database. The connection the tab already uses says "Connected". Before, a click anywhere on the row switched the database. The web build, which has no settings to open, still connects on a click.
- **A zap marks the tab's connection, and Connect sits in the middle.** In Settings → Database Connections, the connection the tab uses has a zap before its name. Every other row keeps the same space empty, so the names line up. **Connect** forms a column after the names, and the other actions stay at the far right. "Connected" is gone, and the tab's own row has no empty slot. A name too long for its column ends in an ellipsis, and hovering it shows all of it.
- **Actions look like actions.** Every action in a connection's row is in the accent colour, with its icon where it has one: **Refresh schema**, **Delete connection…**, **Edit rules**, **Start over from a template…** and **Connect**. **Add connection** is an outlined button, kept clear of the panel's close button. The line under **Mask my own queries too** is gone, so an expanded connection reads as one group.
- **Add connection sits beside the title.** Settings → Database Connections has **Add connection** at the top right, always in view however long the list gets. Before, it was a full-width button below the list. With no connections yet, the empty list says so and offers **Add connection** itself.
- **Info icons, and tooltips that wait.** Explanations in a connection's row sit behind a small info icon right after what they explain: one after **Agent access** for all three choices, and one after **Mask my own queries too**. The question-mark cursor is gone. Every tooltip in the app now waits 600 ms before it shows, and 300 ms when moving from one to the next, so passing over something doesn't put text over what you're reading.
- **A quieter connection row.** What Off, Masked and Every column mean moved into tooltips on the choices. So did what "Mask my own queries too" does. The row keeps what is set, like "9 rules on, from the Default template", and the warning under Every column. **Refresh schema** and **Delete connection…** are plain text buttons like the rest, without icons or colour. Delete's red lives in its dialog.
- **One way to confirm.** Allowing every column, starting a policy and deleting a connection or a template all ask in a dialog that names what will happen. Cancel has focus. Nothing unfolds inside a row any more, and "click again to delete" is gone. Reversible changes apply at once.
- **The built-in Default template can't change.** Settings → Policy templates shows it read-only. Every connection that starts from it gets the same rules, and edits its own copy. Your own templates stay editable.
- **A clearer sidebar toggle.** The button that collapses and expands the sidebar is a double chevron, « or », pointing the way the sidebar will move, and it's labelled "Collapse sidebar". Before, it used the menu icon, which looked like Database Connections' storage icon at that size. It stays at the bottom, out of the way of the connection at the top.
- **One sidebar item for agents.** MCP left Settings. The robot at the bottom of the sidebar is always there on desktop. Before any agent has worked here, it opens **Connect an agent**, the setup. Afterwards it opens the agent's work, as before, and the timeline has **Connect another agent**.
- **Settings → Access Policy is now Policy templates.** A template is where a connection's policy starts. Changing a template doesn't change connections already made from it.
- **A query that uses a hidden column is refused at once.** The agent's call no longer waits for you to allow the column. The agent can propose a change instead.
- **An agent's timeline is shorter.** Each query is two lines: the agent's reason with its row count, then the query. A query that failed adds one line with the error. Hover a line to read all of it. Lookups in a row, like table searches and completions, are one line showing the latest, with a count of the others. Click it to see them all. Questions waiting for your answer keep their full cards.
- **The timeline follows the agent.** It stays scrolled to the newest step, also as a step grows, such as when a query finishes. Scroll up and it stays where you are. **New steps below** then takes you back, and so does scrolling to the bottom.

### Removed
- The choice to copy a shared policy, in the results and on the Allow card. No policy is shared any more.

### Fixed
- **A connection's access policy no longer shows as "None" with a desktop app older than per-connection policies.** The row looked for a policy marked as the connection's own, and an older app doesn't mark it. It now shows the policy the connection uses.
- **A `group:` with no keys on the canvas.** pine-lang can now group the whole table: `orders | group: with count as n, total => sum as revenue`. Its checkpoint reads `group with count as n`. Grouping it by a column from the canvas keeps its aggregates: `group: c.name with count as n`. Before, the canvas would have read the aggregates as keys. Needs pine-lang after 0.50.0.
- **Sort and filter chips keep what newer Pine writes.** pine-lang can now sort with `nulls first` or `nulls last` after a column, and filter on a function of a column, like `jsonb_typeof(data) = 'array'`. SQL to Pine writes both. Flipping a sort chip's direction used to drop the text after `asc` or `desc`, and write Pine that doesn't parse. It now keeps `nulls first`, and the chip shows it. Editing a filter chip with a function on the left used to put the table's alias in front of the function. It now writes the function as it was.
- **An agent's SQL no longer appears in the Pine editor.** When an agent sent SQL that doesn't convert to Pine, its step in the investigation kept the SQL. Clicking that step, or going back to the latest query, then put the SQL in the agent's tab as if it were Pine. Nothing ran. Now such a step can't be clicked, because nothing ran in the tab. Its card shows the SQL, marked as SQL, with the reason it didn't convert. While SQL is still converting, its card is marked as SQL too.

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
- Database Connections: a "Database type" picker (Postgres/MySQL) when adding a connection, with the port field defaulting to match (5432/3306). Pasting a connection string now also accepts `mysql://` (in addition to `postgresql://`/`postgres://`) and sets the picker accordingly. The SQL panel (and the Pine/SQL input's SQL mode) correctly renders a MySQL connection's backtick-quoted SQL too.

### Fixed
- A query that failed at the network level (e.g. the server unreachable) left the loading spinner stuck on forever with no error shown, since the query-evaluation path had no `try/catch` around its network call — a thrown exception skipped every one of its `loading = false` sites. It now always resets and shows the failure.

### Breaking
- Minimum required pine-lang server version raised to 0.44.0 (from 0.43.0) — needed for the MySQL connection support above. Connecting to an older server now shows the upgrade-required screen instead of the app.

## [0.60.0] - 2026-09-10
### Added
- MCP: when a connection's access policy is redacting something an agent legitimately needs, it can now call `request_reveal` to ask you to look at the real query. It opens in a normal tab where you can edit the expression, then reveal the real results to the agent or decline with a comment explaining why (so it can adjust and retry). Requires beamlynx-desktop's matching support.
- Results grid: a new "Copy result as CSV" button (next to Export to CSV) copies the whole result to your clipboard as CSV, ready to paste into a spreadsheet. Also available as a "Copy Result" command in the command palette.
- Canvas mode: adding a `where` filter on a column that looks like a date now offers "today" and "in the last" alongside the usual operator choices (=, !=, ...) - picking either adds a pair of `where:` conditions instead of asking for a literal value.
- Results grid: clicking a cell in a JSON column opens its formatted, syntax-highlighted value in a panel on the right, already in edit mode - type your change and press Mod+Enter or the checkmark to save, or the undo icon to cancel back to the read-only view. JSON cells no longer edit inline in the grid row. Copying from the right-click menu also copies the pretty-printed form. The panel's own left edge can be dragged to resize it, its editor respects Vim mode when you have that on in Settings, and pressing Escape while editing no longer closes the panel (in Vim mode it exits to normal mode instead, matching Vim's own behavior). Every code editor's scrollbar (this panel, Pine/SQL input) now matches the app's theme instead of the OS default.

### Changed
- Database Connections: the per-connection "apply access policy to my own queries" toggle is now off by default and opt-in, instead of on by default with an opt-out "bypass". An access policy protects the MCP agent only unless you explicitly turn this on to have it also redact your own queries on that connection.
- Canvas mode: moving between table nodes with the keyboard (arrow keys, `j`/`k`) now spotlights that table's columns in the Results grid, the same way hovering a node with the mouse already did.

### Fixed
- New Layout: opening the Pine/SQL panel (Ctrl/Cmd+./+Shift+., the toolbar buttons, or the command palette) now moves keyboard focus into it and reframes the graph to fit the canvas's new size. Neither used to happen reliably - the panel could open with the graph's own keyboard shortcuts silently disabled and nowhere for keystrokes to land instead, and the graph stayed wherever the old pan/zoom left it, partly cut off by the resized canvas.
- Canvas mode: a `where` chip added via the Results grid's right-click "Filter" action can now always be deleted or edited. It used to land at the end of the query's pipe text regardless of which table it filtered, so canvas's position-based bookkeeping could attribute it to the wrong table - deleting or editing it then silently did nothing, or acted on an unrelated chip that happened to share its position.
- Canvas mode: reopening an existing `where` chip to edit it (e.g. `ilike`) no longer breaks the query on save. The server reports operators in their SQL casing (`ILIKE`), and the editor was writing that casing straight back into the Pine text, which pine-lang's parser rejects since it only accepts lowercase operator keywords.

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
