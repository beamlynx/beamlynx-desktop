# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]
### Added
- **The results show how long the query took.** The time, in milliseconds, sits next to the row count. It counts from pressing Run to the rows arriving.

## [0.70.2] - 2026-10-28
### Changed
- **The sidebar lists an agent's investigation under Agent only once it has a name.** Until then, if it's the only one, clicking **Agent** opens it.

### Fixed
- **The agent's question shows as soon as the agent says it.** It appears in the sidebar and at the top of the timeline. Before, it waited for the agent's next step.

## [0.70.1] - 2026-10-28
### Changed
- **Opening a connection in a tab that has a query offers two clearly labelled choices.** **Open in a new tab** leaves this tab as it is, and is the default. **Switch this tab** warns that the query may not work on the other database.
- **To connect another agent, click the plug icon in the timeline's header.** It sits next to the arrow that hides the timeline, and opens the agent setup in Settings.
- **Access policy rules for a column in any schema say "in every schema".** You'll see this in Settings and on the cards where an agent proposes a change.

### Fixed
- **Applying an agent's proposed policy change works, or says why it didn't.** Before, Apply could fail silently and leave the card stuck. If saving fails, the policy goes back to how it was, and the card says when the agent had already stopped waiting.
- **Undo on an applied proposal no longer erases changes made after it.** If the policy changed since you clicked **Apply**, Undo is refused and points you to Settings.
- **An agent's queries run one at a time, and each step in the timeline shows its own result.** Before, queries sent together could mix up each other's columns and errors. A query that runs too long is stopped.
- **The agent's timeline no longer shows "working" forever.** Steps that will never finish are shown as ended, including a reveal preview that runs longer than 60 seconds. Each investigation shows what its own agent is doing.
- **Buttons in the timeline and in Settings show an error when they fail.** They used to stay disabled. If **Show to agents** fails, the rules go back to how they were.
- **An agent's query is refused when its connection's access policy can't be found.** Before, it ran without hiding anything.
- **Long agent sessions use less memory.** Each step keeps at most 500 rows to show again, and only the ten most recent finished investigations are kept.
- **The plug icon always takes you to the agent setup.** If Settings is already open there, the setup flashes so you can see it.

## [0.70.0] - 2026-10-26
### Changed
- **Account is at the bottom of the sidebar.** It shows your initials once you sign in, and a dot until then. The settings at the top are about the app.
- **Picking a connection while the tab has a query offers to open it in a new tab.** **Open in new tab** is the default, and leaves this tab's query as it is. **Switch this tab** switches it, as before.
- **The sign-in screen comes back at every launch until you sign in.** Only **Skip for now** closes it, until the next launch. Clicking outside it or pressing Escape does nothing.

## [0.69.0] - 2026-10-26
### Breaking
- **Needs pine-lang 0.51.0 and the matching beamlynx-desktop release.**

### Added
- **Sign in to Beamlynx with GitHub, or skip.** On desktop, a first-run screen asks you to sign in, so we know who uses Beamlynx. Skipping is final, and you can sign in or out later in **Settings → Account**.
- **Anonymous usage stats, with a switch to turn them off.** The first-run screen says so before anything is sent, and the switch is in **Settings → Account**. Each query run is counted as yours or an agent's, in Pine or SQL, and nothing else about it is sent.
- **Agents can propose changes to an access policy.** The proposal is a card in the agent's timeline that lists each change in plain words. Nothing changes until you click **Apply**, and **Undo** puts the rules back. This replaces the Allow card.

