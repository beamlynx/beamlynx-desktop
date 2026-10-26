export interface ChangelogItem {
  // A short, skimmable phrase naming what changed -- the thing a user reads
  // when scanning the list without stopping. Kept required so every entry
  // has one instead of only the ones someone remembered to write.
  title: string;
  // The fuller explanation: why it changed, how to use it, or what exactly
  // broke. Optional -- a title like "Dark mode" needs nothing more under it,
  // and repeating the title as a one-line "description" would just be noise.
  description?: string;
  example?: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  added?: ChangelogItem[];
  changed?: ChangelogItem[];
  removed?: ChangelogItem[];
  fixed?: ChangelogItem[];
  security?: ChangelogItem[];
  breaking?: ChangelogItem[];
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '0.70.0',
    date: '2026-10-26',
    changed: [
      {
        title: "Account is at the bottom of the sidebar",
        description:
          "It shows your initials once you sign in, and a dot until then. The settings at the top are about the app.",
      },
      {
        title: "Picking a connection while the tab has a query offers a new tab",
        description:
          "**Open in new tab** is the default, and leaves this tab's query as it is. **Switch this tab** still switches it. Cancel, Escape or a click outside does neither.",
      },
      {
        title: "The sign-in screen comes back at every launch until you sign in",
        description:
          "Only **Skip for now** closes it, until the next launch: a click outside it or Escape does nothing. The Skip link is smaller.",
      },
    ],
  },
  {
    version: '0.69.0',
    date: '2026-10-26',
    breaking: [
      {
        title: "Needs pine-lang 0.51.0 and the matching beamlynx-desktop release",
      },
    ],
    added: [
      {
        title: "Sign in once, or skip",
        description:
          "On desktop, a first-run screen offers sign-in with GitHub, so we know who uses Beamlynx. Skip is final: the screen never comes back on its own. It waits for a launch with an internet connection. **Settings → Account** shows who is signed in, signs out, or signs in later. Both link to the privacy policy and the terms. Needs a beamlynx-desktop with sign-in; older ones show nothing new.",
      },
      {
        title: "Anonymous usage stats, and a switch for them",
        description:
          "The first-run screen says that Beamlynx sends anonymous usage stats, before anything is sent. The switch to turn them off is in **Settings → Account**. Each query run is counted as a user or agent run, in Pine or SQL, and nothing else about it.",
      },
      {
        title: "Agents can propose access policy changes",
        description:
          "A proposal is a card in the agent's timeline that lists each change in plain words. Loosening an Except rule is marked in the warning colour. Nothing changes until you click **Apply**. **Decline…** sends the agent your reason, and **Undo** puts the rules back. This replaces the Allow card.",
      },
    ],
    changed: [
      {
        title: "Each connection has its own access policy",
        description:
          "Changing it never changes another connection, so the choice to copy a shared policy is gone. Settings → Access Policy is now **Policy templates**: a template is where a connection's policy starts. The built-in **Default** template can't be edited.",
      },
      {
        title: "Agent access per connection: Off, Masked or Every column",
        description:
          "It replaces the MCP switch. **Masked** applies the connection's policy, and the first time you pick the template it starts from. **Every column** lets agents read every column, after asking, and keeps the policy for later. **Start over from a template…** resets a connection's rules. While agents have access, a line says that what they read goes to their AI provider, and that masking isn't a guarantee.",
      },
      {
        title: "A clearer connection list",
        description:
          "A zap marks the tab's connection, and a robot shows agent access: dim when masked, in the warning colour for every column. A click on a row opens its settings, and **Connect** switches to it. **Add connection** is at the top right.",
      },
      {
        title: "One way to confirm",
        description:
          "Anything that weakens protection or deletes something asks in a dialog. \"Click again to delete\" is gone.",
      },
      {
        title: "One sidebar item for agents",
        description:
          "The robot is always there on desktop. It opens the setup until an agent has worked here, then the agent's work. MCP left Settings.",
      },
      {
        title: "Tooltips wait 600 ms before showing",
        description:
          "and explanations sit behind small info icons.",
      },
      {
        title: "The sidebar toggle is a double chevron",
        description:
          "so it no longer looks like the Database Connections icon.",
      },
      {
        title: "A query that uses a hidden column is refused at once",
        description:
          "instead of waiting for your answer. The agent can propose a change.",
      },
      {
        title: "The agent's timeline is shorter and follows the newest step",
        description:
          "A query takes two lines, and a run of lookups takes one. Scroll up to stop following, and **New steps below** brings you back.",
      },
    ],
    fixed: [
      {
        title: "A `group:` with no keys reads right on the canvas",
        description:
          "`group with count as n`. Needs pine-lang after 0.50.0.",
      },
      {
        title: "Sort and filter chips keep newer Pine",
        description:
          "Flipping a sort keeps `nulls first` or `nulls last`, and editing a filter keeps a function on its left, like `jsonb_typeof(data) = 'array'`.",
      },
      {
        title: "An agent's SQL no longer appears in the Pine editor",
        description:
          "when it didn't convert. Its step shows the SQL and why it didn't convert.",
      },
    ],
  },
  {
    version: '0.68.0',
    date: '2026-10-19',
    added: [
      {
        title: "A shared policy is copied, not changed for everyone, if you choose",
        description:
          "When you show or hide a column for agents from the results, and the connection's access policy is also used by other connections, beamlynx asks first. **Copy for (this connection)** gives the connection a copy of the policy and changes only the copy; the other connections keep the original. **Change (policy)** changes it for all of them, as before. Undo after a copy puts the connection back on the original and removes the copy. The Allow card in an agent's investigation offers the same two choices. Needs the desktop app's new `access-policy:duplicate`.",
      },
    ],
    changed: [
      {
        title: "The agent sits at the bottom of the sidebar",
        description:
          "and only once an agent has started an investigation, since until then there's nothing to open. The connection and the settings stay at the top.",
      },
    ],
    fixed: [
      {
        title: "\"Also restrict my own queries\" now applies in an agent's investigation tab too",
        description:
          "A query you ran there was always masked, whatever the setting said, because the whole tab counted as the agent's. Now only the agent's own queries are always masked, while they run. Your own runs in that tab follow the setting, as in any other tab, and the agent's results in the timeline stay as it saw them.",
      },
    ],
  },
  {
    version: '0.67.0',
    date: '2026-10-18',
    breaking: [
      {
        title: "Needs pine-lang 0.50.0 or later (was 0.49.0)",
        description:
          "Your own tabs ask pine-lang only to report which columns agents can't see (`access-policy-mode: annotate`), and an agent's refused query names the hidden column, so you can be asked to allow it. Pine-lang 0.49.0 knows neither, and would mask the results in your own tabs. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
    added: [
      {
        title: "A sidebar on the left",
        description:
          "The agent, What's new and the settings moved from the header's right corner to a sidebar on the left, next to where Settings and an investigation's timeline open. It runs the window's full height. The database connection moved to its top, as a workspace is in Slack: a tile in the connection's colour with its initial, filled when connected. Click it to switch the tab's connection, or to reconnect. It shows icons only, and expands to show labels and the agent's investigations by their questions. It remembers which you chose. Settings' sections are items of their own, each with an icon: Database Connections, Appearance, Preferences, Access Policy, MCP and About. One opens Settings at that section, and clicking it again closes it. The panel beside it shows only the open section, so it's narrower by default (520 px).",
      },
      {
        title: "Agent investigations",
        description:
          "In the desktop app, each Claude session that uses beamlynx gets an investigation of its own, named for the question the agent says it is investigating. The robot in the sidebar opens it as a tab at the end of yours. Closing the tab only puts it away: the robot opens it again with everything the agent did. An agent's tabs are no longer restored as your own tabs when the app restarts. A timeline beside the canvas keeps every step: the tables it looked for, each query with the reason the agent gave and what came back, and what it found, including from other tools. Click a query to see its rows again, exactly as the agent saw them, without running anything. The tab follows the newest query until you pick an older one. A failed query is marked in the timeline, with its error. The robot opens the current investigation, or a decision an agent is waiting on. Its activity log is replaced by the timeline.",
      },
      {
        title: "Allow a hidden column while the agent waits",
        description:
          "When an agent's query is refused because it filters, sorts or groups on a column the access policy hides, the timeline shows a card: which column, and the agent's reason. **Allow** adds that column to the Allow rules of the connection's policy, and the agent's query runs again in the same call. **Decline** sends your reason to the agent. A column hidden by an Except rule isn't offered, since the Except rule would win.",
      },
      {
        title: "Reveal requests are cards in the investigation",
        description:
          "When an agent asks to see a query's real values (`request_reveal`), the request is a card in its investigation, with the agent's reason, instead of a \"Needs approval\" tab. The query runs once, read-only, so you can look at the real rows in the grid before deciding. **Reveal to the agent** sends exactly those rows. **Decline** sends your reason. A query that changes data is declined without asking, as before. You can no longer edit the agent's query before revealing it.",
      },
      {
        title: "Write to the agent from beamlynx",
        description:
          "A box at the bottom of the timeline sends a note to the agent. It arrives with the agent's next call to beamlynx, and the timeline shows when it has. A query you run yourself in the agent's tab is added to the timeline, and the agent is told what you ran and what came back.",
      },
      {
        title: "Exceptions to what agents may see",
        description:
          "In the desktop app, every column is hidden from agents unless an access policy's **Allow** rule matches it. Now a policy can also list **Except** rules: a column they match stays hidden, even when an Allow rule matches it. Every policy starts with exceptions for names containing `token`, `password` and `secret`, so a uuid column called `reset_token` stays hidden even though uuids are allowed. Settings \u2192 Access Policy lists the Allow rules, then the exceptions. Each list has a form to add a rule: a name that contains, equals or ends with a text, or one exact column. The rules that used to be called \"Allow \u2026\" are now plain names, such as \"Standard data types\", under Allow.",
      },
      {
        title: "Change the access policy from the results",
        description:
          "Right-click a cell or a column header and choose **Hide from agents** or **Show to agents**. The change is saved to the policy of that tab's connection. A message says what changed, which policy it was saved to, and which other connections use that policy, with **Undo** and **Open policy**. A column a broader exception covers, such as \"name contains token\", offers that exception instead, opened in Settings. A connection agents can query with no policy offers to choose one.",
      },
      {
        title: "See which columns agents can't see",
        description:
          "On a connection agents can query, a column hidden from them has a crossed-out eye in its header, in your own tabs as well as the agent's. Your own tabs still show the real values.",
      },
    ],
  },
  {
    version: '0.66.0',
    date: '2026-10-17',
    breaking: [
      {
        title: "Needs pine-lang 0.49.0 or later (was 0.48.0)",
        description:
          "The canvas's checkpoints, limit: N per, groups written with with, SQL to Pine, JSON paths and the database-down message all need it. Connecting to an older server shows the upgrade-required screen.",
      },
      {
        title: "A cell edit finds its row by the table's primary key, not by a column called id",
        description:
          "Tables keyed on another column, or on several columns, can now be edited from the grid. Tables and views without a primary key can't be edited, even when they have an id column, and the grid says why. Primary key columns can't be edited. Needs pine-lang after 0.48.1, which marks each primary key column in the result.",
      },
    ],
    added: [
      {
        title: "See what an AI agent is doing, as it does it",
        description:
          "In the desktop app, the robot icon in the header appears with the agent's first call of any kind, not only its first query. While the agent works, the robot pulses, here and on the agent's tab. It keeps pulsing for 20 seconds after each call, while the agent thinks about its next one. Its tooltip says what the agent is doing, like \"Searching for tables like \\\"order\\\"\". Clicking it opens the agent's activity log: every call, newest first, with its time and how long it took. Click a call to see what the agent sent, like its SQL or Pine, and how it went. Buttons there open the agent's tab, or a pending approval. Clicking the robot used to jump straight to the agent's tab. Needs a desktop app that reports the calls (beamlynx-desktop after 0.19.0); with an older one, nothing changes.",
      },
      {
        title: "Reset the canvas layout",
        description:
          "Once you have dragged a node or a strip chip, the canvas toolbar shows a refresh icon at its right end. Clicking it puts every node back where the layout places it. Dragged positions are kept in memory only, so reloading also resets them.",
      },
      {
        title: "Checkpoints and named results open into containers",
        description:
          "A checkpoint's node, or a table that uses an earlier block's |= name, has an arrow to expand it. Expanded, a dashed box with no fill is drawn right above the node, around everything it holds, with a short line from the box to the node. The tables inside work as usual. Opening and closing is animated. Everything starts closed, and e on the node opens or closes it. Animation follows the system's reduced-motion setting.",
      },
      {
        title: "Several query blocks on the canvas",
        description:
          "A query block above the last one that ends in |= name is drawn as a nested query of it. The table that uses name says |= name; its arrow, or e on the table, draws the block above it in a container. Changes made on that block's tables edit that block's text. A strip at the top of the canvas shows how the blocks are made from each other: one chip per block, like |= top with limit 10 under it, and query for the last block. An arrow goes from each block to the blocks that read it, labelled in when it's used in where: x in name. The arrows are dashed curves, unlike the square join lines below, so the join graph only shows joins. Clicking a chip expands that block; clicking query collapses it. A chip can be dragged anywhere; the tables below move down to make room for it. A block the last query doesn't join has no node: its chip stands for it, and expanded, its container stands alone above the graph. Only one nested query is expanded at a time, checkpoints and named blocks alike. A query block above the last without |= name still shows a banner.",
      },
      {
        title: "per in the limit editor",
        description:
          "Besides the number, an optional \"per\" field takes columns of the stage's tables: the first N rows of each group of rows that share them. Opened from a checkpoint node's label, it shows the columns it already has.",
      },
      {
        title: "Variables in the where editor",
        description:
          "Type $name as a value to use a variable: the tab's own are offered, and a new one gets a $name =  line in the values block, so the Variables list asks for its value. in and not in are in the operator list and take a list, 1, 2, or a list variable, $ids. On an existing condition, make variable turns status = 'shipped' into status = $status and moves 'shipped' into the values block, as $status_2 if $status is taken. A $name = line with no value needs pine-lang after 0.48.1.",
      },
      {
        title: "Checkpoints on the canvas are drawn as stages",
        description:
          "A limit: or group: seals everything before it, and the steps after it work on that result. The canvas now draws the query top to bottom, one stage per checkpoint. Each checkpoint is a node named as pine-lang names it: the |= name, or result_1, result_2, and so on. It is drawn and works like any table: select, where, join, the \"+\" menu and the keyboard all act on the result. Tables joined after a checkpoint are drawn in its stage, joined to its node. The node says what the checkpoint does, like limit 10, limit 1 per c.id or group t.title with count. Click a limit's label to change the number and its per. Changing a group's columns keeps its aggregates after with as typed. Its × removes the checkpoint, and the tables after it stay. After you add a limit: or group:, the new checkpoint's node is focused, so the next step builds on it. Before, the tables before a checkpoint always sat in a dashed box on the main graph. Needs pine-lang's ast.checkpoints (pine-lang after 0.48.1).",
      },
      {
        title: "Set the limit from any table on the canvas",
        description:
          "limit: is in each table's and checkpoint's \"+\" menu, and on the l key, as well as on the multi-select toolbar. It changes the limit at the end of that table's stage, if there is one. Otherwise it adds a limit at the end of the query. It opens with the current limit filled in, and clear removes it. l is in the shortcut list at the bottom of the canvas.",
      },
      {
        title: "AI agents can send SQL, which runs as Pine",
        description:
          "The desktop app's run_sql_as_pine tool takes SQL. The app converts it to Pine, and only the Pine runs, the same way as any agent query: in a visible tab, with the connection's access policy, and with writes refused. SQL itself never runs. An UPDATE or DELETE converts and shows in the agent's tab, but never runs. The agent gets back the Pine that ran, so it learns Pine as it goes. SQL that doesn't convert runs nothing, and the agent is told why, like \"Line 3: OFFSET isn't in Pine.\" Needs beamlynx-desktop's matching release.",
      },
      {
        title: "The SQL panel completes table and column names",
        description:
          "from the connected database. The hints open the way they do in the Pine panel: Tab opens them and moves to the next one, Shift-Tab moves back, and Ctrl/Cmd-Space opens them too. They no longer pop up while you type. After JOIN, the hints start with the tables that join to the ones already in the query, with the ON clause written in your aliases, like employee e ON e.company_id = c.id. They are the joins the Pine panel suggests, from foreign keys and column names like company_id. After FROM or JOIN it offers tables. After an alias and a dot, like e., it offers that table's columns. A name like tenantId is inserted in quotes where the database needs them. Tables in the default schema (public in Postgres) are offered without it. A reindex loads the names again. Needs pine-lang's /api/v1/sql-schema; with an older server there is no completion.",
      },
      {
        title: "SQL becomes Pine as you type",
        description:
          "Typing or pasting a query in the SQL panel converts it to Pine after a short pause, and the canvas draws it: its tables, joins and conditions, editable by clicking. When the SQL doesn't convert, the canvas keeps the last query that converted, and a line under the SQL editor says so and why: \"The canvas isn't showing this query. Line 3: OFFSET isn't in Pine.\" It is marked in amber, not red, because that SQL can still run; red is kept for a query that can't. The line is empty while the canvas shows what you typed, and SQL that is only unfinished is mentioned only if it stays that way for a moment. The SQL you typed stays in the panel. A burst of typing is one undo step on the canvas, so one Ctrl+Z brings back the query from before. Converting runs nothing: in SQL mode, Run still runs the SQL. Needs pine-lang after 0.48.1, which adds /api/v1/sql-to-pine.",
      },
      {
        title: "JSON paths on the canvas",
        description:
          "A key inside a JSON column, like data.address.city, shows as that name on the select, where, order and group chips. Editing a where chip writes the path back, and a value compared with a key reads SE, not \"SE\". Needs pine-lang after 0.48.1.",
      },
      {
        title: "Edit a key inside a JSON column",
        description:
          "A cell like dp.companies[0].id can be edited in the grid, and the edit is saved into that key alone. It keeps the type the value had: in a number cell 12 is saved as a number and text that isn't a number is refused; in a string cell 5 stays the string \"5\"; a boolean cell takes true or false, or 1 or 0, which is how SQLite shows them. A JSON null takes what is typed as a string. A cell whose key is missing in that row, or that holds an object or an array, stays read-only and says why. Needs pine-lang after 0.48.1, which sends each value's JSON type.",
      },
      {
        title: "Hidden columns in SQL",
        description:
          "The SQL panel shows the query without the columns beamlynx adds so results can be edited: each table's key and each JSON value's type. They are still fetched. To see them, turn on the switch in Settings > Preferences, or use Toggle Hidden Columns in SQL in the command palette. The setting applies to every tab. Copy SQL copies what is shown. With pine-lang 0.48.1 or older, the SQL always includes them.",
      },
      {
        title: "Stop a running query",
        description:
          "While a query runs, Run becomes Stop. Escape in the Pine or SQL editor does the same when no completion list is open. With Vim mode on, Escape may stay with Vim; use the button. The database stops the statement, a write is rolled back, and the results pane says \"Query stopped.\" The command palette has Stop Query too. Needs pine-lang after 0.48.1.",
      },
      {
        title: "SQLite",
        description:
          "in the desktop app. Pick SQLite as the database type in Settings > Database Connections, then choose the database file with Browse… or type its absolute path. There is no server, port, user or password to enter. A connection string takes the form sqlite:///path/to/file.db. It needs a pine-lang with SQLite support (after 0.48.1); an older one refuses the connection. The web build doesn't offer SQLite: it would read the server's disk, not yours.",
      },
      {
        title: "Preferences in the desktop app's data file",
        description:
          "On desktop, theme, fonts, text size, panel sizes, open tabs and the other settings are kept in beamlynx.db, the app's SQLite file, instead of the browser's storage. The first time the app starts with this, it copies your current settings into the file, once. A dev build has a file of its own. Browser storage still gets every change for one more release, so going back to an older version keeps them. The web build still uses browser storage. Needs beamlynx-desktop after 0.19.0; an older one keeps using browser storage.",
      },
      {
        title: "Column widths are remembered",
        description:
          "in the desktop app. A column you resize keeps that width the next time it shows up, in any tab, until you resize it again. Widths are kept per connection, by table and column heading, in the app's data file. A column that isn't from a table, like a count, is remembered by its heading. The web build doesn't remember widths.",
      },
    ],
    changed: [
      {
        title: "Deleting through a traversal removes a table with more than 10 000 matching rows in batches of 10 000, because pine-lang now accepts limit: only up to 10 000",
        description:
          "Each table still loses no more rows than were counted in the plan. The copyable SQL script uses the same limit and says to repeat a statement that has more rows.",
      },
      {
        title: "The canvas no longer makes up a checkpoint's name (agg, agg2, ...)",
        description:
          "When a gesture needs the name in the text, it writes the one pine-lang already gives the checkpoint, like |= result_1.",
      },
      {
        title: "The canvas reads each where: condition from pine-lang as a map with alias, column, cast, operator and value, not as a list read by position",
        description:
          "With an older pine-lang, where chips don't show. Needs pine-lang after 0.48.1.",
      },
      {
        title: "The canvas reads named results from /build's named-results, which pine-lang renamed from variables",
        description:
          "With an older pine-lang, the canvas no longer recognises a named result used as a table. Needs pine-lang after 0.48.1.",
      },
      {
        title: "A beamlynx://run link opens a tab with the expression but no longer runs it",
        description:
          "A banner names the connection it would run on. Check both and press Run. Any web page or message can carry such a link, and the browser's prompt doesn't show what it would do.",
      },
    ],
    removed: [
      {
        title: "Sign-in with Clerk on the hosted web build, and the middleware that enforced it",
        description:
          "The desktop app never had sign-in, and the web build is no longer deployed. The middleware also skipped sign-in for any hostname containing 'playground', and logged every request's hostname.",
      },
      {
        title: "The unused marked library",
      },
    ],
    fixed: [
      {
        title: "Opening the app while a database is down no longer leaves the tabs stuck",
        description:
          "The canvas said \"Not parsing - showing last valid graph\" while the results showed the connection error, and the canvas kept saying it after the database came back, on every tab, even once Run worked again. Now the tab shows one message, above the results, in plain text: \"Can't reach the database\", with the reason. The canvas shows no banner. The tab you're on tries again every 10 seconds. Other tabs don't, but switching to one tries it at once. When the database answers, every tab on it draws its graph again, and a successful run brings it back straight away. In the desktop app, a saved connection that can't connect at startup no longer pops an alert either. Needs pine-lang's matching release.",
      },
      {
        title: "A canvas popover opened near the edge of the canvas could be cut off",
        description:
          "It now always stays inside the window.",
      },
      {
        title: "A where:, join or group: on a table before a checkpoint could land after it, once the query had two checkpoints",
        description:
          "It now lands in the table's own stage.",
      },
      {
        title: "Removing a query's only limit: or group: on the canvas no longer leaves a name behind, like | = agg",
        description:
          "It now goes when nothing is left for it to name, unless you wrote the name or later steps use it.",
      },
      {
        title: "Copy result and CSV export included the hidden key columns beamlynx adds for editing, such as __c_0__id",
        description:
          "They now hold only the columns shown in the grid.",
      },
      {
        title: "A result column worked out by the query, like a date bucket (created_at => month), could be edited in the grid or the JSON inspector",
        description:
          "Saving wrote the value into the stored column: 2024-01 into created_at. These columns are now read-only, and say why.",
      },
      {
        title: "Pressing Tab right after an alias and a dot, as in s: t., offered nothing",
        description:
          "The editor took the dot for the word being typed, and no column contains a dot. It now offers the alias's columns and inserts the chosen one after the dot. Choosing a table after a schema prefix, as in public.te, replaces the whole prefix instead of repeating the schema.",
      },
      {
        title: "Using a recipe (Ctrl+O) in a tab that already sets one of its $variables changed that tab's results",
        description:
          "The recipe's values block came last, and the last value wins across the whole tab. The tab's value is now kept, and the recipe's assignment of that name is left out. Using the same recipe twice no longer adds its values twice.",
      },
      {
        title: "Approving a reveal request is disabled while the expression has been edited but not run, so the agent never receives rows the owner didn't look at",
        description:
          "If the run fails, the banner shows why instead of doing nothing.",
      },
      {
        title: "Editing a cell to a value with an apostrophe, like O'Brien, saved it as O_Brien",
        description:
          "A row whose text id contained an apostrophe couldn't be edited at all. The value is now written with the apostrophe doubled, which Pine reads as one apostrophe. Needs pine-lang after 0.48.1.",
      },
      {
        title: "A stored preference the app no longer understands, or browser storage that is blocked, could leave a blank page or an 'Application error' at start-up",
        description:
          "An unknown theme, font or text size, a non-version 'last read' marker, and a damaged list of saved tabs each did it. Every preference is now checked, an unusable one falls back to its default, and damaged saved tabs are skipped.",
      },
      {
        title: "An unexpected error while drawing the app shows a page with Reload and 'Reset preferences and reload' buttons instead of a blank window",
        description:
          "Resetting keeps your open tabs.",
      },
      {
        title: "A Pine server whose version isn't a plain x.y.z, such as dev or 0.48, showed as 'No connection to Pine server'",
        description:
          "It now connects. The upgrade-required screen also clears once the server is upgraded, instead of staying until a reload.",
      },
      {
        title: "Auto-run on the canvas no longer runs an expression that changes data",
        description:
          "Adding a where chip to narrow an update! used to run the update 150 ms later. Such an expression now waits for Run, and the tab says why.",
      },
      {
        title: "Pressing Enter in a cell checks that the row is still there before saving",
        description:
          "If it isn't, the save is refused and says so.",
      },
      {
        title: "A ?query= share link containing %, such as like '%a%', was silently ignored",
        description:
          "It opens now.",
      },
      {
        title: "The bar chart is offered only up to 2 000 rows; past that, its button is disabled with a tooltip",
        description:
          "A large result used to freeze the tab. Empty strings and Infinity no longer count as numbers to chart.",
      },
      {
        title: "A tab whose saved connection was deleted showed a 'Failed to reconnect' alert on every switch to it",
        description:
          "It now forgets the connection once and asks you to pick one.",
      },
      {
        title: "The Inspect dialog's Run shows why an update failed instead of 'Update execution failed'",
        description:
          "JSON values that the grid didn't recognise as JSON show as JSON instead of [object Object]. The connection monitor no longer logs an error every second while the server is down.",
      },
    ],
    security: [
      {
        title: "The desktop app no longer writes the database password to the developer console when it connects to a saved connection",
        description:
          "Other connection details are logged only in development builds.",
      },
      {
        title: "An expression an AI agent asks to reveal can no longer change data",
        description:
          "The review tab runs it read-only, and a reveal request whose expression would change data is declined automatically, with a comment saying why. Before, user | delete! sent as a reveal request deleted the rows the moment it arrived.",
      },
      {
        title: "In the desktop app, every request to the bundled query server carries the secret the app makes at each launch, so no other program or web page can use the server",
        description:
          "If the server refuses the app anyway, the connection indicator says so and suggests restarting beamlynx. Needs beamlynx-desktop with launch tokens (after 0.19.0) and pine-lang after 0.48.1.",
      },
      {
        title: "CSV export and copy neutralise a value a spreadsheet would run as a formula (one starting with =, +, -, @, a tab or a carriage return) by prefixing an apostrophe",
        description:
          "A value with a carriage return is quoted. JSON values are written as JSON, not [object Object].",
      },
      {
        title: "Updated Next.js from 13.5.6 to 15.5.27, past every published Next.js advisory, including the middleware bypass (CVE-2025-29927)",
        description:
          "PostCSS, nanoid, source-map-js and yaml are lifted to fixed versions. npm audit --omit=dev reports no vulnerabilities. The lockfile is back in step with package.json.",
      },
    ],
  },
  {
    version: '0.65.0',
    date: '2026-10-06',
    breaking: [
      {
        title: "Needs pine-lang 0.48.0 or later (was 0.47.0)",
        description:
          "Values blocks and named results after in need it. Connecting to an older server shows the upgrade-required screen.",
      },
      {
        title: "Ctrl+S no longer downloads the tab as a .pine file",
        description:
          "Nothing in beamlynx opened those files. Ctrl+S now saves a recipe (see below). In the browser, where there are no recipes, Ctrl+S does nothing.",
      },
    ],
    added: [
      {
        title: "Variables",
        description:
          "Write $name in a query where a value goes, and set it in a values block of its own above the query: $company_name = 'Acme', or a list for in, $statuses = ('failed', 'stuck'). A values block holds one or more $name = value lines, so the query and its values are all in the Pine text. Pressing Ctrl+Enter with the cursor in a values block runs the query below it. On the canvas, a Variables list shows each $name the query uses and its value, or \"no value\"; click a value to change it, which rewrites its line in the text. Condition chips show $name. Needs pine-lang with values blocks (0.48 or later).",
      },
      {
        title: "One query's result in another: a named result that selects one column can be used after in, like employee | where: id in acme_emps (pine-lang 0.48 or later)",
      },
      {
        title: "A recipe keeps its $variables and their values: saving one includes the values blocks the query uses, placed above the query, and using it puts them in with the query",
      },
      {
        title: "An AI agent can pass values for $variables to run_query, overriding those written in the text (with beamlynx-desktop's matching change)",
        description:
          "The agent's tab shows the values it used in a values block above the query, so the run can be repeated.",
      },
      {
        title: "Save a query as a recipe with Ctrl+S (desktop app 0.19 or later)",
        description:
          "A bar above the tab asks for a title, offering the first line of the query's top comment. Enter saves, Esc cancels. It saves the block under the cursor, plus any block above it that the query uses through a named result. Comments are saved with the query: they are the recipe's explanation. Recipes are offered on every database.",
      },
      {
        title: "Use a recipe with Ctrl+O",
        description:
          "Find it by any word in its title, comments or query, then click it or press Enter. Its query, comments included, goes into the tab as ordinary text. Nothing runs until you press Ctrl+Enter. Hover a recipe to see its query. Delete one with the trash icon on its row: click once, then again within 3 seconds. Editing comes later.",
      },
    ],
    changed: [
      {
        title: "Vercel no longer deploys this repo",
        description:
          "vercel.json turns off deployments for every branch, including main and release/**. The last deployed version stays online until the Vercel project is removed.",
      },
      {
        title: "The hosted web app builds on Node.js 24",
        description:
          "Vercel stopped building with Node.js 20, so every deployment since 2026-10-03 had failed. package.json now sets engines.node to 24.x, which overrides the Vercel project's setting, and .nvmrc says 24. npm test works on Node.js 22 and later again: it passes the test files, not the folder.",
      },
      {
        title: "A dev copy shows an amber DEV chip in the header, in place of the grey \"[Development]\" text",
        description:
          "It also shows in a desktop dev build (beamlynx-desktop's npm start), which had no label at all, so it can't be mistaken for the installed app when both are open. Hover it to see which kind of dev copy it is.",
      },
      {
        title: "Inside beamlynx-desktop, the app now asks the desktop app which port its Pine server is on instead of assuming 33333",
        description:
          "The desktop dev build uses a different port, so it can run next to the installed app. The browser and playground are unchanged.",
      },
      {
        title: "In the desktop dev build, the MCP setup instructions register the server as beamlynx-dev, so it can sit next to the installed app's beamlynx entry",
      },
    ],
    fixed: [
      {
        title: "The Access Policy section now says that a masked column can still be used in a query's conditions, so a query can test a guess about its values, for example by counting matching rows",
        description:
          "That has always been true; it wasn't written down.",
      },
      {
        title: "Keys pressed in a dialog, such as the Ctrl+O recipe picker or the command palette, no longer reach the canvas behind it",
        description:
          "Clicking a dialog's text and then pressing Backspace, Delete or x used to delete the selected item in your tab.",
      },
      {
        title: "New Database Connection in the command palette opens the add form again",
        description:
          "It used to open Settings on the list of connections instead, because that section was already loaded in the background. The same fix covers a saved password that can't be unlocked: the form now opens filled in every time, not only the first time.",
      },
      {
        title: "The Access Policy section said agent (MCP) access needs an active rule in some policy",
        description:
          "The rule is per connection: MCP access can be turned on for a connection whose own policy has an active rule, or that has no policy.",
      },
      {
        title: "The MCP section's setup steps named a toggle and a section that no longer exist",
        description:
          "They now say to turn on MCP access under Database Connections.",
      },
    ],
  },
  {
    version: '0.64.0',
    date: '2026-09-27',
    breaking: [
      {
        title: "Needs pine-lang 0.47.0 or later (was 0.46.0)",
        description:
          "Canvas filters that match any of several conditions are written with or, which pine-lang 0.47.0 added. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
    added: [
      {
        title: "After you edit a value, its cell glows briefly and a short message says it was saved",
        description:
          "If it wasn't, the message says why.",
      },
      {
        title: "A value that can't be edited now says why as soon as you try, instead of opening an editor",
        description:
          "That covers a row's id (an update uses it to find the row), a table whose id isn't in the result, and values the query works out rather than reads from a table.",
      },
      {
        title: "Move between result cells with the arrow keys",
        description:
          "Select a range by dragging or with Shift, and copy it with Ctrl+C as tab-separated text that pastes into a spreadsheet.",
      },
      {
        title: "A canvas filter can match either of several conditions",
        description:
          "In the filter panel, + or adds another condition; pick its column from the same list as the first. The filter is written as one where: joined with or, like where: c.status = 'blocked' or c.status = 'active'. It needs pine-lang 0.47.0, which added or.",
      },
    ],
    changed: [
      {
        title: "The results grid is new, and much faster",
        description:
          "It draws only the cells in view, so scrolling stays smooth however many rows a result has. A result shows up in about half the time, and a 100,000-row result about four times sooner than before.",
      },
      {
        title: "The delete script from traverse now says in its first lines how its Run button works",
        description:
          "Running the script yourself deletes everything in one transaction, between its BEGIN; and COMMIT;. Run doesn't send those: it deletes one table at a time, deepest first, and each table is committed as it goes.",
      },
      {
        title: "Opening or closing Settings or the Pine panel beside the results is smooth now",
        description:
          "The results used to be swapped for a grey placeholder while the panel moved, then redrawn; now they resize along with it.",
      },
      {
        title: "Results are no longer split into pages of 100 rows",
        description:
          "Every row the query returns is in one scrolling grid, with the row count underneath.",
      },
    ],
    removed: [
      {
        title: "Sorting by clicking a column header, and the column menu (sort, filter, hide columns)",
        description:
          "Sorting and filtering will come back as changes to the Pine expression, so they show up in the query. To filter on a value for now, right-click the cell and choose Filter.",
      },
    ],
    fixed: [
      {
        title: "Tab in the canvas filter panel moved focus out of the panel, usually to the Pine panel",
        description:
          "It now moves through the panel's own fields and buttons, going to add right after the value, and wraps around. Escape still closes the panel.",
      },
      {
        title: "A filter typed by hand that matches any of several conditions disappeared from its table on the canvas",
        description:
          "It now shows as one chip, and clicking it opens every condition in it for editing.",
      },
      {
        title: "The app's fonts now ship inside it",
        description:
          "The desktop app showed IBM Plex Mono, JetBrains Mono, Fira Code, Inter and IBM Plex Sans only if they were installed on your computer, and a system font otherwise. The web app downloaded them from Google Fonts. Every build now carries its own copies, and works offline.",
      },
    ],
  },
  {
    version: '0.63.0',
    date: '2026-09-25',
    breaking: [
      {
        title: "delete: is gone from Pine",
        description:
          "Use the traverse action below instead. A saved tab that still ends in delete: has it removed when the tab opens, so the tab doesn't come back blank.",
      },
      {
        title: "Needs pine-lang 0.46.0 or later (was 0.45.0)",
        description:
          "The server now describes a join in a different shape, which this release needs to draw the canvas. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
    added: [
      {
        title: "Traverse from a table on the canvas",
        description:
          "Press + on a table and pick traverse. It follows every table that points at it by foreign key, up to 25 levels deep, and offers two operations on them. Count rows lists each table with its row count; click one to open its rows in a new tab. Delete rows… generates the delete statements, deepest table first, as a script you can copy or run from the same panel after a confirmation.",
      },
    ],
    fixed: [
      {
        title: "Joins on the canvas now start from the latest table unless you pick another one",
        description:
          "Hovering over a table used to move keyboard focus to it, even with the pointer hidden while you typed, so the next | could join from an older table. Hovering now only highlights. To join from an older table, click it or move to it with the keyboard.",
      },
      {
        title: "Ctrl+C on the canvas copies again instead of opening the comment editor",
        description: "The same goes for Ctrl+V, Ctrl+A and Ctrl+F.",
      },
      {
        title: "Switching tabs no longer shifts the layout",
        description:
          "Pane and panel sizes used to reset to their defaults and then jump to your saved sizes on every tab change.",
      },
      {
        title: "The error above the results is no longer cut off",
        description:
          "The whole message wraps over as many lines as it needs, up to six before it scrolls.",
      },
    ],
    security: [
      {
        title: "An agent can no longer change your data through MCP",
        description:
          "The old check only refused delete!, found by searching the text, and let update!, d! and u! through. The Pine server now refuses every write from the agent's tab, even when you press Run on it yourself. Your own tabs are unchanged.",
      },
      {
        title: "Agent queries need pine-lang 0.46.0 or later",
        description:
          "An older server would run the writes it was asked to refuse, so MCP refuses to run anything against it.",
      },
    ],
    removed: [
      {
        title: "The BEAMLYNX_MCP_ALLOW_DELETE environment variable",
        description: "It turned off the agent delete check for the whole machine.",
      },
    ],
  },
  {
    version: '0.62.0',
    date: '2026-09-20',
    added: [
      {
        title: 'A tab can now explain itself',
        description:
          'Start an expression with a comment -- either /* ... */ across lines, or a run of -- lines -- and the canvas shows it in its top-left corner instead of leaving it as grey text to scroll past. Write what you are looking for and why when you open a tab, and it is still there when you come back to it.',
      },
      {
        title: "Write a tab's comment from the canvas",
        description:
          'Press c (shown at the front of the bottom-left keybinding legend), click the comment button in the toolbar, or click an existing comment to edit it. A dim "Add a comment" marks the spot when there isn\'t one. What you type is spliced into the expression as a comment, the same way picking a table splices in an operation, so the canvas and the expression can never disagree. Emptying it removes the comment. Enter is a line break; Cmd/Ctrl+Enter or clicking away saves, Esc cancels.',
      },
      {
        title: 'MCP: an agent says what each query is for',
        description:
          'An agent now leads every query it runs with a comment saying what it is looking for and why, so the tab it opens shows its reasoning, not just its results.',
      },
      {
        title: 'Database Connections: more than one connection to the same host and port',
        description:
          'As long as they point at different databases. Previously the second one was rejected.',
      },
      {
        title: 'Add Connection form: fields and connection string stay in sync both ways',
        description:
          'Switching to the "Connection string" tab rebuilds the string from whatever\'s in the Fields tab, instead of only going string-to-fields.',
      },
    ],
    changed: [
      {
        title: 'Panels open and close with a short animation',
        description:
          'Settings, the Pine/SQL panel, Zen mode, the error band above the results, the agent\'s pinned tabs and every dialog all move now, so you can see where something came from. All of it follows your operating system\'s "reduce motion" setting -- turn that on and everything is instant again.',
      },
      {
        title: 'Results columns size to their own content instead of stretching to fill the pane',
        description:
          'A UUID column gets the room it needs and a short "status" column isn\'t stretched to match; scroll horizontally if a wide result doesn\'t fit, the same as any spreadsheet.',
      },
      {
        title: 'Table colors tint column headers only, not every value',
        description:
          'Coloring every cell read as noise -- and the canvas hover spotlight did it even with "Table colors" turned off, which made the preference look like it had no effect.',
      },
      {
        title:
          "Database Connections: switching a tab's connection warns instead of opening a new tab",
        description:
          "Switching the active tab's connection while it still has a query in it no longer silently opens a new tab. You get a warning that the query may reference tables or columns the new connection doesn't have, and the choice to switch anyway or cancel.",
      },
      {
        title: 'Database Connections: renaming has its own pencil icon',
        description: 'Previously renaming only worked by first expanding the row.',
      },
      {
        title: "MCP: an agent's queries show in their own pinned tab",
        description:
          "Pinned to the end of the tab strip and marked with a robot icon so it doesn't read as one of your own. It always shows the same query slot -- an agent's next query replaces whatever was there -- so closing it is always safe.",
      },
      {
        title: 'MCP: a reveal request gets its own "Needs approval" pinned tab',
        description:
          "When an agent asks to see something its access policy redacted, the request no longer opens as a new tab and steals focus. The tab names the connection, quotes the agent's reason, and offers Approve/Decline. Closing it without deciding declines, so an agent waiting on a decision never hangs.",
      },
      {
        title: 'MCP: an agent icon in the header covers everything the agent is doing',
        description:
          'Next to the bell: a dot when a result landed while you were looking elsewhere, a count when approvals are waiting. Clicking it goes to whichever needs you most -- an approval first, since an agent is blocked on it, otherwise the activity tab.',
      },
      {
        title: 'Settings opens faster the first time',
        description:
          'Its contents are built once while the app is idle and kept afterwards, which also preserves your scroll position and the section you were last on.',
      },
      {
        title: 'Dragging a pane divider no longer selects the text it passes over',
      },
    ],
    removed: [
      {
        title: 'The classic Graph mode is gone',
        description:
          'The non-interactive node diagram you got with "Canvas mode" off. Canvas is now the only graph editor, and the preference and its command-palette entry are gone with it.',
      },
      {
        title: 'Legacy Layout is gone',
        description:
          'The Canvas + Results two-pane layout is now the only one. The "Switch to legacy layout" header link, the "New layout" toggle and their command-palette entries are gone with it. Settings always opens as a docked panel now, never a floating window.',
      },
    ],
    fixed: [
      {
        title: 'Panels open and close smoothly, even with a full table of results on screen',
        description:
          'The results grid re-fits its columns whenever its container resizes, which is expensive, so a panel opening beside it used to redo that work on every frame. The grid now stands still while the panel moves -- a skeleton of your real column headers stands in for that moment -- and fits itself once, afterwards.',
      },
      {
        title: 'Upgraded the results grid library',
        description:
          '@mui/x-data-grid 7.15.0 -> 7.29.13, 14 minor releases of fixes, measured as a ~18% cut in the main-thread work it does when its container resizes.',
      },
      {
        title: 'Resizing a results column by hand no longer snaps back to its default width',
        description:
          "The grid was rebuilding its whole column list on every render -- including renders that had nothing to do with it, like hovering a table on the canvas -- and losing the width you'd just dragged.",
      },
      {
        title: 'Entering and leaving Zen mode no longer resets the canvas',
        description:
          'It used to rebuild the canvas from scratch each way, losing whatever you had panned or zoomed to.',
      },
      {
        title: 'A blank line inside a /* ... */ comment no longer breaks the expression',
        description:
          'Blank lines separate one expression block from the next, and that rule used to apply inside a comment too -- so a comment with a paragraph break was split down the middle and sent to the server as an unterminated comment followed by loose text.',
      },
      {
        title:
          'Header: the version badge no longer shows "obsolete" when you\'re simply not connected yet',
        description: "It stays hidden until there's a real version to show.",
      },
      {
        title:
          'Database Connections: typing a space while renaming a connection switched connections',
        description:
          "It did nothing to the text and silently switched your active connection instead. The row's own Enter/Space shortcut was intercepting keystrokes meant for the rename field inside it.",
      },
      {
        title:
          'Database Connections: the rename pencil and the MCP badge could misalign across rows',
        description:
          "The badge also shifted sideways the moment you clicked the pencil. The rename and expand icons now form a stable column regardless of a row's MCP state.",
      },
      {
        title: 'Icon-only buttons have accessible labels',
        description:
          'Close, download, save, notifications, tab controls and the JSON inspector now read correctly in a screen reader.',
      },
    ],
    breaking: [
      {
        title: 'Minimum required pine-lang server version raised to 0.45.0',
        description:
          'Canvas comments need it: an older server deletes a comment the moment you touch the canvas, since it strips comments when it reformats an expression. Multiple connections to one host and port need it too. Connecting to an older server now shows the upgrade-required screen instead of the app.',
      },
    ],
  },
  {
    version: '0.61.0',
    date: '2026-09-12',
    added: [
      {
        title: 'Database Connections: MySQL support',
        description:
          'A "Database type" picker (Postgres/MySQL) when adding a connection, with the port field defaulting to match (5432/3306). Pasting a connection string now also accepts mysql:// (in addition to postgresql:///postgres://) and sets the picker accordingly. The SQL panel (and the Pine/SQL input\'s SQL mode) correctly renders a MySQL connection\'s backtick-quoted SQL too.',
      },
    ],
    fixed: [
      {
        title: 'A failed query no longer leaves the loading spinner stuck on forever',
        description:
          'A query that failed at the network level (e.g. the server unreachable) left the loading spinner stuck on forever with no error shown, since the query-evaluation path had no try/catch around its network call -- a thrown exception skipped every one of its loading = false sites. It now always resets and shows the failure.',
      },
    ],
    breaking: [
      {
        title: 'Minimum required pine-lang server version raised to 0.44.0',
        description:
          'Needed for the MySQL connection support above. Connecting to an older server now shows the upgrade-required screen instead of the app.',
      },
    ],
  },
  {
    version: '0.60.0',
    date: '2026-09-10',
    added: [
      {
        title: 'MCP: request_reveal lets an agent ask you to reveal a redacted result',
        description:
          "When a connection's access policy is redacting something an agent legitimately needs, it can now call request_reveal to ask you to look at the real query. It opens in a normal tab where you can edit the expression, then reveal the real results to the agent or decline with a comment explaining why (so it can adjust and retry). Requires beamlynx-desktop's matching support.",
      },
      {
        title: 'Results grid: "Copy result as CSV" button',
        description:
          'Next to Export to CSV, copies the whole result to your clipboard as CSV, ready to paste into a spreadsheet. Also available as a "Copy Result" command in the command palette.',
      },
      {
        title: 'Canvas mode: quick "today" / "in the last" filters for date columns',
        description:
          'Adding a where filter on a column that looks like a date now offers these alongside the usual operator choices (=, !=, ...) -- picking either adds a pair of where: conditions instead of asking for a literal value.',
      },
      {
        title: 'Results grid: JSON cells open in an editable side panel',
        description:
          "Clicking a cell in a JSON column opens its formatted, syntax-highlighted value in a panel on the right, already in edit mode -- type your change and press Mod+Enter or the checkmark to save, or the undo icon to cancel back to the read-only view. JSON cells no longer edit inline in the grid row. Copying from the right-click menu also copies the pretty-printed form. The panel's own left edge can be dragged to resize it, its editor respects Vim mode when you have that on in Settings, and pressing Escape while editing no longer closes the panel (in Vim mode it exits to normal mode instead). Every code editor's scrollbar now matches the app's theme instead of the OS default.",
      },
    ],
    changed: [
      {
        title:
          'Database Connections: access policy no longer applies to your own queries by default',
        description:
          'The per-connection "apply access policy to my own queries" toggle is now off by default and opt-in, instead of on by default with an opt-out "bypass". An access policy protects the MCP agent only unless you explicitly turn this on to have it also redact your own queries on that connection.',
      },
      {
        title: 'Canvas mode: keyboard navigation spotlights columns too',
        description:
          "Moving between table nodes with the keyboard (arrow keys, j/k) now spotlights that table's columns in the Results grid, the same way hovering a node with the mouse already did.",
      },
    ],
    fixed: [
      {
        title: 'New Layout: opening the Pine/SQL panel now focuses it and reframes the graph',
        description:
          "Neither used to happen reliably -- the panel could open with the graph's own keyboard shortcuts silently disabled and nowhere for keystrokes to land instead, and the graph stayed wherever the old pan/zoom left it, partly cut off by the resized canvas.",
      },
      {
        title: 'Canvas mode: a `where` chip added via "Filter" can always be deleted or edited',
        description:
          "It used to land at the end of the query's pipe text regardless of which table it filtered, so canvas's position-based bookkeeping could attribute it to the wrong table -- deleting or editing it then silently did nothing, or acted on an unrelated chip that happened to share its position.",
      },
      {
        title: 'Canvas mode: reopening an `ilike` where chip no longer breaks the query',
        description:
          "The server reports operators in their SQL casing (ILIKE), and the editor was writing that casing straight back into the Pine text, which pine-lang's parser rejects since it only accepts lowercase operator keywords.",
      },
    ],
  },
  {
    version: '0.59.0',
    date: '2026-09-06',
    added: [
      {
        title: 'Canvas mode: hovering a table spotlights its columns in the Results grid',
        description:
          'Makes it easy to see which columns come from which joined table without needing to turn on the "Table colors" preference.',
      },
      {
        title: 'Canvas mode: click an existing order chip to change its direction',
        description:
          'Opens an Asc/Desc popover instead of reopening the column-add list. Arrow keys or the a/d mnemonics flip it; a "remove" action deletes the chip.',
      },
    ],
    fixed: [
      {
        title: 'Results grid "Filter" now scopes to the right table',
        description:
          'Right-clicking a cell and choosing "Filter" generated an unqualified where: that silently filtered whichever table the query\'s pipe ended on. It now scopes to the table that cell\'s column actually belongs to (alias.column).',
      },
    ],
  },
  {
    version: '0.58.0',
    date: '2026-09-06',
    breaking: [
      {
        title: 'Requires pine-lang 0.43.0 or later',
        description:
          'Was 0.42.0 -- the version that introduces `? table`, which canvas mode\'s new "path" action and the Pine editor\'s autocomplete both depend on.',
      },
    ],
    added: [
      {
        title: 'Canvas mode: "path" action finds multi-hop join routes',
        description:
          'The node action bar is now select | where | join | +, with order, group, and the new "path" action tucked behind the +. Path finds every way to reach a table that isn\'t directly joinable -- not just the next hop, but multi-hop routes through the schema too -- and lets you pick one to add all the way to the destination in one go.',
      },
      {
        title: 'Pine editor autocomplete completes `? table` path searches',
        description:
          'Shows the discovered routes once the target names a real table, and accepting one replaces the whole `? target` fragment, not just the typed table name.',
      },
      {
        title: 'Canvas mode: click a join icon to pick Inner, Left, or Right',
        description:
          'The same two-circle diagram most SQL join references use -- inner shades just the overlap, left/right shades one whole side plus the overlap -- so the type reads at a glance with no text label needed.',
      },
      {
        title: 'Canvas mode: click an existing chip to edit it',
        description:
          'A where condition, selected column, order column, or group column reopens for editing instead of being removed and re-added.',
      },
      {
        title: 'Canvas mode: Shift+J / Shift+K step through the whole pipeline',
        description:
          "Each node, then everything configured on it (its incoming join, selected columns, where conditions, order columns, group columns), then the next node's. Enter or Space opens whichever is highlighted; Delete, Backspace, or x removes it.",
      },
    ],
    changed: [
      {
        title: "A resolved join's line is now neutral, not accented",
        description:
          'The accent now lives on the join-type icon itself, marking the one clickable thing on the edge rather than the whole line. Broken and heuristic-only joins keep their own distinct colors, unchanged.',
      },
    ],
    fixed: [
      {
        title: 'A stray trailing pipe no longer survives a canvas commit',
        description:
          'Adding an operation while the expression already ended in a stray `|` (typed by hand, or left over from an earlier edit) left that dangling pipe in place afterward instead of dropping it.',
      },
      {
        title: 'Hovering a canvas node now moves keyboard focus there too',
        description:
          'Previously only revealed its action bar -- the "current" border stayed on whichever node the keyboard had last focused. Hovering a specific chip or a join icon now shows its own highlight, matching keyboard navigation exactly.',
      },
      {
        title: 'Clicking a canvas action button now reliably focuses that node',
        description:
          'If the mouse was already resting on the button from an earlier action (no fresh hover to trigger a focus change), the click opened its picker but left the previously focused node highlighted.',
      },
      {
        title: '"None" access policy no longer treated as inactive',
        description:
          'A connection set to "None" (unrestricted access) was still blocked from turning on MCP and had "None" disabled outright once MCP was on. "None" is a deliberate choice, not a missing one, matching how the desktop app already enforces it.',
      },
    ],
  },
  {
    version: '0.57.0',
    date: '2026-09-02',
    added: [
      {
        title: 'Drag to reorder tabs',
        description:
          'Works in both the horizontal strip and the vertical rail. Dragging to either end of a long rail scrolls it. The new order also drives Ctrl+Tab cycling and survives a reload.',
      },
      {
        title: 'Vertical tab rail (Settings -> Appearance -> Tabs)',
        description:
          'Show the session tabs as a rail down the left side instead of the horizontal strip across the top, with a new-tab button at the top. Applies to both layouts, and is also available as a "Toggle Tab Orientation" command.',
      },
    ],
    changed: [
      {
        title: 'Tab close buttons now appear on hover',
        description:
          'Instead of on every tab at once. Hovering a tab also tints it and brightens its label.',
      },
    ],
    fixed: [
      {
        title: '"Only apply to MCP server" (desktop) kept flipping back off',
        description:
          'It was saved correctly to disk, but reloading the connections list -- which happens after almost any connection action -- rebuilt the in-memory list without this field, so the toggle (and the behavior behind it) reverted to off until the next app restart.',
      },
    ],
  },
  {
    version: '0.56.0',
    date: '2026-09-02',
    breaking: [
      {
        title: 'Requires pine-lang 0.42.0 or later',
        description: 'Was 0.41.0 -- lets MCP-run queries show up prettified below.',
      },
    ],
    added: [
      {
        title: 'New "Toggle Layout Orientation" command',
        description:
          'Command palette: switch New Layout between side-by-side and top/bottom without using the canvas toolbar icon.',
      },
    ],
    changed: [
      {
        title: 'Database Connections list redesign (desktop)',
        description:
          'A connection\'s rename field, access policy, MCP access toggle, "only apply to MCP server" toggle, refresh, and delete are now behind an expand arrow instead of five icons crammed onto one row. The expanded panel orders them the way you\'d actually use them -- pick a policy, then turn MCP on.',
      },
    ],
    fixed: [
      {
        title: 'Pine/SQL panel divider (New Layout, top/bottom view)',
        description: 'Dragging it no longer moves the panel in the opposite direction.',
      },
      {
        title: 'MCP-run queries now show up prettified',
        description:
          'The Pine panel now shows the agent-run expression nicely formatted instead of the raw, unformatted text it sent.',
      },
      {
        title: "Canvas's where picker",
        description:
          'A long column name no longer gets hard-clipped mid-character (truncates with an ellipsis, full name on hover); the operator and value fields now have visible spacing between them; opening the picker focuses the operator dropdown first instead of the value field.',
      },
    ],
  },
  {
    version: '0.55.0',
    date: '2026-08-31',
    breaking: [
      {
        title: 'Requires pine-lang 0.41.0 or later',
        description: "Was 0.39.0 -- needed by the access policy feature's new access-policy param.",
      },
    ],
    added: [
      {
        title: 'Named access policies (Settings -> Access Policy)',
        description:
          'Create, rename, and delete named policies, each a toggleable set of rules deciding which columns show real values instead of xxxxx (Postgres types, foreign keys, _id-suffixed columns).',
      },
      {
        title: 'Pick which policy applies to each connection',
        description:
          "MCP can only be turned on once a connection's policy is active, and the policy can't be cleared or swapped for an inactive one while MCP is on.",
      },
      {
        title: '"Only apply to MCP server" toggle',
        description:
          'See real data on your own queries against a connection without changing what the agent sees. Off by default.',
      },
    ],
    changed: [
      {
        title: '"Vim keybindings" no longer gates the canvas',
        description:
          "Reverts 0.54.0's change -- only j/k and the query editor's vim mode are gated by it.",
      },
      {
        title: '"Vim keybindings" is now app-wide',
        description: 'Was per-tab; every open tab now reflects the same value immediately.',
      },
    ],
    fixed: [
      {
        title: 'MCP queries could run against a stale access policy',
        description: 'They now always re-read the current policy before running.',
      },
      {
        title: 'Occasional "X is not a function" during dev',
        description:
          'A duplicate MCP query listener left behind by Fast Refresh could answer a query with stale code.',
      },
      {
        title: 'Canvas shortcuts got stuck after using the picker with Settings open',
      },
      {
        title: "A canvas checkpoint's aggregate name could reappear after being removed",
        description: 'The first click after (re)naming a checkpoint could also show stale results.',
      },
      {
        title: 'Tab order and focus fixes in the docked Settings panel',
        description:
          'Connections are now reachable by Tab; Settings no longer loses its shortcuts to the canvas, or its rail to arrow keys/j/k, at the wrong moment.',
      },
    ],
  },
  {
    version: '0.54.0',
    date: '2026-08-30',
    added: [
      {
        title: 'The join picker shows the disambiguating column when needed',
        description:
          "When two join candidates in the same group would otherwise name the same table (reached via two different foreign keys), the picker now shows Pine's own disambiguation syntax (e.g. `.created_by`) next to each one. A table with only one candidate path still renders with no extra text.",
      },
    ],
    changed: [
      {
        title: '"Vim keybindings" now also covers the canvas',
        description:
          "Previously only the query editor. The canvas's j/k-as-letters and single-letter shortcuts (s/w/o/g/x/u/U/i) now fire only when this preference is on, matching the editor. Arrow-key navigation and Ctrl/Cmd+Z/Ctrl+Y undo/redo are unaffected -- they aren't vim-specific.",
      },
    ],
    fixed: [
      {
        title: 'Canvas shortcuts fired while Settings or the Pine/SQL panel had focus',
        description:
          "j/k and the other single-letter canvas shortcuts (New Layout) no longer fire once the docked Settings panel is open, or while typing in the Pine/SQL panel -- keyboard input now routes to whichever panel actually has focus, falling back to the canvas when nothing else does. Opening Settings (however it's triggered) hands it focus immediately, rather than only once something inside it is clicked. Settings' rail (Database Connections/Appearance/Preferences/MCP/About) also gained its own j/k/Arrow Up/Down navigation.",
      },
    ],
  },
  {
    version: '0.53.0',
    date: '2026-08-28',
    added: [
      {
        title: 'Zen mode',
        description:
          "A graph-only, distraction-free view (New Layout) that hides the header, tab strip, and Results, and turns auto-run off for as long as it's on (restored to whatever it was set to once you exit). Command palette only for now, no dedicated key.",
      },
      {
        title: 'Settings keyboard shortcut',
        description: 'Ctrl/Cmd+Shift+, toggles Settings open and closed, matching the gear icon.',
      },
      {
        title: 'A "Reconnect" action for a dead database connection',
        description:
          "Shown next to the connection label in the header whenever a tab's assigned database connection isn't live (e.g. the database wasn't running yet when the app started). Previously the only way to retry was switching tabs or reloading the whole app.",
      },
    ],
    changed: [
      {
        title: 'Ctrl/Cmd+, now toggles Settings',
        description:
          "Matching Slack's and most native Mac apps' Preferences convention, instead of the SQL panel. Ctrl/Cmd+. still toggles the Pine panel; Ctrl/Cmd+Shift+. now toggles the SQL panel.",
      },
      {
        title: 'Settings in New Layout is now a docked panel on the left',
        description:
          'Spans the full height (tab strip included) and stays open across tab switches, instead of living inside whichever tab was active when it was opened. No longer closes on Escape.',
      },
    ],
    fixed: [
      {
        title: "Canvas text didn't scale with the Text Size setting",
        description:
          'Node labels, chips, and toolbars now scale with Text Size (previously only the rest of the app did) and are larger at every size to begin with. The keybinding legend at the bottom-left of the canvas is now bigger and shows each shortcut key in bold accent color.',
      },
      {
        title: 'Settings floated on top of the canvas',
        description:
          "It no longer opens as a floating modal on top of the canvas in New Layout, so it never covers the canvas or results while you tune a change against them. Changing Text Size while the Appearance panel is open no longer reflows the panel itself. Its border and edges now match Canvas's own pane.",
      },
    ],
  },
  {
    version: '0.52.0',
    date: '2026-08-25',
    added: [
      {
        title: 'Appearance settings',
        description:
          'Three built-in themes (Light, Dark, Sepia), each with its own coordinated colors rather than a shared palette with a swappable accent. Picking one also determines light/dark behavior for the editor and canvas.',
      },
      {
        title: 'Separate Interface and Code fonts',
        description:
          "Interface font (System, Inter, IBM Plex Sans) and Code font (IBM Plex Mono, JetBrains Mono, Fira Code, System Monospace) are now independent choices, replacing one shared monospace-only font setting. Fira Code's ligatures now actually render.",
      },
      {
        title: 'Text size',
        description:
          "Small/Medium/Large - scales the app's text and spacing without resizing panels or the canvas.",
      },
    ],
    changed: [
      {
        title: '"Toggle Theme" cycles through all three themes',
        description: 'Previously switched between two.',
      },
      {
        title: 'Canvas keyboard navigation between tables now wraps around',
        description:
          'Arrow keys (or j/k) now wrap from the last table back to the first instead of stopping there.',
      },
    ],
    fixed: [
      {
        title: 'Trackpad two-finger scroll now pans instead of zooms',
        description:
          "In both the classic graph and canvas mode, matching the Miro/Figma convention. The classic graph's mouse controls also now match canvas mode's: right-click drags the canvas, left-click drags a node or rubber-band-selects.",
      },
    ],
  },
  {
    version: '0.51.2',
    date: '2026-08-23',
    changed: [
      {
        title: 'Consistent spacing around Canvas/Results',
        description:
          'One consistent 8px gap on all sides and between the two panes, instead of a slightly different, unexplained width for the pane divider (10px) versus the surrounding margins (8px), and no gap at all at the bottom.',
      },
    ],
    fixed: [
      {
        title: 'Desktop update notification said "restart" twice',
        description:
          'The message and the button both said it, and the "Restart Now" button had no visible border or fill, reading as plain text rather than something to click.',
      },
    ],
  },
  {
    version: '0.51.1',
    date: '2026-08-23',
    changed: [
      {
        title: 'Connection color moved to Settings',
        description:
          'Set from Settings > Database Connections (click its status dot), alongside renaming and MCP access, instead of from the top-left connection picker -- that dot is now just a status indicator.',
      },
      {
        title: 'Updates modal shows a title for each change',
        description:
          'A short title first, with its fuller explanation (when there is one) underneath -- easier to skim than a flat bullet list.',
      },
      {
        title: 'New keybindings for the Pine/SQL panel',
        description: 'Ctrl/Cmd+. for Pine and Ctrl/Cmd+, for SQL, replacing Ctrl/Cmd+Shift+E/S.',
      },
      {
        title: 'Canvas filters compose as separate where: steps',
        description:
          'Each filter is now its own where: step instead of joining a comma-separated list on one shared where: clause. Multiple filters on the same table still combine with AND, same as before.',
      },
    ],
    fixed: [
      {
        title: 'Table colors disappearing when the SQL panel opened',
        description:
          "Even though the results on screen hadn't gone stale -- opening the panel compared the newly-shown SQL text against the last-run Pine expression and always found a mismatch.",
      },
      {
        title: 'Auto-run not firing while the SQL panel was open',
        description:
          "A canvas gesture's own auto-run was gated on the Pine panel specifically being shown, rather than on canvas mode being active.",
      },
    ],
  },
  {
    version: '0.51.0',
    date: '2026-08-23',
    added: [
      {
        title: 'Canvas-first two-pane layout',
        description:
          'Canvas and Results, side by side or stacked, on by default for new sessions. Switch back to the classic sidebar layout any time from the header, Settings, or the command palette.',
      },
      {
        title: 'Auto-run in canvas mode',
        description:
          "The query now runs automatically after each canvas edit instead of waiting for Run. Toggle it off from Settings or the command palette if you'd rather run explicitly.",
      },
      {
        title: 'Pine/SQL text panel in the new layout',
        description:
          'An optional panel next to the canvas for hand-editing alongside point-and-click use (Ctrl+Shift+E for Pine, Ctrl+Shift+S for SQL).',
      },
      {
        title: "Pipe '|' as a second join shortcut",
        description:
          'Now also opens the join picker in canvas mode, alongside i -- a join is "pipe a new table onto this one".',
      },
      {
        title: 'Comma behaves like Enter in pickers',
        description:
          "In canvas mode's select/order/group/join pickers, a comma-separated list of columns no longer needs a keypress between each one.",
      },
      {
        title: 'Standard undo/redo shortcuts in canvas mode',
        description:
          'Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y now undo/redo in canvas mode too, alongside u/Shift+U.',
      },
      {
        title: 'Remove any table from the canvas',
        description:
          "Not just the last one added. If another table's join was relying on the removed one implicitly, it now resolves against whatever's left instead -- if that connection isn't real, it shows the existing dashed/warning-colored styling used for any other join the server can't resolve cleanly.",
      },
      {
        title: 'Resizable Pine/SQL panel',
        description:
          'Drag the divider between it and the canvas, instead of living with a fixed size.',
      },
      {
        title: 'Browser-style tab switching',
        description:
          "Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab move between tabs, matching a browser's own tab switching (Ctrl+PageDown/PageUp also work). Desktop app only -- a real browser already owns these for its own tabs.",
      },
      {
        title: 'PINE/SQL toggle in the canvas toolbar',
        description:
          "Opens the same panel Ctrl/Cmd+Shift+E/S already did, so it's reachable without a keyboard shortcut.",
      },
    ],
    removed: [
      {
        title: 'Compact mode preference',
        description:
          'It only ever affected the classic sidebar layout, and no longer had any effect once the new Canvas-first layout became the default -- the new layout already switches to a stacked arrangement on small screens on its own.',
      },
    ],
    fixed: [
      {
        title: 'Canvas keyboard shortcuts freezing after a query ran',
        description:
          's/w/o/g/i/x/u stopped responding after any query ran, and stayed unresponsive until the page was reloaded.',
      },
      {
        title: 'Sidebar height overflowing its panel',
        description:
          'A height saved from an earlier resize could stretch the graph/results panel taller than the window, showing an unwanted scrollbar.',
      },
      {
        title: 'Wrong letter hint on the join action',
        description: 'It highlighted j, not i -- i is the actual shortcut for it.',
      },
      {
        title: 'Checkpoint node missing active-shortcut hints',
        description:
          "Its action bar didn't show which letter shortcuts were active while it had keyboard focus, unlike a table node's.",
      },
      {
        title: 'Pine/SQL panel silently blocking canvas keybindings',
        description:
          'Opening it auto-focused its text editor, silently blocking every canvas keybinding until you clicked away from it once.',
      },
      {
        title: 'Auto-run delay cut from 500ms to 150ms',
        description:
          'The fixed wait after every canvas edit made it feel far slower than the query itself (typically a few milliseconds) -- 150ms is still enough to collapse a burst of rapid picks into one run.',
      },
      {
        title: 'Canvas crash on an inconclusive speculative build',
        description:
          'A gesture whose speculative build came back without a usable result (rather than failing outright) could crash the whole app instead of falling back gracefully.',
      },
      {
        title: 'Broken join rendered as if it were fine',
        description:
          'A join that no longer had a real column to connect on (for example, after deleting the table in between two others) rendered as a plain, confident-looking solid line instead of the dashed warning styling used for any other unresolved join -- and the table on the other end showed no columns at all. Both are now treated the same as any other unresolved join.',
      },
      {
        title: 'Canvas edits doing nothing while the SQL panel was open',
        description:
          'The graph and the SQL text both stayed frozen on whatever they showed before the edit. A session that reloaded with the SQL panel already open got stuck showing "Connecting…" forever for the same reason.',
      },
    ],
    changed: [
      {
        title: 'Canvas/graph mode switch moved into the graph panel',
        description:
          'It only ever applied there anyway; the header now only refers to which overall layout is active.',
      },
    ],
  },
  {
    version: '0.50.0',
    date: '2026-08-22',
    breaking: [
      {
        title: 'Requires pine-lang 0.39.0 or later',
        description:
          'The new connection refresh icon (below) needs its POST /api/v1/connections/:id/reindex endpoint.',
      },
    ],
    added: [
      {
        title: 'Refresh icon for live connections',
        description:
          'In Settings > Database Connections. Use it to pick up tables or columns added to the database after the connection was first opened, instead of restarting the server.',
      },
      {
        title: 'Connection rename',
        description:
          "An optional name field when adding it, and a pencil icon on its row in Settings > Database Connections afterward. Desktop app only, since that's the only place a connection's name is actually saved anywhere.",
      },
      {
        title: 'Keyboard control for canvas mode',
        description:
          "Move between nodes with the arrow keys or j/k, and use a single-letter shortcut for the highlighted node's operations: s select, w where, o order, g group, i join (or add the first table, from the start node), x delete, u/Shift+U undo/redo. The highlighted node is shown the same way as the query's current node, and its operations stay visible without needing to hover it. A checkpoint (a group:/limit: step) can now be navigated to and deleted the same way.",
      },
    ],
    fixed: [
      {
        title: 'Delete icon shifting position in the connections list',
        description:
          "It used to sit in a different column depending on whether that row also showed the refresh icon (only shown for a live connection), so rows didn't line up. It now sits in the same place on every row.",
      },
      {
        title: 'Desktop graph stuck on "Connecting…"',
        description:
          'It could get stuck showing that forever even once the connection was live. The very first query build for a tab, sent before its connection actually had a live pool yet, failed silently and nothing ever retried it once the connection came up. The connection reconnect step now asks for a fresh build once it succeeds.',
      },
      {
        title: 'MCP switch read as a general connection toggle',
        description:
          "Replaced with a small robot icon, lit when MCP access is on -- consistent with the row's other icon actions, and specific about what it actually controls.",
      },
    ],
    changed: [
      {
        title: '"Server version" label corrected in About',
        description:
          "It was always the connected pine-lang server's version, not this app's own. It also now shows the UI's own version, and, in the desktop app, the installed app's own version.",
      },
    ],
  },
  {
    version: '0.49.0',
    date: '2026-08-16',
    added: [
      {
        title: 'Settings page',
        description:
          'Opened from the gear icon next to the notification bell. It brings database connections, app preferences, and MCP setup into one place instead of scattered menus.',
      },
      {
        title: 'MCP support for the desktop app',
        description:
          'An AI agent like Claude Code can run queries directly against your saved connections. Turn it on per connection from Settings.',
      },
      {
        title: 'Database type field when adding a connection',
        description: 'Picking a type fills in its default port automatically.',
      },
      {
        title: '"Open Settings" and "New Database Connection" commands',
      },
    ],
    changed: [
      {
        title: '"Connections" renamed to "Database Connections"',
        description:
          'Now called that everywhere in the app, to leave room for a future connection to the Pine server itself.',
      },
      {
        title: 'Tabs for adding a connection',
        description:
          'Switch between typing in the fields and pasting a connection string, instead of an expandable section.',
      },
      {
        title: 'Onboarding screens removed',
        description:
          'The old Docker "Welcome" page and "Pine server is not running" page are gone. The app now goes straight to its normal view.',
      },
    ],
  },
  {
    version: '0.48.0',
    date: '2026-08-13',
    breaking: [
      {
        title: 'Requires pine-lang 0.38.1 or later',
      },
    ],
    added: [
      {
        title: 'Experimental interactive (graph) view',
        description:
          'Build Pine queries by clicking through tables in a graph instead of writing text -- toggle it from the header, next to the version number.',
      },
    ],
    changed: [
      {
        title: 'Unified visual design across the app',
        description: 'The "schematic/blueprint" look now spans everywhere, not just parts of it.',
      },
    ],
  },
  {
    version: '0.47.0',
    date: '2026-08-09',
    changed: [
      {
        title: 'Lazy per-tab connections',
        description:
          "Each tab now connects to its own database only when it becomes the active tab, instead of every tab eagerly following whatever connection was picked most recently. Opening the app no longer forces the connections picker open -- it silently reconnects the tab you were on. A tab whose connection isn't live yet shows a hollow (outline-only) dot in its own connection's color, filling in solid once connected.",
      },
    ],
    fixed: [
      {
        title: 'Graph click mistaken for a Tab keypress',
        description:
          'Clicking a graph node (e.g. expanding a variable/checkpoint container) stole focus into the Pine input and jumped the candidate-relation highlight to the first suggestion.',
      },
      {
        title: "Startup picker could change other tabs' connections",
        description:
          "Picking a connection from the auto-opened startup picker could open an unrelated new tab and silently change which connection *other*, already-open tabs appeared to be using -- both tabs and the toolbar were falling back to display whatever connection was last selected globally instead of each tab's own assigned connection.",
      },
      {
        title: '(Desktop) Restored tab with no saved-profile id',
        description:
          'It had nothing to reconnect from, so it silently never auto-connected -- it now falls back to resolving one from its connection id.',
      },
      {
        title: '(Desktop) Stale "active connection" checkmark',
        description:
          "The connections picker's checkmark could point at a stale profile after switching tabs silently reconnected a different one in the background -- it's now derived directly from the active tab's own connection, so it can't drift.",
      },
      {
        title: 'Connections wiped to "not connected" on every launch',
        description:
          "Every tab's assigned connection was silently cleared before pine-server (a fresh process each launch) had any chance to reconnect it -- restarting the app looked like every saved connection had been forgotten. A tab's assigned connection is no longer cleared just because it isn't live *yet*; liveness is now tracked separately (see lazy per-tab reconnect above).",
      },
      {
        title: 'Silent reconnect failures',
        description:
          'Failing to reconnect a saved profile (deleted/renamed on disk, or its DB unreachable) via the connections picker only logged to the console -- now shows the same connection-error banner as every other connection failure.',
      },
      {
        title: '(Desktop) Connection dot always shown as live',
        description:
          "The connections list/picker always showed a solid dot for every saved connection regardless of whether it actually had a live pool -- it was comparing pine's own connection id against the saved-profile id, two different id spaces that never matched. Not-yet-connected entries now correctly show as a hollow (outline-only) dot, matching the toolbar and tab indicators.",
      },
      {
        title: '(Desktop) Connection briefly showing its raw id',
        description:
          "On launch, a tab's connection briefly displayed as its raw `host:port` id instead of its saved name, before flashing to the real name once the saved-profile list finished loading -- looked like the connection had been renamed. Shows a neutral placeholder during that gap instead.",
      },
    ],
  },
  {
    version: '0.46.2',
    date: '2026-08-04',
    breaking: [
      {
        title: 'Requires pine-lang 0.37.2 or later',
      },
    ],
    fixed: [
      {
        title: 'Silent connection failures',
        description:
          'The toolbar just stopped showing a "connecting" spinner with no indication anything went wrong. A new error toast now surfaces the actual failure.',
      },
      {
        title: 'Restored connection wrongly shown as connected',
        description:
          "A previously-used connection restored from a past session could show as \"connected\" in the toolbar even when nothing was actually connected this session (pine-server's connection pools don't survive a process restart). Restored connections are now checked against the backend's live state before being trusted.",
      },
      {
        title: 'Disconnected state was a dead end',
        description:
          'When disconnected, the app now automatically opens the connections picker (or the add-connection form, if none exist yet) instead of leaving a dead "Not connected to database" label with no obvious next step.',
      },
    ],
  },
  {
    version: '0.46.1',
    date: '2026-08-03',
    fixed: [
      {
        title: "Playground's shared connection was deletable",
        description:
          'Deleting it from the connection picker broke the playground for everyone else using it; the delete action is now hidden (and refused as a backstop) in playground mode.',
      },
      {
        title: 'Changelog showing "-1 days ago"',
        description: 'A same-day entry showed that label when the local timezone is behind UTC.',
      },
    ],
  },
  {
    version: '0.46.0',
    date: '2026-08-03',
    added: [
      {
        title: 'Tabs restored on reload',
        description:
          'Pine/SQL text, input mode, and connection are now restored on reload instead of always starting from a single blank session.',
      },
      {
        title: 'Ctrl/Cmd+S saves the tab',
        description: "Downloads the active tab's Pine expression as a `.pine` file.",
      },
      {
        title: 'New command palette entries for connections',
        description: '"List Database Connections" and "New Database Connection".',
      },
    ],
    fixed: [
      {
        title: 'Tab key hijacked by the graph',
        description:
          "Pressing Tab while the graph had focus fell through to React Flow's own node/edge navigation instead of cycling through Pine completion candidates.",
      },
    ],
  },
  {
    version: '0.45.2',
    date: '2026-08-02',
    fixed: [
      {
        title: 'Notification bell showing the wrong color',
        description: 'It showed blue for unread updates instead of the intended warm accent.',
      },
    ],
  },
  {
    version: '0.45.1',
    date: '2026-08-02',
    fixed: [
      {
        title: '(Desktop) Saved connections missing color and name',
        description: "They weren't showing their color or proper name in the connection picker.",
      },
      {
        title: 'Connection dialog popping up unnecessarily',
        description:
          "It no longer pops up automatically when you already have saved or active connections to pick from -- it only does that when there's genuinely nothing to connect to yet.",
      },
    ],
    changed: [
      {
        title: 'Notification bell no longer shakes',
        description: "It still changes color when there's something new, just more subtly.",
      },
    ],
  },
  {
    version: '0.45.0',
    date: '2026-08-02',
    added: [
      {
        title: 'Desktop app, no Docker required',
      },
      {
        title: 'New desktop keyboard shortcuts',
        description:
          '`Ctrl/Cmd+K` for the Command Palette, `Ctrl/Cmd+T` for a new tab, `Ctrl/Cmd+W` to close a tab.',
      },
      {
        title: 'Update progress shown in-app',
      },
      {
        title: 'Saved connections remembered between sessions',
        description:
          "In the desktop app, encrypted using your device's own secure storage. The hosted/browser version is unchanged -- it still never stores credentials.",
      },
    ],
    changed: [
      {
        title: 'Server version label hidden in the desktop app',
        description: 'It has its own separate release notes.',
      },
    ],
  },
  {
    version: '0.44.0',
    date: '2026-07-31',
    added: [
      {
        title: 'Pine variables for multi-expression queries',
        description:
          'Write multi-expression queries and name/reuse an intermediate result with `|= name` in a new multi-expression editor. Variables and checkpoint (`group:`/`limit:`) results render in the graph as collapsible container nodes, with the same FK-relation handles and join-type-aware (solid/dashed) edges as regular tables.',
      },
      {
        title: 'Paste a Postgres connection string to connect',
        description:
          'The database connection dialog accepts a Postgres connection string (`postgresql://user:password@host:5432/database`) and parses it to fill in the host/port/user/password/database fields; manual entry stays the default, with pasting a string as a secondary, collapsible option. The connection string field is masked like a password so password managers can autofill it.',
      },
      {
        title: 'Remove a saved connection',
        description:
          "Click its trash icon to arm, click again to confirm -- backed by pine-lang's new DELETE endpoint.",
      },
    ],
    fixed: [
      {
        title: 'Typing lag in the Pine input',
        description:
          'Worsened with more expression blocks/variables, caused by unnecessary CodeMirror rebuilds on every keystroke.',
      },
      {
        title: 'Autocomplete flashed "Nothing found" while loading',
        description: 'It now shows a "Loading..." state instead.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.37.0 or later',
      },
    ],
  },
  {
    version: '0.43.0',
    date: '2026-05-21',
    added: [
      {
        title: 'Per-tab connection picker',
        description:
          'Click the connection dot to switch which database that tab queries (by @Koziar).',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.36.0 or later',
      },
    ],
  },
  {
    version: '0.42.0',
    date: '2026-05-05',
    added: [
      {
        title: 'Per-session database connections',
        description:
          'Each tab can connect to a different database; queries from that tab always use its own connection.',
      },
      {
        title: 'Connection color indicators',
        description:
          'Each database gets a distinct color shown in the header and tab bar. Click the dot to pick a different color -- colors are saved across sessions.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.35.0 or later',
      },
    ],
  },
  {
    version: '0.41.0',
    date: '2026-05-04',
    added: [
      {
        title: 'Copy Pine expression or SQL from the command palette',
      },
      {
        title: 'Copied SQL includes the Pine expression as comments',
        description:
          'Copying SQL, from the command palette or a SQL panel click, prepends each line of the Pine expression as `--` line comments above it.',
      },
    ],
  },
  {
    version: '0.40.0',
    date: '2026-04-20',
    added: [
      {
        title: 'Column hints for `update!`',
        description: 'Typing `u!` or `u! col = val,` suggests remaining assignable columns.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.33.0 or later',
      },
    ],
  },
  {
    version: '0.39.1',
    date: '2026-03-30',
    added: [
      {
        title: 'Multi-table `update!` support',
        description: 'Assignments targeting different tables now run as separate UPDATE queries.',
      },
    ],
    fixed: [
      {
        title: 'Recursive delete followed non-FK heuristic relations',
        description:
          'It no longer does -- only tables with a real foreign key constraint are included in the generated DELETE statements.',
      },
      {
        title: '`update!` ignored table aliases on qualified columns',
        description:
          'It now correctly uses the table alias when a column is qualified (e.g. `c.name`).',
      },
    ],
  },
  {
    version: '0.39.0',
    date: '2026-02-18',
    fixed: [
      {
        title: 'Sticky column headers in results',
        description:
          'The table header now stays visible when scrolling through results (by @Koziar).',
      },
    ],
  },
  {
    version: '0.38.0',
    date: '2026-02-16',
    added: [
      {
        title: 'Table color decoration',
        description:
          'Expression segments and result columns are color-coded by table, to help visualize the relationship between them (collaboration with @Koziar).',
      },
    ],
    changed: [
      {
        title: 'Expression highlighting broke on `|` in string values',
        description:
          'Fixed by using the server-side prettified expression and ranges from the build endpoint instead of parsing the expression client-side.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.31.0 or later',
      },
    ],
  },
  {
    version: '0.37.1',
    date: '2026-02-08',
    fixed: [
      {
        title: 'Bell animation shifted page scrollbars',
        description: 'Fixed by preventing layout shifts during the animation.',
      },
    ],
  },
  {
    version: '0.37.0',
    date: '2026-02-08',
    added: [
      {
        title: 'Resizable sidebar',
        description: "Drag the divider to adjust the sidebar's width (by @Koziar).",
      },
    ],
    changed: [
      {
        title: 'Better candidate node contrast in dark theme (by @Koziar)',
      },
    ],
  },
  {
    version: '0.36.0',
    date: '2026-01-09',
    added: [
      {
        title: 'Command palette',
        description: "Find and run commands, similar to VS Code's command palette.",
      },
    ],
  },
  {
    version: '0.35.1',
    date: '2025-12-26',
    added: [
      {
        title: 'Hints at the cursor position',
      },
      {
        title: 'Notification bell animates for unread updates',
      },
    ],
    changed: [
      {
        title: 'Pine operations no longer suggested',
        description: "They're excluded from suggestions, e.g. when pressing `Tab`.",
      },
    ],
    fixed: [
      {
        title: 'Cycling suggestions skipped the candidate node',
        description: 'Happened only when multiple nodes shared the same table name.',
      },
    ],
  },
  {
    version: '0.34.0',
    date: '2025-12-08',
    added: [
      {
        title: 'Bar chart rendering',
        description: 'Available when results have exactly two columns: one string, one number.',
      },
    ],
  },
  {
    version: '0.33.0',
    date: '2025-10-21',
    added: [
      {
        title: 'In-app changelog',
      },
    ],
  },
  {
    version: '0.32.0',
    date: '2025-10-19',
    added: [
      {
        title: 'Line and block comments in Pine',
        example: '-- This is a line comment\n/* This is a\n   multi-line\n   block comment */',
      },
    ],
    fixed: [
      {
        title: 'Graph shown despite an expression error',
      },
    ],
    changed: [
      {
        title: 'Pine/SQL toggle button',
      },
    ],
  },
  {
    version: '0.31.5',
    date: '2025-09-16',
    changed: [
      {
        title: 'Intro page examples updated for the playground',
      },
      {
        title: 'Share a query via URL',
        description:
          'The `?data=<encoded-object>` parameter takes a JSON-encoded object containing the expression.',
      },
    ],
  },
  {
    version: '0.31.2',
    date: '2025-09-11',
    changed: [
      {
        title: 'Common toggle button for Pine/SQL',
      },
    ],
  },
  {
    version: '0.31.1',
    date: '2025-09-11',
    changed: [
      {
        title: 'Update preview hidden by default',
        description: 'It shows when the inspect icon is clicked.',
      },
    ],
  },
  {
    version: '0.31.0',
    date: '2025-09-10',
    added: [
      {
        title: 'Confirmation modal before updating a record',
      },
    ],
    changed: [
      {
        title: 'Success messages removed',
      },
    ],
  },
  {
    version: '0.30.1',
    date: '2025-09-07',
    added: [
      {
        title: 'SQL mode support',
      },
    ],
  },
  {
    version: '0.29.1',
    date: '2025-08-30',
    security: [
      {
        title: "Updated values weren't being escaped",
      },
    ],
  },
  {
    version: '0.29.0',
    date: '2025-08-28',
    added: [
      {
        title: 'Forced server upgrade prompt when needed',
      },
    ],
    fixed: [
      {
        title: 'Error message missing on failed update',
      },
    ],
  },
  {
    version: '0.28.1',
    date: '2025-08-26',
    added: [
      {
        title: 'Edit rows directly in the results',
      },
      {
        title: 'Filter by any result value via context menu',
      },
    ],
    changed: [
      {
        title: 'Copy result values via context menu',
      },
    ],
    fixed: [
      {
        title: "Tab-reload keybinding wasn't working",
      },
      {
        title: "Cell values shouldn't be selectable",
      },
    ],
  },
  {
    version: '0.27.3',
    date: '2025-08-20',
    fixed: [
      {
        title: 'Related tables missing when clicking a table in the graph',
      },
      {
        title: 'Run keybinding now works on Mac',
      },
    ],
    changed: [
      {
        title: 'Connection monitor moved into the settings menu',
      },
      {
        title: 'Minimize/maximize button for the graph',
      },
      {
        title: 'Slimmer resizable divider',
        description: 'No icons are shown on it anymore.',
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2025-08-19',
    added: [
      {
        title: 'Support for a `?query=<expression>` URL parameter',
      },
      {
        title: 'Graph shown in the secondary view alongside results',
      },
    ],
  },
  {
    version: '0.26.2',
    date: '2025-08-19',
    fixed: [
      {
        title: 'Disabled user authentication for the playground',
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2025-08-18',
    added: [
      {
        title: 'Playground launched at playground.beamlynx.com',
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2025-07-13',
    added: [
      {
        title: 'Welcome page for new users',
      },
      {
        title: 'Polling for server connection status',
      },
    ],
    changed: [
      {
        title: 'Sidebar default width increased to 400px',
      },
    ],
  },
  {
    version: '0.24.1',
    date: '2025-07-12',
    fixed: [
      {
        title: 'SQL view performance issue',
      },
      {
        title: 'Improved graph rendering',
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2025-07-12',
    added: [
      {
        title: 'Autocomplete for the `where:` operation',
      },
    ],
    changed: [
      {
        title: 'Expression auto-prettifies after picking a table from autocomplete',
      },
    ],
    fixed: [
      {
        title: 'Mouse cursor incorrectly set to pointer',
      },
      {
        title: 'Download CSV button overlapped the Run button in compact mode',
      },
      {
        title: 'Autocomplete failed to show if opened too fast',
        description:
          'Added a fallback "Nothing found" completion so autocomplete always shows something.',
      },
    ],
  },
  {
    version: '0.23.0',
    date: '2025-07-07',
    added: [
      {
        title: 'Autocomplete for `select:` and `order:` operations',
      },
    ],
  },
  {
    version: '0.22.2',
    date: '2025-07-07',
    changed: [
      {
        title: 'Autocomplete no longer activates automatically',
      },
    ],
  },
  {
    version: '0.22.1',
    date: '2025-07-07',
    fixed: [
      {
        title: '`Tab` now shows the suggestions',
      },
      {
        title: 'First suggestion auto-selected',
      },
    ],
    changed: [
      {
        title: 'Expression prettifies after typing a pipe `|`',
      },
    ],
  },
  {
    version: '0.22.0',
    date: '2025-07-07',
    added: [
      {
        title: 'Download results as a CSV file',
      },
      {
        title: 'Autocomplete for pine operations and table names',
      },
    ],
    changed: [
      {
        title: 'Run keybinding changed to `Ctrl + Enter`',
      },
      {
        title: 'Run button moved into the text input',
      },
    ],
  },
  {
    version: '0.21.1',
    date: '2025-07-04',
    fixed: [
      {
        title: '`Tab` focus went to settings instead of the input',
      },
      {
        title: 'Improved graph colors in dark mode',
      },
    ],
    changed: [
      {
        title: 'Recursive delete queries now include the pine expressions',
      },
    ],
  },
  {
    version: '0.21.0',
    date: '2025-07-02',
    added: [
      {
        title: 'Run analysis templates',
      },
    ],
    fixed: [
      {
        title: 'Theme was set per tab instead of globally',
      },
    ],
  },
  {
    version: '0.20.1',
    date: '2025-07-01',
    fixed: [
      {
        title: 'SQL view re-rendered too often, hurting performance',
      },
    ],
  },
  {
    version: '0.20.0',
    date: '2025-07-01',
    added: [
      {
        title: 'Code editor for writing pine expressions',
      },
      {
        title: 'Dark mode',
      },
      {
        title: 'Vim mode',
      },
      {
        title: 'SQL syntax highlighting in dark mode',
      },
    ],
    fixed: [
      {
        title: "Escape key didn't return focus to the input",
        description:
          'This broke specifically after clicking another part of the UI with the mouse.',
      },
    ],
  },
  {
    version: '0.19.0',
    date: '2025-05-15',
    added: [
      {
        title: 'Button to evaluate Pine expressions',
      },
      {
        title: 'Clickable id column in results',
        description:
          "Clicking a row's id adds a where condition and limits the results to that row.",
      },
      {
        title: 'Responsive layout for smaller screens',
        description:
          'Below 1200px wide, the SQL query view is hidden so the main view has more room.',
      },
    ],
    fixed: [
      {
        title: 'Error handling for recursive delete queries',
      },
      {
        title: 'Graph rendered per table during recursive deletes',
      },
    ],
    changed: [
      {
        title: 'Graph updates as you type',
      },
      {
        title: 'Focus follows the candidate node',
      },
    ],
  },
  {
    version: '0.18.2',
    date: '2025-05-13',
    fixed: [
      {
        title: 'Correct column used in delete queries',
        description:
          "Delete queries now use the column from the previous join instead of defaulting to the table's first column.",
      },
    ],
  },
  {
    version: '0.18.1',
    date: '2025-05-09',
    added: [
      {
        title: 'Accurate version shown when the Pine server is offline',
        description: "Previously showed `latest` instead of the server's real version.",
      },
    ],
  },
  {
    version: '0.18.0',
    date: '2025-03-23',
    added: [
      {
        title: 'Clickable suggested columns',
        description:
          'Clicking a suggested select or order column in the selected node updates the expression.',
      },
    ],
    changed: [
      {
        title: 'Improved setup and connection UX',
        description: 'Setting up the Pine server and connecting to the database.',
      },
    ],
  },
  {
    version: '0.17.0',
    date: '2025-03-15',
    added: [
      {
        title: 'Clickable suggested nodes',
        description: 'Click a suggested node to select it.',
      },
    ],
  },
  {
    version: '0.16.0',
    date: '2025-03-10',
    added: [
      {
        title: 'View-mode icons for documentation, graph, and results',
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2025-03-02',
    added: [
      {
        title: 'Resizable sidebar',
        description: 'Drag the divider to adjust its width.',
      },
      {
        title: 'Local storage for user preferences',
        description: 'Starting with the sidebar width setting.',
      },
    ],
  },
  {
    version: '0.14.0',
    date: '2025-02-26',
    added: [
      {
        title: 'Graph remembers moved node positions',
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2025-02-09',
    added: [
      {
        title: 'Database connection monitor',
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2025-02-02',
    added: [
      {
        title: 'Selected and suggested columns for order',
      },
    ],
    fixed: [
      {
        title: 'Graph not updating after running the expression',
      },
      {
        title: 'Graph disappearing on keypress',
        description: 'Any printable character hid the graph instead of leaving it visible.',
      },
      {
        title: 'Sidebar width on smaller screens',
        description: 'Adjusts automatically when the browser dev console is open.',
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2025-01-11',
    added: [
      {
        title: 'More space for the graph',
        description: 'Rearranged the layout so the graph gets more room.',
      },
    ],
    fixed: [
      {
        title: 'Graph not re-rendering after selecting a suggested node',
      },
    ],
  },
  {
    version: '0.10.2',
    date: '2025-01-08',
    fixed: [
      {
        title: 'Suggested columns respect table aliases',
        example: 'company as c | document | select: c.id',
      },
    ],
  },
  {
    version: '0.10.1',
    date: '2025-01-07',
    added: [
      {
        title: 'Selected columns shown for tables',
      },
      {
        title: 'Suggested columns shown for the current table',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2024-10-25',
    added: [
      {
        title: 'Database connection support',
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2024-10-19',
    added: [
      {
        title: 'Tabs for multiple sessions',
      },
      {
        title: 'Recursive deletes',
        example: "company | id='...' | delete:",
      },
    ],
  },
  {
    version: '0.7.1',
    date: '2024-09-22',
    fixed: [
      {
        title: 'A pipe always reformatted the whole expression',
        description:
          'Adding a `|` anywhere prettified the entire expression, so there was no way to add a pipe in the middle of one.',
      },
      {
        title: 'Non-printable keys leaked into the expression',
        description:
          "Pressing a non-printable key (e.g. an arrow key) while a candidate was selected in the graph typed that key's name into the expression instead of being ignored.",
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2024-08-23',
    added: [
      {
        title: 'Show aliases for selected tables',
      },
    ],
    changed: [
      {
        title: 'Escape focuses the input',
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2024-08-13',
    changed: [
      {
        title: 'Auto-prettify the expression on pipe entry',
      },
    ],
    fixed: [
      {
        title: 'Refocusing the input hid the results',
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2024-08-02',
    breaking: [
      {
        title: 'Tab moves focus to the graph',
        description: '`Esc` or `Shift + Tab` moves focus back to the input.',
      },
      {
        title: 'The focused frame is highlighted with a border',
      },
      {
        title: 'Enter fetches results from the input',
      },
      {
        title: 'Enter selects the current candidate in the graph',
        description: 'Any other character brings focus back to the input.',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2024-07-31',
    breaking: [
      {
        title: 'Fetch results with `Ctrl + Enter`, not `Enter`',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2024-07-30',
    added: [
      {
        title: 'Support for `from: <alias>`',
        description: 'Sets the context table for joins.',
      },
    ],
  },
  {
    version: '0.3.2',
    date: '2024-07-26',
    changed: [
      {
        title: 'Syntax errors shown inline with the query',
      },
      {
        title: 'Removed deprecated code',
      },
    ],
  },
  {
    version: '0.3.1',
    date: '2024-07-22',
    changed: [
      {
        title: 'SQL query shown beside the Pine input',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2024-07-22',
    added: [
      {
        title: 'Copy the query on click',
      },
      {
        title: 'Support for ambiguous joins',
      },
    ],
    changed: [
      {
        title: 'Obsolete-version message when the server omits its version',
      },
      {
        title: '⏳ Fetching rows … message during query execution',
      },
      {
        title: 'Clerk no longer needed in development',
      },
      {
        title: 'SQL query indented (tabular-right)',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2024-07-11',
    added: [
      {
        title: 'Click a cell to copy its value',
      },
    ],
    fixed: [
      {
        title: 'Navigation broke when there were no candidates to select',
      },
      {
        title: 'Clicking a cell could duplicate rows or throw an error',
        description: 'This happened when moving focus away from the cell afterward.',
      },
    ],
  },
  {
    version: '0.1.1',
    date: '2024-07-08',
    changed: [
      {
        title: 'The graph now takes the full screen height',
      },
    ],
  },
];

export const LATEST_VERSION = '0.70.0';
