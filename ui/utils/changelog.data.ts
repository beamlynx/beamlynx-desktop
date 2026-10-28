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
    version: '0.71.0',
    date: '2026-10-28',
    added: [
      {
        title: 'The results show how long the query took',
        description:
          'The time, in milliseconds, sits next to the row count. It counts from pressing Run to the rows arriving.',
      },
    ],
    changed: [
      {
        title: 'Access policies are now called masking policies',
        description:
          'The info icon next to Settings → Masking templates explains what masking does. A masked column comes back as xxxxx. An agent can still filter, sort and join on it with a value it already has, such as an email it was given.',
      },
    ],
  },
  {
    version: '0.70.2',
    date: '2026-10-28',
    changed: [
      {
        title: "The sidebar lists an agent's investigation under Agent only once it has a name",
        description:
          "Until then, if it's the only one, clicking Agent opens it.",
      },
    ],
    fixed: [
      {
        title: "The agent's question shows as soon as the agent says it",
        description:
          "It appears in the sidebar and at the top of the timeline. Before, it waited for the agent's next step.",
      },
    ],
  },
  {
    version: '0.70.1',
    date: '2026-10-28',
    changed: [
      {
        title: "Opening a connection in a tab that has a query offers two clearly labelled choices",
        description:
          "Open in a new tab leaves this tab as it is, and is the default. Switch this tab warns that the query may not work on the other database.",
      },
      {
        title: "To connect another agent, click the plug icon in the timeline's header",
        description:
          "It sits next to the arrow that hides the timeline, and opens the agent setup in Settings.",
      },
      {
        title: "Access policy rules for a column in any schema say \"in every schema\"",
        description:
          "You'll see this in Settings and on the cards where an agent proposes a change.",
      },
    ],
    fixed: [
      {
        title: "Applying an agent's proposed policy change works, or says why it didn't",
        description:
          "Before, Apply could fail silently and leave the card stuck. If saving fails, the policy goes back to how it was, and the card says when the agent had already stopped waiting.",
      },
      {
        title: "Undo on an applied proposal no longer erases changes made after it",
        description:
          "If the policy changed since you clicked Apply, Undo is refused and points you to Settings.",
      },
      {
        title: "An agent's queries run one at a time, and each step in the timeline shows its own result",
        description:
          "Before, queries sent together could mix up each other's columns and errors. A query that runs too long is stopped.",
      },
      {
        title: "The agent's timeline no longer shows \"working\" forever",
        description:
          "Steps that will never finish are shown as ended, including a reveal preview that runs longer than 60 seconds. Each investigation shows what its own agent is doing.",
      },
      {
        title: "Buttons in the timeline and in Settings show an error when they fail",
        description:
          "They used to stay disabled. If Show to agents fails, the rules go back to how they were.",
      },
      {
        title: "An agent's query is refused when its connection's access policy can't be found",
        description:
          "Before, it ran without hiding anything.",
      },
      {
        title: "Long agent sessions use less memory",
        description:
          "Each step keeps at most 500 rows to show again, and only the ten most recent finished investigations are kept.",
      },
      {
        title: "The plug icon always takes you to the agent setup",
        description:
          "If Settings is already open there, the setup flashes so you can see it.",
      },
    ],
  },
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
        title: "Picking a connection while the tab has a query offers to open it in a new tab",
        description:
          "Open in new tab is the default, and leaves this tab's query as it is. Switch this tab switches it, as before.",
      },
      {
        title: "The sign-in screen comes back at every launch until you sign in",
        description:
          "Only Skip for now closes it, until the next launch. Clicking outside it or pressing Escape does nothing.",
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
        title: "Sign in to Beamlynx with GitHub, or skip",
        description:
          "On desktop, a first-run screen asks you to sign in, so we know who uses Beamlynx. Skipping is final, and you can sign in or out later in Settings → Account.",
      },
      {
        title: "Anonymous usage stats, with a switch to turn them off",
        description:
          "The first-run screen says so before anything is sent, and the switch is in Settings → Account. Each query run is counted as yours or an agent's, in Pine or SQL, and nothing else about it is sent.",
      },
      {
        title: "Agents can propose changes to an access policy",
        description:
          "The proposal is a card in the agent's timeline that lists each change in plain words. Nothing changes until you click Apply, and Undo puts the rules back. This replaces the Allow card.",
      },
    ],
    changed: [
      {
        title: "Each connection has its own access policy",
        description:
          "Changing it never changes another connection. Settings → Access Policy is now Policy templates, which a connection's policy starts from.",
      },
      {
        title: "Agent access is set per connection: Off, Masked or Every column",
        description:
          "This replaces the MCP switch. Masked hides columns as the connection's policy says. Every column lets agents read everything, after asking you to confirm. While agents have access, Settings reminds you that what they read goes to your AI provider, and that masking isn't a guarantee.",
      },
      {
        title: "The connection list is clearer",
        description:
          "A zap marks the tab's connection, and a robot shows whether agents can query it. Click a row to open its settings, and Connect to switch to it.",
      },
      {
        title: "Anything that weakens protection or deletes something asks in a dialog",
        description:
          "\"Click again to delete\" is gone.",
      },
      {
        title: "Agents have one item in the sidebar",
        description:
          "On desktop, the robot opens the agent setup until an agent has worked here, then the agent's work. The MCP section left Settings.",
      },
      {
        title: "Tooltips wait 600 ms before showing",
        description:
          "Longer explanations sit behind small info icons.",
      },
      {
        title: "The sidebar toggle is a double chevron",
        description:
          "It used to look like the Database Connections icon.",
      },
      {
        title: "An agent's query that uses a hidden column is refused straight away",
        description:
          "Before, it waited for your answer. The agent can propose a policy change instead.",
      },
      {
        title: "The agent's timeline is shorter and follows the newest step",
        description:
          "A query takes two lines, and a run of lookups takes one. Scroll up to stop following, and click New steps below to go back.",
      },
    ],
    fixed: [
      {
        title: "A group: with no keys reads correctly on the canvas",
        description:
          "It shows as group with count as n.",
      },
      {
        title: "Sort and filter chips keep the newer Pine you wrote",
        description:
          "Flipping a sort keeps nulls first or nulls last. Editing a filter keeps a function on its left, like jsonb_typeof(data) = 'array'.",
      },
      {
        title: "An agent's SQL that didn't convert to Pine no longer appears in the Pine editor",
        description:
          "Its step in the timeline shows the SQL and why it didn't convert.",
      },
    ],
  },
  {
    version: '0.68.0',
    date: '2026-10-19',
    added: [
      {
        title: "Hiding or showing a column for agents can change only this connection's policy",
        description:
          "When the policy is shared with other connections, Beamlynx asks first. Copy for (this connection) changes a copy, and Change (policy) changes it for every connection. Needs the matching beamlynx-desktop release.",
      },
    ],
    changed: [
      {
        title: "The agent's item sits at the bottom of the sidebar, once an agent has started an investigation",
        description:
          "Until then there is nothing to open. The connection and the settings stay at the top.",
      },
    ],
    fixed: [
      {
        title: "\"Also restrict my own queries\" applies in an agent's investigation tab too",
        description:
          "Before, every query you ran in that tab was masked, whatever the setting said. Only the agent's own queries are always masked.",
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
          "With 0.49.0, your own tabs would hide the values that are hidden from agents. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
    added: [
      {
        title: "A sidebar on the left",
        description:
          "It holds the database connection at the top, the agent, What's new and each section of Settings. It shows icons, and expands to show labels and the agent's investigations.",
      },
      {
        title: "Agent investigations",
        description:
          "In the desktop app, each Claude session gets its own investigation, named for the question the agent is investigating. Its timeline keeps every step: the tables the agent looked for, each query with its reason and result, and what it found. Click a query to see its rows again, exactly as the agent saw them, without running anything.",
      },
      {
        title: "Let an agent use a hidden column while it waits",
        description:
          "When an agent's query filters, sorts or groups on a column the access policy hides, the timeline shows a card with the column and the agent's reason. Allow adds the column to the policy and runs the query again. Decline sends the agent your reason.",
      },
      {
        title: "An agent's request to see hidden values is a card in its investigation",
        description:
          "The query runs once, read-only, so you can check the real rows before deciding. Reveal to the agent sends exactly those rows, and Decline sends your reason.",
      },
      {
        title: "Write to the agent from Beamlynx",
        description:
          "A box at the bottom of the timeline sends the agent a note with its next call. A query you run in the agent's tab is added to the timeline, and the agent is told what you ran and what came back.",
      },
      {
        title: "Except rules keep a column hidden from agents, even when an Allow rule matches it",
        description:
          "Every policy starts with exceptions for names containing token, password and secret. You'll find both lists in Settings → Access Policy.",
      },
      {
        title: "Hide a column from agents, or show it, from the results",
        description:
          "Right-click a cell or a column header and choose Hide from agents or Show to agents. The change goes into the policy of that tab's connection, and you can undo it.",
      },
      {
        title: "See which columns agents can't see",
        description:
          "On a connection agents can query, a hidden column has a crossed-out eye in its header. Your own tabs still show the real values.",
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
          "Most of the new features below need it. Connecting to an older server shows the upgrade-required screen.",
      },
      {
        title: "Editing a cell finds its row by the table's primary key, not by a column called id",
        description:
          "Tables keyed on another column, or on several, can now be edited. Tables and views without a primary key can't be edited, and the grid says why. Primary key columns themselves can't be edited.",
      },
    ],
    added: [
      {
        title: "See what an AI agent is doing as it works",
        description:
          "In the desktop app, the robot icon in the header pulses while an agent works, and its tooltip says what it's doing. Clicking it opens a log of every call the agent made. Needs beamlynx-desktop 0.20.0 or later.",
      },
      {
        title: "Reset the canvas layout",
        description:
          "After you drag a node, a refresh icon at the right end of the canvas toolbar puts everything back where it was laid out.",
      },
      {
        title: "Open a checkpoint or a named result to see what's inside it",
        description:
          "An arrow on the node, or e, opens a dashed box above it that holds the tables it is made from. Those tables work as usual.",
      },
      {
        title: "Several query blocks on the canvas",
        description:
          "A block that ends in |= name is drawn as a nested query of the block that uses name. A strip at the top of the canvas shows how the blocks feed each other. Click a chip to open that block.",
      },
      {
        title: "A \"per\" field in the limit editor",
        description:
          "It keeps the first N rows of each group, like limit: 3 per department_id.",
      },
      {
        title: "Variables in the filter editor",
        description:
          "Type $name as a value to use a variable, and pick in or not in to compare with a list. make variable turns a value like 'shipped' into a variable, with its value in the values block.",
      },
      {
        title: "The canvas draws a query in stages",
        description:
          "Each limit: or group: ends a stage, and the steps after it work on that result. Each checkpoint is a node you can select from, filter and join, like a table.",
      },
      {
        title: "Set the limit from any table on the canvas",
        description:
          "Use limit: in a table's \"+\" menu, or press l.",
      },
      {
        title: "AI agents can send SQL, which runs as Pine",
        description:
          "The desktop app's run_sql_as_pine tool converts the agent's SQL to Pine and runs only the Pine, under the same rules as any agent query. SQL that doesn't convert runs nothing, and the agent is told why. Needs the matching beamlynx-desktop release.",
      },
      {
        title: "The SQL panel completes table and column names",
        description:
          "Press Tab or Ctrl/Cmd-Space to open the hints, as in the Pine panel. After JOIN, it suggests the tables that join to yours, with the ON clause written out.",
      },
      {
        title: "SQL becomes Pine as you type",
        description:
          "The canvas draws the SQL you type, and you can edit it there. When the SQL doesn't convert, an amber line under the editor says why, and the SQL still runs.",
      },
      {
        title: "JSON paths on the canvas",
        description:
          "A key inside a JSON column, like data.address.city, shows by that name on the select, filter, order and group chips.",
      },
      {
        title: "Edit a key inside a JSON column from the grid",
        description:
          "The edit is saved into that key alone, and keeps the type the value had. A cell for a missing key, an object or an array stays read-only and says why.",
      },
      {
        title: "The SQL panel hides the extra columns Beamlynx adds so results can be edited",
        description:
          "They are still fetched. To show them, turn on the switch in Settings → Preferences, or use Toggle Hidden Columns in SQL in the command palette.",
      },
      {
        title: "Stop a running query",
        description:
          "While a query runs, Run becomes Stop, and Escape in the editor does the same. The database stops the query, and a write is rolled back.",
      },
      {
        title: "SQLite in the desktop app",
        description:
          "Pick SQLite as the database type in Settings → Database Connections, then choose the file with Browse… or type its path.",
      },
      {
        title: "On desktop, your preferences are kept in the app's data file, beamlynx.db",
        description:
          "This covers theme, fonts, panel sizes, open tabs and the other settings. Your current settings are copied over the first time. Needs beamlynx-desktop 0.20.0 or later.",
      },
      {
        title: "The desktop app remembers column widths",
        description:
          "A column you resize keeps its width the next time it shows up, in any tab, on the same connection.",
      },
    ],
    changed: [
      {
        title: "Deleting through a traversal removes rows in batches of 10 000",
        description:
          "Pine accepts limit: only up to 10 000. The SQL script you can copy says to repeat a statement that has more rows.",
      },
      {
        title: "The canvas no longer makes up names for checkpoints, like agg",
        description:
          "When it needs a name in the text, it uses the one Pine already gives, like |= result_1.",
      },
      {
        title: "A beamlynx://run link opens its query in a tab but doesn't run it",
        description:
          "A banner names the connection it would run on. Check both, then press Run. Any web page or message can carry such a link.",
      },
    ],
    removed: [
      {
        title: "Sign-in on the hosted web build",
        description:
          "The desktop app never had sign-in, and the web build is no longer deployed.",
      },
    ],
    fixed: [
      {
        title: "A database that is down shows one plain message instead of leaving tabs stuck",
        description:
          "\"Can't reach the database\" appears above the results, with the reason. The tab you're on tries again every 10 seconds. The desktop app no longer shows an alert at startup for a connection it can't reach.",
      },
      {
        title: "A canvas popover near the edge is no longer cut off",
      },
      {
        title: "A filter, join or group on a table before a checkpoint lands in that table's stage",
        description:
          "Once a query had two checkpoints, it could land after the checkpoint instead.",
      },
      {
        title: "Removing a query's only limit: or group: on the canvas no longer leaves a stray name, like |= agg",
      },
      {
        title: "Copying results and CSV export hold only the columns shown in the grid",
        description:
          "They used to include hidden key columns, such as __c_0__id.",
      },
      {
        title: "A column the query works out, like created_at => month, can no longer be edited",
        description:
          "Saving it used to write the value into the stored column, such as 2024-01 into created_at.",
      },
      {
        title: "Tab right after an alias and a dot, as in s: t., offers that table's columns",
        description:
          "Before, it offered nothing. Choosing a table after public. no longer repeats the schema.",
      },
      {
        title: "Using a recipe (Ctrl+O) keeps your tab's own $variables",
        description:
          "Before, the recipe's values replaced them and changed the tab's results.",
      },
      {
        title: "You can't approve a reveal request while the query has unrun edits",
        description:
          "This makes sure the agent only gets rows you looked at.",
      },
      {
        title: "Values with an apostrophe, like O'Brien, are saved correctly",
        description:
          "They used to be saved as O_Brien, and a row whose text id had an apostrophe couldn't be edited.",
      },
      {
        title: "A damaged or out-of-date saved preference no longer leaves a blank page at start-up",
        description:
          "It falls back to its default. Damaged saved tabs are skipped.",
      },
      {
        title: "An unexpected error shows a page with Reload and \"Reset preferences and reload\" instead of a blank window",
        description:
          "Resetting keeps your open tabs.",
      },
      {
        title: "A Pine server with a version like dev connects",
        description:
          "It used to show \"No connection to Pine server\". The upgrade-required screen also clears once the server is upgraded, without a reload.",
      },
      {
        title: "Auto-run on the canvas no longer runs a query that changes data",
        description:
          "Narrowing an update! with a filter chip used to run the update at once. Such a query now waits for Run.",
      },
      {
        title: "Saving a cell checks first that the row still exists",
        description:
          "If it doesn't, the save is refused and says so.",
      },
      {
        title: "A ?query= share link with a %, like like '%a%', opens",
        description:
          "It used to be ignored.",
      },
      {
        title: "The bar chart is offered only up to 2 000 rows",
        description:
          "A large result used to freeze the tab.",
      },
      {
        title: "A tab whose saved connection was deleted asks you to pick one",
        description:
          "It used to show \"Failed to reconnect\" every time you switched to it.",
      },
      {
        title: "The Inspect dialog says why an update failed, and shows JSON values as JSON",
        description:
          "It used to show \"Update execution failed\" and [object Object].",
      },
    ],
    security: [
      {
        title: "The desktop app no longer writes your database password to the developer console",
      },
      {
        title: "A reveal request can no longer change data",
        description:
          "Before, an agent could send user | delete! as a reveal request, and the rows were deleted as soon as it arrived. The query now runs read-only, and one that would change data is declined.",
      },
      {
        title: "Only Beamlynx can use the query server bundled with the desktop app",
        description:
          "Each request carries a secret the app makes at launch. If the server refuses the app, the connection indicator suggests restarting Beamlynx.",
      },
      {
        title: "CSV export and copy can't run a formula in your spreadsheet",
        description:
          "A value starting with =, +, - or @ gets an apostrophe in front.",
      },
      {
        title: "Next.js and other libraries are updated past every published security advisory",
        description:
          "This includes the middleware bypass CVE-2025-29927.",
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
        title: "Ctrl+S saves a recipe instead of downloading the tab as a .pine file",
        description:
          "Nothing in Beamlynx opened those files. In the browser, which has no recipes, Ctrl+S does nothing.",
      },
    ],
    added: [
      {
        title: "Variables",
        description:
          "Write $name where a value goes, and set it in a values block above the query, like $company_name = 'Acme'. On the canvas, a Variables list shows each variable and its value, and you can click a value to change it.",
      },
      {
        title: "Use one query's result in another",
        description:
          "A named result with one column can follow in, like employee | where: id in acme_emps.",
      },
      {
        title: "A recipe keeps its $variables and their values",
      },
      {
        title: "An AI agent can pass values for $variables when it runs a query",
        description:
          "The agent's tab shows the values it used, so you can run it again.",
      },
      {
        title: "Save a query as a recipe with Ctrl+S",
        description:
          "A bar above the tab asks for a title. The query's comments are saved with it, as the recipe's explanation. Needs the desktop app 0.19 or later.",
      },
      {
        title: "Use a recipe with Ctrl+O",
        description:
          "Search by any word in its title, comments or query. The query goes into your tab as text, and nothing runs until you press Ctrl+Enter.",
      },
    ],
    changed: [
      {
        title: "The hosted web app is no longer updated",
        description:
          "The last version deployed stays online.",
      },
      {
        title: "The web app builds on Node.js 24",
        description:
          "Hosting providers stopped building with Node.js 20.",
      },
      {
        title: "A development copy shows an amber DEV chip in the header",
        description:
          "A desktop dev build shows it too, so it can't be mistaken for the installed app.",
      },
      {
        title: "A desktop dev build can run next to the installed app",
        description:
          "It uses its own port, and its agent setup is named beamlynx-dev.",
      },
    ],
    fixed: [
      {
        title: "The Access Policy section says that a hidden column can still be used in a query's conditions",
        description:
          "So a query could test a guess about its values, for example by counting rows. This was always true, but wasn't written down.",
      },
      {
        title: "Keys pressed in a dialog no longer reach the canvas behind it",
        description:
          "Pressing Backspace, Delete or x in the recipe picker or the command palette used to delete the selected item in your tab.",
      },
      {
        title: "New Database Connection in the command palette opens the add form again",
        description:
          "It used to open the list of connections. A saved password that can't be unlocked now opens the form filled in every time.",
      },
      {
        title: "The Access Policy and MCP sections describe agent access correctly",
        description:
          "Access is set per connection, under MCP access in Database Connections.",
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
          "Canvas filters that match any of several conditions use or, which pine-lang 0.47.0 added. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
    added: [
      {
        title: "An edited value's cell glows briefly, and a message says it was saved",
        description:
          "If it wasn't saved, the message says why.",
      },
      {
        title: "A value that can't be edited says why as soon as you try",
        description:
          "That covers a row's id, a table whose id isn't in the result, and values the query works out.",
      },
      {
        title: "Move between result cells with the arrow keys, and copy a range",
        description:
          "Select by dragging or with Shift. Ctrl+C copies the range as text that pastes into a spreadsheet.",
      },
      {
        title: "A canvas filter can match any of several conditions",
        description:
          "In the filter panel, + or adds another condition. It is written as one where: joined with or.",
      },
    ],
    changed: [
      {
        title: "The results grid is new, and much faster",
        description:
          "Scrolling stays smooth however many rows there are. A 100,000-row result shows about four times sooner.",
      },
      {
        title: "The delete script from traverse explains how its Run button works",
        description:
          "Running the script yourself deletes everything in one transaction. Run deletes one table at a time, deepest first, committing each.",
      },
      {
        title: "Results resize smoothly when Settings or the Pine panel opens beside them",
        description:
          "They used to turn into a grey placeholder while the panel moved.",
      },
      {
        title: "All rows are in one scrolling grid",
        description:
          "Results are no longer split into pages of 100 rows.",
      },
    ],
    removed: [
      {
        title: "Sorting by clicking a column header, and the column menu",
        description:
          "Sorting and filtering will come back as changes to the Pine query. To filter on a value for now, right-click the cell and choose Filter.",
      },
    ],
    fixed: [
      {
        title: "Tab in the canvas filter panel moves between the panel's own fields",
        description:
          "It used to move focus out of the panel.",
      },
      {
        title: "A filter typed by hand that matches any of several conditions shows on its table on the canvas",
        description:
          "It used to disappear. Click its chip to edit every condition.",
      },
      {
        title: "The app's fonts work offline",
        description:
          "Fonts like IBM Plex Mono and Inter now ship inside the app. Before, the desktop app used a system font if they weren't installed.",
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
          "Use traverse instead (see below). A saved tab that ends in delete: has it removed when the tab opens.",
      },
      {
        title: "Needs pine-lang 0.46.0 or later (was 0.45.0)",
        description:
          "The canvas needs the new way the server describes joins. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
    added: [
      {
        title: "Traverse from a table on the canvas",
        description:
          "Press + on a table and pick traverse. It finds every table that points at it by foreign key, up to 25 levels deep. Count rows lists their row counts. Delete rows… builds a script that deletes them, deepest table first, which you can copy or run.",
      },
    ],
    fixed: [
      {
        title: "Joins on the canvas start from the latest table unless you pick another",
        description:
          "Hovering over a table used to move focus to it, so the next | could join from the wrong table. To join from an older table, click it or move to it with the keyboard.",
      },
      {
        title: "Ctrl+C on the canvas copies again",
        description:
          "It used to open the comment editor. Ctrl+V, Ctrl+A and Ctrl+F work again too.",
      },
      {
        title: "Switching tabs no longer makes the layout jump",
        description:
          "Panel sizes used to reset and then jump back to your saved sizes.",
      },
      {
        title: "The error above the results is no longer cut off",
        description:
          "It wraps over up to six lines, then scrolls.",
      },
    ],
    security: [
      {
        title: "AI agents can no longer change your data",
        description:
          "The old check only refused delete!, and let update! through. The Pine server now refuses every write from the agent's tab, even if you press Run there yourself.",
      },
      {
        title: "Agent queries need pine-lang 0.46.0 or later",
        description:
          "An older server can't refuse the writes, so agent queries won't run against it.",
      },
    ],
    removed: [
      {
        title: "The BEAMLYNX_MCP_ALLOW_DELETE environment variable",
        description:
          "It turned off the check on agents' deletes for the whole machine.",
      },
    ],
  },
  {
    version: '0.62.0',
    date: '2026-09-20',
    added: [
      {
        title: "Explain a tab with a comment at the top of its query",
        description:
          "Start the query with a /* ... */ comment or -- lines, and the canvas shows it in its top-left corner. It's a place to note what you're looking for and why.",
      },
      {
        title: "Write a tab's comment from the canvas",
        description:
          "Press c, click the comment button in the toolbar, or click an existing comment. Cmd/Ctrl+Enter or clicking away saves it, and Esc cancels.",
      },
      {
        title: "An AI agent explains each query it runs",
        description:
          "It starts the query with a comment saying what it is looking for and why, so its tab shows its reasoning.",
      },
      {
        title: "Have more than one connection to the same host and port",
        description:
          "They need to point at different databases. The second one used to be rejected.",
      },
      {
        title: "The connection string stays in step with the fields",
        description:
          "In the Add Connection form, switching to the \"Connection string\" tab rebuilds it from the Fields tab.",
      },
    ],
    changed: [
      {
        title: "Panels open and close with a short animation",
        description:
          "This covers Settings, the Pine/SQL panel, Zen mode, the error above the results and dialogs. Turn on your system's \"reduce motion\" setting to make them instant.",
      },
      {
        title: "Results columns fit their content instead of stretching to fill the pane",
        description:
          "Scroll sideways when a wide result doesn't fit.",
      },
      {
        title: "Table colours tint only each column's header, not every value under it",
        description:
          "Hovering a table on the canvas does the same. It used to tint every cell, even with \"Table colors\" turned off.",
      },
      {
        title: "Switching the tab's connection while it has a query warns you first",
        description:
          "The query may use tables or columns the other connection doesn't have. Before, a new tab opened without asking.",
      },
      {
        title: "Rename a connection with the pencil icon next to its name",
        description:
          "You used to have to expand the row first.",
      },
      {
        title: "An AI agent's queries show in a tab of their own",
        description:
          "It is pinned to the end of the tab strip with a robot icon. Each new query replaces the last, so closing the tab is safe.",
      },
      {
        title: "An agent's request to see hidden values opens a \"Needs approval\" tab",
        description:
          "It names the connection, quotes the agent's reason, and offers Approve or Decline. Closing it declines, so the agent never waits forever.",
      },
      {
        title: "An agent icon in the header shows what the agent is doing",
        description:
          "A dot means a result arrived, and a count means approvals are waiting. Clicking it opens what needs you most.",
      },
      {
        title: "Settings opens faster the first time",
        description:
          "It also remembers your scroll position and section.",
      },
      {
        title: "Dragging a pane divider no longer selects text",
      },
    ],
    removed: [
      {
        title: "The classic Graph mode",
        description:
          "The canvas is now the only graph editor.",
      },
      {
        title: "Legacy Layout",
        description:
          "The canvas and results two-pane layout is the only one, and Settings always opens as a docked panel.",
      },
    ],
    fixed: [
      {
        title: "Panels open and close smoothly, even with a full table of results on screen",
        description:
          "The results grid used to redo its layout on every frame of the animation.",
      },
      {
        title: "A results column you resize keeps its width",
        description:
          "It used to snap back, for example when you hovered a table on the canvas.",
      },
      {
        title: "Entering or leaving Zen mode keeps the canvas where you panned and zoomed",
      },
      {
        title: "A blank line inside a /* ... */ comment no longer breaks the query",
        description:
          "The comment used to be split in two.",
      },
      {
        title: "The version badge in the header no longer says \"obsolete\" before you connect",
      },
      {
        title: "Typing a space while renaming a connection adds a space",
        description:
          "It used to switch your active connection instead.",
      },
      {
        title: "The rename and expand icons line up across rows in Database Connections",
        description:
          "They used to shift sideways.",
      },
      {
        title: "Icon-only buttons have labels for screen readers",
        description:
          "This covers close, download, save, notifications, tab controls and the JSON inspector.",
      },
    ],
    breaking: [
      {
        title: "Needs pine-lang 0.45.0 or later (was 0.44.0)",
        description:
          "Canvas comments need it, because an older server deletes them when you change the query on the canvas. So do several connections to one host and port. Connecting to an older server shows the upgrade-required screen.",
      },
    ],
  },
  {
    version: '0.61.0',
    date: '2026-09-12',
    added: [
      {
        title: 'You can add MySQL databases, not only Postgres',
        description:
          'Pick the database type when you add a connection, and the port fills in to match. Pasting a mysql:// connection string sets the type for you.',
      },
    ],
    fixed: [
      {
        title: "A query that can't reach the server no longer leaves the spinner running forever",
        description: 'Before, no error appeared. Now the spinner stops and the error shows.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.44.0 or later (was 0.43.0)',
        description:
          'MySQL support needs it. With an older server, Beamlynx shows a screen asking you to upgrade it.',
      },
    ],
  },
  {
    version: '0.60.0',
    date: '2026-09-10',
    added: [
      {
        title: 'An AI agent can ask you to show it values that your access policy hides',
        description:
          'The agent calls request_reveal, and its query opens in a tab where you can edit it. You then reveal the real results to the agent, or decline with a comment saying why so it can adjust.',
      },
      {
        title: 'Copy a whole result as CSV, ready to paste into a spreadsheet',
        description:
          'Use the "Copy result as CSV" button next to Export to CSV, or the "Copy Result" command.',
      },
      {
        title: 'Date columns get "today" and "in the last" filters on the canvas',
        description:
          'They appear next to the usual operators when you add a where on a column that looks like a date. Each one adds a pair of where: conditions for you.',
      },
      {
        title: 'Clicking a JSON cell opens its formatted value in an editor on the right',
        description:
          'Edit it there and save with Mod+Enter or the checkmark. JSON cells no longer edit inline, and Copy in the right-click menu gives the formatted JSON.',
      },
      {
        title: "Scrollbars in code editors match the app's theme instead of your system's",
      },
    ],
    changed: [
      {
        title: 'Access policies no longer hide values in your own queries unless you turn that on',
        description:
          'Each connection has an "apply access policy to my own queries" switch, off by default. Before, it was on unless you chose to bypass it.',
      },
      {
        title:
          'Moving between tables with the keyboard highlights their columns in the results, like hovering does',
        description: 'This works with the arrow keys and j/k on the canvas.',
      },
    ],
    fixed: [
      {
        title:
          'Opening the Pine or SQL panel moves the keyboard focus into it and refits the graph',
        description:
          'Before, your keystrokes could go nowhere, and the graph could stay partly cut off by the smaller canvas.',
      },
      {
        title:
          'A filter added with "Filter" in the results grid\'s right-click menu can always be edited or deleted on the canvas',
        description:
          'Before, editing or deleting it could do nothing, or change a different filter.',
      },
      {
        title: 'Editing an existing ilike filter on the canvas no longer breaks the query',
        description: 'The editor wrote the operator back as ILIKE, which Pine rejects.',
      },
    ],
  },
  {
    version: '0.59.0',
    date: '2026-09-06',
    added: [
      {
        title: 'Hovering a table on the canvas highlights its columns in the results',
        description:
          'You can see which columns come from which table without turning on "Table colors".',
      },
      {
        title: 'Click an order on the canvas to switch it between ascending and descending',
        description:
          'The arrow keys or a/d flip it, and "remove" deletes it. Before, clicking it opened the column list again.',
      },
    ],
    fixed: [
      {
        title:
          '"Filter" in the results grid\'s right-click menu filters the table the cell belongs to',
        description: 'Before, it filtered whichever table the query ended on.',
      },
    ],
  },
  {
    version: '0.58.0',
    date: '2026-09-06',
    breaking: [
      {
        title: 'Requires pine-lang 0.43.0 or later (was 0.42.0)',
        description: 'The canvas\'s new "path" action and path search in the Pine editor need it.',
      },
    ],
    added: [
      {
        title: "The Pine editor's autocomplete (Ctrl+Space) completes ? table path searches",
        description:
          'A ? table search finds the joins that lead to a table. Autocomplete lists the routes, and picking one replaces the whole search.',
      },
      {
        title:
          'The canvas\'s new "path" action adds the whole chain of joins to reach a table that isn\'t directly joinable',
        description:
          'It sits behind the new + button, together with order and group. Their shortcuts still work: o, g, p, and + to open the menu.',
      },
      {
        title: "Click a join's icon on the canvas to pick Inner, Left or Right",
        description:
          'The icon is the familiar two-circle diagram, so you can tell the join type at a glance.',
      },
      {
        title: 'Click a filter, selected column, order or group on the canvas to edit it',
        description: 'Before, you had to remove it and add it again.',
      },
      {
        title: 'Shift+J and Shift+K step through everything in the query, one item at a time',
        description:
          'That is each table, then its join, columns, filters, order and group. Enter or Space opens the highlighted item, and Delete, Backspace or x removes it.',
      },
    ],
    changed: [
      {
        title:
          'Join lines on the canvas are a neutral color, and only the join-type icon uses the accent color',
        description: 'Broken and guessed joins keep their own warning colors.',
      },
    ],
    fixed: [
      {
        title: 'Adding a step on the canvas removes a stray | left at the end of the query',
        description: 'Before, the dangling pipe stayed after the new step.',
      },
      {
        title: 'Hovering or clicking a table on the canvas moves the keyboard focus to it',
        description:
          'Before, the highlight could stay on the table you last reached with the keyboard. Hovering a filter or a join icon also highlights just that item.',
      },
      {
        title: 'A connection\'s access policy can be "None" while AI agent access is on',
        description:
          'Before, Settings → Connections treated "None" as no policy and blocked agent access. "None" means no values are hidden, as the desktop app already treated it.',
      },
    ],
  },
  {
    version: '0.57.0',
    date: '2026-09-02',
    added: [
      {
        title: 'Drag tabs to reorder them',
        description:
          'The order survives a reload, and Ctrl+Tab follows it. Dragging to the end of a long vertical rail scrolls it.',
      },
      {
        title: 'Tabs can run down the left side instead of across the top',
        description:
          'Turn it on in Settings → Appearance → Tabs, or with the "Toggle Tab Orientation" command.',
      },
    ],
    changed: [
      {
        title: "A tab's close button appears only when you hover that tab",
        description: 'Hovering also tints the tab.',
      },
    ],
    fixed: [
      {
        title: 'The "Only apply to MCP server" switch no longer turns itself off',
        description:
          'In the desktop app, it switched back off after most connection actions until you restarted.',
      },
    ],
  },
  {
    version: '0.56.0',
    date: '2026-09-02',
    breaking: [
      {
        title: 'Requires pine-lang 0.42.0 or later (was 0.41.0)',
        description: 'It formats the queries AI agents run (see Fixed).',
      },
    ],
    added: [
      {
        title:
          'The "Toggle Layout Orientation" command switches the new layout between side by side and top and bottom',
        description: "It's in the command palette, so you don't need the canvas toolbar icon.",
      },
    ],
    changed: [
      {
        title:
          "In the desktop app, each connection's options fold out under an arrow in Settings → Database Connections",
        description:
          'That is rename, access policy, AI agent access, "Only apply to MCP server", refresh and delete. They\'re in the order you use them: pick a policy, then turn on agent access.',
      },
    ],
    fixed: [
      {
        title:
          "Dragging the Pine/SQL panel's divider in the top and bottom view moves it the right way",
        description: 'It used to move the opposite way.',
      },
      {
        title: 'Queries run by AI agents appear formatted in the Pine panel',
        description: "Before, you saw the agent's expression exactly as it sent it.",
      },
      {
        title: "The canvas's where picker is easier to read and use",
        description:
          'A long column name ends in "…", with the full name on hover. The operator field gets focus first, and the fields have space between them.',
      },
    ],
  },
  {
    version: '0.55.0',
    date: '2026-08-31',
    breaking: [
      {
        title: 'Requires pine-lang 0.41.0 or later (was 0.39.0)',
        description: 'Access policies need it.',
      },
    ],
    added: [
      {
        title: 'Access policies decide which columns show real values and which show xxxxx',
        description:
          'Create, rename and delete them in Settings → Access Policy. Each policy has rules you switch on, for example for a Postgres type, foreign keys, or columns ending in _id.',
      },
      {
        title: 'Pick the access policy for each database connection',
        description:
          "AI agent access can only be turned on once the connection has an active policy. While it's on, you can't remove the policy or switch to an inactive one.",
      },
      {
        title:
          '"Only apply to MCP server" lets you see real values in your own queries on a connection',
        description: "What the agent sees doesn't change. It's off by default.",
      },
      {
        title: 'Hidden columns show xxxxx, and the real value never leaves the database',
        description: "This applies to every tab, not only the agent's.",
      },
    ],
    changed: [
      {
        title: '"Vim keybindings" no longer switches off the canvas\'s letter shortcuts',
        description:
          "It only affects j/k and the query editor's Vim mode. This undoes part of 0.54.0.",
      },
      {
        title: '"Vim keybindings" applies to every tab at once',
        description: 'It used to be set per tab.',
      },
    ],
    fixed: [
      {
        title: "AI agents' queries always use the current access policy",
        description: 'Before, they could use the policy as it was when the app started.',
      },
      {
        title:
          'Canvas shortcuts such as x keep working after you pick a value while Settings is open',
      },
      {
        title: 'A removed name on a canvas checkpoint no longer comes back',
        description:
          'A checkpoint is a group: or limit: step, named with |= name. The first click after naming one also no longer shows old results.',
      },
      {
        title: 'You can reach connections in the docked Settings panel with Tab',
        description:
          'The bell and gear no longer take the first Tab stops. Settings also keeps its own shortcuts and arrow keys instead of losing them to the canvas.',
      },
    ],
  },
  {
    version: '0.54.0',
    date: '2026-08-30',
    added: [
      {
        title:
          "The canvas's join picker shows which foreign key a join uses when a table appears twice",
        description:
          "It uses Pine's own syntax, such as .created_by. A table with only one way to join shows no extra text.",
      },
    ],
    changed: [
      {
        title: '"Vim keybindings" also controls the canvas\'s letter shortcuts',
        description:
          'With it off, j/k and s, w, o, g, x, u, U, i do nothing on the canvas. The arrow keys and Ctrl+Z/Ctrl+Y still work.',
      },
    ],
    fixed: [
      {
        title:
          "Canvas shortcuts no longer fire while you're in Settings or typing in the Pine/SQL panel",
        description:
          "Keys go to the panel that has focus, and Settings gets focus as soon as it opens. You can also move through Settings' sections with j/k and the arrow keys.",
      },
    ],
  },
  {
    version: '0.53.0',
    date: '2026-08-28',
    added: [
      {
        title: 'Zen mode shows only the canvas',
        description:
          'It hides the header, tabs and results, and pauses auto-run until you leave. Open it from the command palette.',
      },
      {
        title: 'Ctrl/Cmd+Shift+, opens and closes Settings',
      },
      {
        title: '"↻ Reconnect" appears in the header when a tab\'s database isn\'t connected',
        description:
          "This happens, for example, when the database wasn't running yet when Beamlynx started. Before, you had to switch tabs or reload the app.",
      },
    ],
    changed: [
      {
        title: 'Ctrl/Cmd+, opens and closes Settings, as in most Mac apps',
        description:
          'It used to open the SQL panel, which moved to Ctrl/Cmd+Shift+. instead. Ctrl/Cmd+. still opens the Pine panel.',
      },
      {
        title: 'In the new layout, Settings is a panel docked on the left',
        description: 'It stays open when you switch tabs. Escape no longer closes it.',
      },
    ],
    fixed: [
      {
        title: 'Canvas text follows the Text Size setting and is larger at every size',
        description: 'The shortcut legend at the bottom left is bigger too, with each key in bold.',
      },
      {
        title: 'Settings no longer covers the canvas and results in the new layout',
        description: 'Changing Text Size also no longer scrolls the control out from under you.',
      },
    ],
  },
  {
    version: '0.52.0',
    date: '2026-08-25',
    added: [
      {
        title: 'Pick a theme in the new Appearance section of Settings: Light, Dark or Sepia',
        description: 'Each has its own colors, and the editor and canvas follow it.',
      },
      {
        title: 'Choose the interface font and the code font separately',
        description:
          'The interface offers System, Inter and IBM Plex Sans. Code offers IBM Plex Mono, JetBrains Mono, Fira Code (with its ligatures) and System Monospace.',
      },
      {
        title: 'A Text size setting (Small, Medium, Large) scales text and spacing',
        description: 'Panels and the canvas keep their size.',
      },
    ],
    changed: [
      {
        title: '"Toggle Theme" in the command palette cycles through all three themes',
      },
      {
        title: 'The arrow keys and j/k wrap from the last table on the canvas back to the first',
      },
    ],
    fixed: [
      {
        title: 'Two-finger trackpad scrolling pans the graph instead of zooming it',
        description:
          'This matches Miro and Figma. In the classic graph, right-drag moves the view and left-drag moves a node or selects, as on the canvas.',
      },
    ],
  },
  {
    version: '0.51.2',
    date: '2026-08-23',
    changed: [
      {
        title: 'The Canvas and Results panes have the same 8px gap on every side',
        description: 'Before, the gaps differed, and there was none at the bottom.',
      },
    ],
    fixed: [
      {
        title: 'The desktop app\'s "update ready" message no longer says "restart" twice',
        description: 'Its "Restart Now" button also looks like a button.',
      },
    ],
  },
  {
    version: '0.51.1',
    date: '2026-08-23',
    changed: [
      {
        title:
          "Set a connection's color in Settings → Database Connections by clicking its status dot",
        description: 'The dot in the connection picker at the top left only shows status.',
      },
      {
        title: 'The Updates list shows a short title for each change, with details underneath',
        description: 'This makes it easier to skim.',
      },
      {
        title:
          'The Pine and SQL panels open with Ctrl/Cmd+. and Ctrl/Cmd+, instead of Ctrl/Cmd+Shift+E and Ctrl/Cmd+Shift+S',
      },
      {
        title: 'Each filter you add on the canvas becomes its own where: step',
        description:
          'Before, they were joined with commas in one where:. Several filters on one table must still all match.',
      },
    ],
    fixed: [
      {
        title: 'Table colors no longer disappear when you open the SQL panel',
        description: "The results hadn't changed, but the app thought they were out of date.",
      },
      {
        title: 'Auto-run works while the SQL panel is open',
        description: 'Before, canvas edits only ran the query while the Pine panel was showing.',
      },
    ],
  },
  {
    version: '0.51.0',
    date: '2026-08-23',
    added: [
      {
        title: 'A new layout puts the canvas and the results side by side, or one above the other',
        description:
          "It's the default for new sessions. Switch back to the classic sidebar layout from the header, Settings or the command palette.",
      },
      {
        title: 'Auto-run: each edit on the canvas runs the query',
        description:
          "Turn it off in Settings or the command palette if you'd rather run queries yourself.",
      },
      {
        title:
          'A Pine or SQL text panel can sit next to the canvas in the new layout, for editing by hand',
        description:
          'Open it with Ctrl+Shift+E (Pine), Ctrl+Shift+S (SQL) or the PINE/SQL toggle in the canvas toolbar. Drag the divider to resize it.',
      },
      {
        title: '| also opens the join picker on the canvas, like i',
        description: 'A join pipes a new table onto the current one.',
      },
      {
        title: "In the canvas's select, order, group and join pickers, , works like Enter",
        description: 'You can type a comma-separated list of columns in one go.',
      },
      {
        title: 'Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y undo and redo on the canvas',
        description: 'u and Shift+U still work too.',
      },
      {
        title: 'Remove any table from the canvas, not only the last one',
        description:
          "Joins that depended on it reconnect to the tables that are left. If such a join isn't real, it's drawn dashed as a warning.",
      },
      {
        title: 'Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab switch tabs in the desktop app',
        description:
          "Ctrl+PageDown and Ctrl+PageUp work too. In a browser, these keys belong to the browser's own tabs.",
      },
    ],
    removed: [
      {
        title: 'The "Compact mode" preference is gone',
        description:
          'It only affected the classic layout. The new layout stacks its panes on small screens by itself.',
      },
    ],
    fixed: [
      {
        title: 'Canvas shortcuts keep working after a query runs',
        description: 'Before, s, w, o, g, i, x and u stopped working until you reloaded.',
      },
      {
        title: 'A saved sidebar height no longer makes the window scroll',
        description: 'It could stretch the graph and results taller than the window.',
      },
      {
        title: "The join action's letter hint shows i, its real shortcut",
        description: 'It used to show j.',
      },
      {
        title:
          'A checkpoint shows its letter shortcuts when it has keyboard focus, like a table does',
        description: 'A checkpoint is a group: or limit: step.',
      },
      {
        title: 'Opening the Pine/SQL panel no longer blocks canvas shortcuts',
        description:
          "It used to put the cursor in its editor, so keys didn't reach the canvas until you clicked away.",
      },
      {
        title: 'Auto-run starts 150 ms after an edit instead of 500 ms',
        description:
          'Queries usually take a few milliseconds, so the longer wait made auto-run feel slow.',
      },
      {
        title: "A canvas edit the server couldn't fully build no longer crashes the app",
      },
      {
        title: 'A join left with no column to connect on shows as a dashed warning line',
        description:
          'Before, it looked like a normal join, and the table at its far end showed no columns. This could happen after you deleted a table between two others.',
      },
      {
        title: 'Canvas edits work while the SQL panel is open',
        description:
          'Before, the graph and the SQL stayed frozen. A session reloaded with the SQL panel open also got stuck on "Connecting…".',
      },
    ],
    changed: [
      {
        title: 'The canvas/graph switch moved from the header into the graph panel',
        description: 'The header only switches the overall layout.',
      },
    ],
  },
  {
    version: '0.50.0',
    date: '2026-08-22',
    breaking: [
      {
        title: 'Requires pine-lang 0.39.0 or later',
        description: 'The connection refresh icon needs it.',
      },
    ],
    added: [
      {
        title: 'A refresh icon on each live connection picks up new tables and columns',
        description:
          "It's in Settings → Database Connections. Before, you had to restart the server.",
      },
      {
        title: 'Give a connection a name in the desktop app',
        description:
          'Set it when you add the connection, or later with the pencil icon in Settings → Database Connections.',
      },
      {
        title: 'Use the canvas from the keyboard',
        description:
          'Move between tables and checkpoints with the arrow keys or j/k. Then press s select, w where, o order, g group, i join, x delete, or u and Shift+U to undo and redo.',
      },
    ],
    fixed: [
      {
        title: 'The delete icon lines up on every row in Settings → Database Connections',
        description: 'It used to shift when a row also showed the refresh icon.',
      },
      {
        title:
          'The desktop app\'s graph no longer sticks on "Connecting…" once the database is connected',
        description:
          "A tab's first query could fail before its connection was ready, and nothing tried again.",
      },
      {
        title: "AI agent access on a connection is shown as a small robot icon, lit when it's on",
        description: 'The switch it replaces looked like it turned the whole connection on or off.',
      },
    ],
    changed: [
      {
        title: 'Settings → About labels the pine-lang version "Server version"',
        description:
          'It also shows the version of this interface, and of the desktop app when you use it.',
      },
    ],
  },
  {
    version: '0.49.0',
    date: '2026-08-16',
    added: [
      {
        title:
          'A Settings page brings database connections, preferences and AI agent setup together',
        description: 'Open it with the gear icon next to the notification bell.',
      },
      {
        title: 'In the desktop app, AI agents such as Claude Code can query your saved connections',
        description: 'They connect through MCP. Turn it on for each connection in Settings.',
      },
      {
        title: 'Pick the database type when you add a connection, and its default port fills in',
      },
      {
        title: '"Open Settings" and "New Database Connection" are in the command palette',
      },
    ],
    changed: [
      {
        title: '"Connections" is called "Database Connections" everywhere',
        description: 'This leaves room for a future connection to the Pine server itself.',
      },
      {
        title:
          'When you add a connection, tabs switch between filling in fields and pasting a connection string',
        description: 'They replace the expandable section.',
      },
      {
        title: 'The Docker "Welcome" page and the "Pine server is not running" page are gone',
        description: 'The app opens straight to its normal view.',
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
        title: 'Build Pine queries by clicking through tables in a graph (experimental)',
        description: 'Turn it on from the header, next to the version number.',
      },
    ],
    changed: [
      {
        title: 'The whole app shares one visual design, the "schematic/blueprint" look',
      },
    ],
  },
  {
    version: '0.47.0',
    date: '2026-08-09',
    changed: [
      {
        title: 'Each tab keeps its own database connection and connects only when you open it',
        description:
          "Before, every tab followed the connection you picked last. At start-up, Beamlynx reconnects the tab you were on, and a hollow dot means it isn't connected yet.",
      },
    ],
    fixed: [
      {
        title: 'Clicking a graph node no longer jumps into the Pine input',
        description: 'It was taken as a Tab key press and moved the suggestion highlight.',
      },
      {
        title:
          'Picking a connection at start-up no longer changes which connection other tabs show',
        description: 'It could also open an unrelated new tab.',
      },
      {
        title: 'In the desktop app, tabs saved by an older version reconnect on their own',
        description: 'Before, they never connected automatically.',
      },
      {
        title:
          "In the desktop app, the connection picker's checkmark always marks the open tab's connection",
        description: 'It could point at another connection after you switched tabs.',
      },
      {
        title: 'Restarting Beamlynx no longer makes tabs forget their connection',
        description: 'Each tab was reset to "not connected" before the server could reconnect it.',
      },
      {
        title: 'A failed reconnect from the connection picker shows an error',
        description:
          "This happens when a saved connection was deleted or renamed, or its database can't be reached. Before, nothing appeared on screen.",
      },
      {
        title: "In the desktop app, a saved connection that isn't live shows a hollow dot",
        description: 'Before, every saved connection showed a solid dot, connected or not.',
      },
      {
        title:
          "In the desktop app, a tab no longer shows its connection's host:port at start-up before its name",
        description: 'It shows a neutral placeholder until the name loads.',
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
        title: 'A failed connection attempt shows an error',
        description:
          'Before, the "connecting" spinner just stopped, for example with a wrong password or an unreachable database.',
      },
      {
        title: 'A connection restored from a past session shows as connected only if it really is',
        description: "The server's connections don't survive a restart, so Beamlynx checks first.",
      },
      {
        title: "When you're not connected, the connection picker opens for you",
        description:
          'If you have no connections yet, the form to add one opens. Before, you only saw "Not connected to database".',
      },
    ],
  },
  {
    version: '0.46.1',
    date: '2026-08-03',
    fixed: [
      {
        title: "The playground's shared connection can't be deleted",
        description: 'Deleting it broke the playground for everyone.',
      },
      {
        title: 'The Updates list no longer says "-1 days ago" for a change made today',
        description: 'This happened when your time zone is behind UTC.',
      },
    ],
  },
  {
    version: '0.46.0',
    date: '2026-08-03',
    added: [
      {
        title: 'Tabs come back after a reload',
        description: 'Each keeps its Pine or SQL text, input mode and connection.',
      },
      {
        title: "Ctrl/Cmd+S saves the tab's Pine expression as a .pine file",
      },
      {
        title:
          '"List Database Connections" and "New Database Connection" are in the command palette',
      },
    ],
    fixed: [
      {
        title: 'Tab cycles through Pine suggestions while the graph has focus',
        description: "Before, it moved between the graph's nodes and edges instead.",
      },
    ],
  },
  {
    version: '0.45.2',
    date: '2026-08-02',
    fixed: [
      {
        title: 'The notification bell shows unread updates in the warm accent color, not blue',
      },
    ],
  },
  {
    version: '0.45.1',
    date: '2026-08-02',
    fixed: [
      {
        title:
          'In the desktop app, saved connections show their color and name in the connection picker',
      },
      {
        title: "The connection dialog opens by itself only when there's nothing to connect to",
        description: 'Before, it opened even when you had saved or active connections.',
      },
    ],
    changed: [
      {
        title: 'The notification bell no longer shakes for new updates',
        description: 'It still changes color.',
      },
    ],
  },
  {
    version: '0.45.0',
    date: '2026-08-02',
    added: [
      {
        title: 'Beamlynx runs as a desktop app, with no Docker needed',
      },
      {
        title: 'The desktop app has shortcuts for the command palette and tabs',
        description:
          'Ctrl/Cmd+K opens the command palette, Ctrl/Cmd+T opens a tab and Ctrl/Cmd+W closes it.',
      },
      {
        title: 'The desktop app shows update progress',
        description: 'Before, updates only ran in the background.',
      },
      {
        title: 'The desktop app remembers your saved connections between sessions',
        description:
          "They're encrypted with your device's secure storage. The browser version still never stores credentials.",
      },
    ],
    changed: [
      {
        title: 'The desktop app hides the small server version label',
        description: 'The desktop app has its own release notes.',
      },
    ],
  },
  {
    version: '0.44.0',
    date: '2026-07-31',
    added: [
      {
        title: 'Name an intermediate result with |= name and reuse it in later expressions',
        description:
          'A new editor holds several expressions. Named results and checkpoints (group: and limit: steps) show in the graph as boxes you can collapse, joined like tables.',
      },
      {
        title: 'Paste a Postgres connection string to fill in the connection fields',
        description:
          'For example postgresql://user:password@host:5432/database. The field is masked like a password, so password managers can fill it in.',
      },
      {
        title: 'Delete a saved connection from the connection picker',
        description: 'Click its trash icon, then click again to confirm.',
      },
    ],
    fixed: [
      {
        title: 'Typing in the Pine input no longer slows down as you add expressions',
      },
      {
        title: 'Autocomplete shows "Loading..." instead of "Nothing found" while it loads',
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

export const LATEST_VERSION = '0.71.0';