### Changed
- **Each connection has its own access policy.** Changing it never changes another connection. Settings → Access Policy is now **Policy templates**, which a connection's policy starts from.
- **Agent access is set per connection: Off, Masked or Every column.** This replaces the MCP switch. **Masked** hides columns as the connection's policy says. **Every column** lets agents read everything, after asking you to confirm. While agents have access, Settings reminds you that what they read goes to your AI provider, and that masking isn't a guarantee.
- **The connection list is clearer.** A zap marks the tab's connection, and a robot shows whether agents can query it. Click a row to open its settings, and **Connect** to switch to it.
- **Anything that weakens protection or deletes something asks in a dialog.** "Click again to delete" is gone.
- **Agents have one item in the sidebar.** On desktop, the robot opens the agent setup until an agent has worked here, then the agent's work. The MCP section left Settings.
- **Tooltips wait 600 ms before showing.** Longer explanations sit behind small info icons.
- **The sidebar toggle is a double chevron.** It used to look like the Database Connections icon.
- **An agent's query that uses a hidden column is refused straight away.** Before, it waited for your answer. The agent can propose a policy change instead.
- **The agent's timeline is shorter and follows the newest step.** A query takes two lines, and a run of lookups takes one. Scroll up to stop following, and click **New steps below** to go back.

### Fixed
- **A `group:` with no keys reads correctly on the canvas.** It shows as `group with count as n`.
- **Sort and filter chips keep the newer Pine you wrote.** Flipping a sort keeps `nulls first` or `nulls last`. Editing a filter keeps a function on its left, like `jsonb_typeof(data) = 'array'`.
- **An agent's SQL that didn't convert to Pine no longer appears in the Pine editor.** Its step in the timeline shows the SQL and why it didn't convert.

## [0.68.0] - 2026-10-19
### Added
- **Hiding or showing a column for agents can change only this connection's policy.** When the policy is shared with other connections, Beamlynx asks first. **Copy for (this connection)** changes a copy, and **Change (policy)** changes it for every connection. Needs the matching beamlynx-desktop release.

### Changed
- **The agent's item sits at the bottom of the sidebar, once an agent has started an investigation.** Until then there is nothing to open. The connection and the settings stay at the top.

### Fixed
- **"Also restrict my own queries" applies in an agent's investigation tab too.** Before, every query you ran in that tab was masked, whatever the setting said. Only the agent's own queries are always masked.

## [0.67.0] - 2026-10-18
### Breaking
- **Needs pine-lang 0.50.0 or later (was 0.49.0).** With 0.49.0, your own tabs would hide the values that are hidden from agents. Connecting to an older server shows the upgrade-required screen.

### Added
- **A sidebar on the left.** It holds the database connection at the top, the agent, What's new and each section of Settings. It shows icons, and expands to show labels and the agent's investigations.
- **Agent investigations.** In the desktop app, each Claude session gets its own investigation, named for the question the agent is investigating. Its timeline keeps every step: the tables the agent looked for, each query with its reason and result, and what it found. Click a query to see its rows again, exactly as the agent saw them, without running anything.
- **Let an agent use a hidden column while it waits.** When an agent's query filters, sorts or groups on a column the access policy hides, the timeline shows a card with the column and the agent's reason. **Allow** adds the column to the policy and runs the query again. **Decline** sends the agent your reason.
- **An agent's request to see hidden values is a card in its investigation.** The query runs once, read-only, so you can check the real rows before deciding. **Reveal to the agent** sends exactly those rows, and **Decline** sends your reason.
- **Write to the agent from Beamlynx.** A box at the bottom of the timeline sends the agent a note with its next call. A query you run in the agent's tab is added to the timeline, and the agent is told what you ran and what came back.
- **Except rules keep a column hidden from agents, even when an Allow rule matches it.** Every policy starts with exceptions for names containing `token`, `password` and `secret`. You'll find both lists in Settings → Access Policy.
- **Hide a column from agents, or show it, from the results.** Right-click a cell or a column header and choose **Hide from agents** or **Show to agents**. The change goes into the policy of that tab's connection, and you can undo it.
- **See which columns agents can't see.** On a connection agents can query, a hidden column has a crossed-out eye in its header. Your own tabs still show the real values.

## [0.66.0] - 2026-10-17
### Breaking
- **Needs pine-lang 0.49.0 or later (was 0.48.0).** Most of the new features below need it. Connecting to an older server shows the upgrade-required screen.
- **Editing a cell finds its row by the table's primary key, not by a column called `id`.** Tables keyed on another column, or on several, can now be edited. Tables and views without a primary key can't be edited, and the grid says why. Primary key columns themselves can't be edited.

### Added
- **See what an AI agent is doing as it works.** In the desktop app, the robot icon in the header pulses while an agent works, and its tooltip says what it's doing. Clicking it opens a log of every call the agent made. Needs beamlynx-desktop 0.20.0 or later.
- **Reset the canvas layout.** After you drag a node, a refresh icon at the right end of the canvas toolbar puts everything back where it was laid out.
- **Open a checkpoint or a named result to see what's inside it.** An arrow on the node, or `e`, opens a dashed box above it that holds the tables it is made from. Those tables work as usual.
- **Several query blocks on the canvas.** A block that ends in `|= name` is drawn as a nested query of the block that uses `name`. A strip at the top of the canvas shows how the blocks feed each other. Click a chip to open that block.
- **A "per" field in the limit editor.** It keeps the first N rows of each group, like `limit: 3 per department_id`.
- **Variables in the filter editor.** Type `$name` as a value to use a variable, and pick `in` or `not in` to compare with a list. **make variable** turns a value like `'shipped'` into a variable, with its value in the values block.
- **The canvas draws a query in stages.** Each `limit:` or `group:` ends a stage, and the steps after it work on that result. Each checkpoint is a node you can select from, filter and join, like a table.
- **Set the limit from any table on the canvas.** Use `limit:` in a table's "+" menu, or press `l`.
- **AI agents can send SQL, which runs as Pine.** The desktop app's `run_sql_as_pine` tool converts the agent's SQL to Pine and runs only the Pine, under the same rules as any agent query. SQL that doesn't convert runs nothing, and the agent is told why. Needs the matching beamlynx-desktop release.
- **The SQL panel completes table and column names.** Press Tab or Ctrl/Cmd-Space to open the hints, as in the Pine panel. After `JOIN`, it suggests the tables that join to yours, with the `ON` clause written out.
- **SQL becomes Pine as you type.** The canvas draws the SQL you type, and you can edit it there. When the SQL doesn't convert, an amber line under the editor says why, and the SQL still runs.
- **JSON paths on the canvas.** A key inside a JSON column, like `data.address.city`, shows by that name on the select, filter, order and group chips.
- **Edit a key inside a JSON column from the grid.** The edit is saved into that key alone, and keeps the type the value had. A cell for a missing key, an object or an array stays read-only and says why.
- **The SQL panel hides the extra columns Beamlynx adds so results can be edited.** They are still fetched. To show them, turn on the switch in Settings → Preferences, or use **Toggle Hidden Columns in SQL** in the command palette.
- **Stop a running query.** While a query runs, Run becomes **Stop**, and Escape in the editor does the same. The database stops the query, and a write is rolled back.
- **SQLite in the desktop app.** Pick SQLite as the database type in Settings → Database Connections, then choose the file with **Browse…** or type its path.
- **On desktop, your preferences are kept in the app's data file, `beamlynx.db`.** This covers theme, fonts, panel sizes, open tabs and the other settings. Your current settings are copied over the first time. Needs beamlynx-desktop 0.20.0 or later.
- **The desktop app remembers column widths.** A column you resize keeps its width the next time it shows up, in any tab, on the same connection.

### Changed
- **Deleting through a traversal removes rows in batches of 10 000.** Pine accepts `limit:` only up to 10 000. The SQL script you can copy says to repeat a statement that has more rows.
- **The canvas no longer makes up names for checkpoints, like `agg`.** When it needs a name in the text, it uses the one Pine already gives, like `|= result_1`.
- **A `beamlynx://run` link opens its query in a tab but doesn't run it.** A banner names the connection it would run on. Check both, then press Run. Any web page or message can carry such a link.

### Removed
- **Sign-in on the hosted web build.** The desktop app never had sign-in, and the web build is no longer deployed.

### Fixed
- **A database that is down shows one plain message instead of leaving tabs stuck.** "Can't reach the database" appears above the results, with the reason. The tab you're on tries again every 10 seconds. The desktop app no longer shows an alert at startup for a connection it can't reach.
- **A canvas popover near the edge is no longer cut off.**
- **A filter, join or group on a table before a checkpoint lands in that table's stage.** Once a query had two checkpoints, it could land after the checkpoint instead.
- **Removing a query's only `limit:` or `group:` on the canvas no longer leaves a stray name, like `|= agg`.**
- **Copying results and CSV export hold only the columns shown in the grid.** They used to include hidden key columns, such as `__c_0__id`.
- **A column the query works out, like `created_at => month`, can no longer be edited.** Saving it used to write the value into the stored column, such as `2024-01` into `created_at`.
- **Tab right after an alias and a dot, as in `s: t.`, offers that table's columns.** Before, it offered nothing. Choosing a table after `public.` no longer repeats the schema.
- **Using a recipe (Ctrl+O) keeps your tab's own `$variables`.** Before, the recipe's values replaced them and changed the tab's results.
- **You can't approve a reveal request while the query has unrun edits.** This makes sure the agent only gets rows you looked at.
- **Values with an apostrophe, like O'Brien, are saved correctly.** They used to be saved as O_Brien, and a row whose text id had an apostrophe couldn't be edited.
- **A damaged or out-of-date saved preference no longer leaves a blank page at start-up.** It falls back to its default. Damaged saved tabs are skipped.
- **An unexpected error shows a page with Reload and "Reset preferences and reload" instead of a blank window.** Resetting keeps your open tabs.
- **A Pine server with a version like `dev` connects.** It used to show "No connection to Pine server". The upgrade-required screen also clears once the server is upgraded, without a reload.
- **Auto-run on the canvas no longer runs a query that changes data.** Narrowing an `update!` with a filter chip used to run the update at once. Such a query now waits for Run.
- **Saving a cell checks first that the row still exists.** If it doesn't, the save is refused and says so.
- **A `?query=` share link with a `%`, like `like '%a%'`, opens.** It used to be ignored.
- **The bar chart is offered only up to 2 000 rows.** A large result used to freeze the tab.
- **A tab whose saved connection was deleted asks you to pick one.** It used to show "Failed to reconnect" every time you switched to it.
- **The Inspect dialog says why an update failed, and shows JSON values as JSON.** It used to show "Update execution failed" and `[object Object]`.

### Security
- **The desktop app no longer writes your database password to the developer console.**
- **A reveal request can no longer change data.** Before, an agent could send `user | delete!` as a reveal request, and the rows were deleted as soon as it arrived. The query now runs read-only, and one that would change data is declined.
- **Only Beamlynx can use the query server bundled with the desktop app.** Each request carries a secret the app makes at launch. If the server refuses the app, the connection indicator suggests restarting Beamlynx.
- **CSV export and copy can't run a formula in your spreadsheet.** A value starting with `=`, `+`, `-` or `@` gets an apostrophe in front.
- **Next.js and other libraries are updated past every published security advisory.** This includes the middleware bypass CVE-2025-29927.

## [0.65.0] - 2026-10-06
### Breaking
- **Needs pine-lang 0.48.0 or later (was 0.47.0).** Values blocks and named results after `in` need it. Connecting to an older server shows the upgrade-required screen.
- **Ctrl+S saves a recipe instead of downloading the tab as a `.pine` file.** Nothing in Beamlynx opened those files. In the browser, which has no recipes, Ctrl+S does nothing.

### Added
- **Variables.** Write `$name` where a value goes, and set it in a values block above the query, like `$company_name = 'Acme'`. On the canvas, a Variables list shows each variable and its value, and you can click a value to change it.
- **Use one query's result in another.** A named result with one column can follow `in`, like `employee | where: id in acme_emps`.
- **A recipe keeps its `$variables` and their values.**
- **An AI agent can pass values for `$variables` when it runs a query.** The agent's tab shows the values it used, so you can run it again.
- **Save a query as a recipe with Ctrl+S.** A bar above the tab asks for a title. The query's comments are saved with it, as the recipe's explanation. Needs the desktop app 0.19 or later.
- **Use a recipe with Ctrl+O.** Search by any word in its title, comments or query. The query goes into your tab as text, and nothing runs until you press Ctrl+Enter.

### Changed
- **The hosted web app is no longer updated.** The last version deployed stays online.
- **The web app builds on Node.js 24.** Hosting providers stopped building with Node.js 20.
- **A development copy shows an amber DEV chip in the header.** A desktop dev build shows it too, so it can't be mistaken for the installed app.
- **A desktop dev build can run next to the installed app.** It uses its own port, and its agent setup is named `beamlynx-dev`.

### Fixed
- **The Access Policy section says that a hidden column can still be used in a query's conditions.** So a query could test a guess about its values, for example by counting rows. This was always true, but wasn't written down.
- **Keys pressed in a dialog no longer reach the canvas behind it.** Pressing Backspace, Delete or `x` in the recipe picker or the command palette used to delete the selected item in your tab.
- **New Database Connection in the command palette opens the add form again.** It used to open the list of connections. A saved password that can't be unlocked now opens the form filled in every time.
- **The Access Policy and MCP sections describe agent access correctly.** Access is set per connection, under **MCP access** in Database Connections.

## [0.64.0] - 2026-09-27
### Breaking
- **Needs pine-lang 0.47.0 or later (was 0.46.0).** Canvas filters that match any of several conditions use `or`, which pine-lang 0.47.0 added. Connecting to an older server shows the upgrade-required screen.

### Added
- **An edited value's cell glows briefly, and a message says it was saved.** If it wasn't saved, the message says why.
- **A value that can't be edited says why as soon as you try.** That covers a row's `id`, a table whose `id` isn't in the result, and values the query works out.
- **Move between result cells with the arrow keys, and copy a range.** Select by dragging or with Shift. Ctrl+C copies the range as text that pastes into a spreadsheet.
- **A canvas filter can match any of several conditions.** In the filter panel, **+ or** adds another condition. It is written as one `where:` joined with `or`.

### Changed
- **The results grid is new, and much faster.** Scrolling stays smooth however many rows there are. A 100,000-row result shows about four times sooner.
- **The delete script from traverse explains how its Run button works.** Running the script yourself deletes everything in one transaction. Run deletes one table at a time, deepest first, committing each.
- **Results resize smoothly when Settings or the Pine panel opens beside them.** They used to turn into a grey placeholder while the panel moved.
- **All rows are in one scrolling grid.** Results are no longer split into pages of 100 rows.

### Removed
- **Sorting by clicking a column header, and the column menu.** Sorting and filtering will come back as changes to the Pine query. To filter on a value for now, right-click the cell and choose **Filter**.

### Fixed
- **Tab in the canvas filter panel moves between the panel's own fields.** It used to move focus out of the panel.
- **A filter typed by hand that matches any of several conditions shows on its table on the canvas.** It used to disappear. Click its chip to edit every condition.
- **The app's fonts work offline.** Fonts like IBM Plex Mono and Inter now ship inside the app. Before, the desktop app used a system font if they weren't installed.

## [0.63.0] - 2026-09-25
### Breaking
- **`delete:` is gone from Pine.** Use traverse instead (see below). A saved tab that ends in `delete:` has it removed when the tab opens.
- **Needs pine-lang 0.46.0 or later (was 0.45.0).** The canvas needs the new way the server describes joins. Connecting to an older server shows the upgrade-required screen.

### Added
- **Traverse from a table on the canvas.** Press `+` on a table and pick **traverse**. It finds every table that points at it by foreign key, up to 25 levels deep. **Count rows** lists their row counts. **Delete rows…** builds a script that deletes them, deepest table first, which you can copy or run.

### Fixed
- **Joins on the canvas start from the latest table unless you pick another.** Hovering over a table used to move focus to it, so the next `|` could join from the wrong table. To join from an older table, click it or move to it with the keyboard.
- **Ctrl+C on the canvas copies again.** It used to open the comment editor. Ctrl+V, Ctrl+A and Ctrl+F work again too.
- **Switching tabs no longer makes the layout jump.** Panel sizes used to reset and then jump back to your saved sizes.
- **The error above the results is no longer cut off.** It wraps over up to six lines, then scrolls.

### Security
- **AI agents can no longer change your data.** The old check only refused `delete!`, and let `update!` through. The Pine server now refuses every write from the agent's tab, even if you press Run there yourself.
- **Agent queries need pine-lang 0.46.0 or later.** An older server can't refuse the writes, so agent queries won't run against it.

### Removed
- **The `BEAMLYNX_MCP_ALLOW_DELETE` environment variable.** It turned off the check on agents' deletes for the whole machine.

## [0.62.0] - 2026-09-20
### Added
- **Explain a tab with a comment at the top of its query.** Start the query with a `/* ... */` comment or `--` lines, and the canvas shows it in its top-left corner. It's a place to note what you're looking for and why.
- **Write a tab's comment from the canvas.** Press `c`, click the comment button in the toolbar, or click an existing comment. Cmd/Ctrl+Enter or clicking away saves it, and Esc cancels.
- **An AI agent explains each query it runs.** It starts the query with a comment saying what it is looking for and why, so its tab shows its reasoning.
- **Have more than one connection to the same host and port.** They need to point at different databases. The second one used to be rejected.
- **The connection string stays in step with the fields.** In the Add Connection form, switching to the "Connection string" tab rebuilds it from the Fields tab.

### Changed
- **Panels open and close with a short animation.** This covers Settings, the Pine/SQL panel, Zen mode, the error above the results and dialogs. Turn on your system's "reduce motion" setting to make them instant.
- **Results columns fit their content instead of stretching to fill the pane.** Scroll sideways when a wide result doesn't fit.
- **Table colours tint only each column's header, not every value under it.** Hovering a table on the canvas does the same. It used to tint every cell, even with "Table colors" turned off.
- **Switching the tab's connection while it has a query warns you first.** The query may use tables or columns the other connection doesn't have. Before, a new tab opened without asking.
- **Rename a connection with the pencil icon next to its name.** You used to have to expand the row first.
- **An AI agent's queries show in a tab of their own.** It is pinned to the end of the tab strip with a robot icon. Each new query replaces the last, so closing the tab is safe.
- **An agent's request to see hidden values opens a "Needs approval" tab.** It names the connection, quotes the agent's reason, and offers Approve or Decline. Closing it declines, so the agent never waits forever.
- **An agent icon in the header shows what the agent is doing.** A dot means a result arrived, and a count means approvals are waiting. Clicking it opens what needs you most.
- **Settings opens faster the first time.** It also remembers your scroll position and section.
- **Dragging a pane divider no longer selects text.**

### Removed
- **The classic Graph mode.** The canvas is now the only graph editor.
- **Legacy Layout.** The canvas and results two-pane layout is the only one, and Settings always opens as a docked panel.

### Fixed
- **Panels open and close smoothly, even with a full table of results on screen.** The results grid used to redo its layout on every frame of the animation.
- **A results column you resize keeps its width.** It used to snap back, for example when you hovered a table on the canvas.
- **Entering or leaving Zen mode keeps the canvas where you panned and zoomed.**
- **A blank line inside a `/* ... */` comment no longer breaks the query.** The comment used to be split in two.
- **The version badge in the header no longer says "obsolete" before you connect.**
- **Typing a space while renaming a connection adds a space.** It used to switch your active connection instead.
- **The rename and expand icons line up across rows in Database Connections.** They used to shift sideways.
- **Icon-only buttons have labels for screen readers.** This covers close, download, save, notifications, tab controls and the JSON inspector.

### Breaking
- **Needs pine-lang 0.45.0 or later (was 0.44.0).** Canvas comments need it, because an older server deletes them when you change the query on the canvas. So do several connections to one host and port. Connecting to an older server shows the upgrade-required screen.

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
