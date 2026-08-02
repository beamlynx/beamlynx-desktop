export interface ChangelogItem {
  description: string;
  example?: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  added?: ChangelogItem[];
  changed?: ChangelogItem[];
  fixed?: ChangelogItem[];
  security?: ChangelogItem[];
  breaking?: ChangelogItem[];
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '0.46.0',
    date: '2026-08-03',
    added: [
      {
        description:
          'Tabs (Pine/SQL text, input mode, connection) are now restored on reload instead of always starting from a single blank session.',
      },
      {
        description:
          "`Ctrl/Cmd+S` (\"Save Tab\") downloads the active tab's Pine expression as a `.pine` file.",
      },
      {
        description:
          'New "List Database Connections" / "New Database Connection" command palette entries.',
      },
    ],
    fixed: [
      {
        description:
          "Pressing Tab while the graph had focus was falling through to React Flow's own node/edge navigation instead of cycling through Pine completion candidates.",
      },
    ],
  },
  {
    version: '0.45.2',
    date: '2026-08-02',
    fixed: [
      {
        description:
          "The notification bell's color (for unread updates) was showing as blue instead of the intended warm accent.",
      },
    ],
  },
  {
    version: '0.45.1',
    date: '2026-08-02',
    fixed: [
      {
        description:
          'In the desktop app, saved connections weren\'t showing their color or proper name in the connection picker.',
      },
      {
        description:
          'The "Database Connection" dialog no longer pops up automatically when you already have saved or active connections to pick from -- it now only does that when there\'s genuinely nothing to connect to yet.',
      },
    ],
    changed: [
      {
        description:
          "The notification bell no longer shakes when there's something new -- it still changes color, just more subtly.",
      },
    ],
  },
  {
    version: '0.45.0',
    date: '2026-08-02',
    added: [
      {
        description: 'Beamlynx can now be downloaded and run as a desktop app, with no Docker required.',
      },
      {
        description:
          'New keyboard shortcuts in the desktop app: `Ctrl/Cmd+K` for the Command Palette, `Ctrl/Cmd+T` for a new tab, `Ctrl/Cmd+W` to close a tab.',
      },
      {
        description: 'The desktop app now shows update progress in-app, instead of only in the background.',
      },
      {
        description:
          "In the desktop app, your saved connections are now remembered between sessions, encrypted using your device's own secure storage. The hosted/browser version is unchanged -- it still never stores credentials.",
      },
    ],
    changed: [
      {
        description:
          "The small server-version label is now hidden in the desktop app, since it has its own separate release notes.",
      },
    ],
  },
  {
    version: '0.44.0',
    date: '2026-07-31',
    added: [
      {
        description:
          'Pine variables: write multi-expression queries and name/reuse an intermediate result with `|= name` in a new multi-expression editor. Variables and checkpoint (`group:`/`limit:`) results render in the graph as collapsible container nodes, with the same FK-relation handles and join-type-aware (solid/dashed) edges as regular tables.',
      },
      {
        description:
          'The database connection dialog accepts a Postgres connection string (`postgresql://user:password@host:5432/database`) and parses it to fill in the host/port/user/password/database fields; manual entry stays the default, with pasting a string as a secondary, collapsible option. The connection string field is masked like a password so password managers can autofill it.',
      },
      {
        description:
          "The connection picker can remove a saved connection (click its trash icon to arm, click again to confirm), backed by pine-lang's new DELETE endpoint.",
      },
    ],
    fixed: [
      {
        description:
          'Typing lag in the Pine input that worsened with more expression blocks/variables (unnecessary CodeMirror rebuilds on every keystroke).',
      },
      {
        description:
          'The autocomplete dropdown now shows a "Loading..." state instead of flashing "Nothing found" while results are still loading.',
      },
    ],
    breaking: [
      {
        description: 'Minimum required server version is now `0.37.0`.',
      },
    ],
  },
  {
    version: '0.43.0',
    date: '2026-05-21',
    added: [
      {
        description:
          'Connection picker in each tab: click the connection dot to switch which database that tab queries (by @Koziar).',
      },
    ],
    breaking: [
      {
        description: 'Minimum required server version is now `0.36.0`.',
      },
    ],
  },
  {
    version: '0.42.0',
    date: '2026-05-05',
    added: [
      {
        description:
          'Per-session database connections: each tab can connect to a different database. Queries from that tab always use its own connection.',
      },
      {
        description:
          'Connection color indicators: each database gets a distinct color shown in the header and tab bar. Click the dot to pick a different color. Colors are saved across sessions.',
      },
    ],
    breaking: [
      {
        description: 'Minimum required server version is now `0.35.0`.',
      },
    ],
  },
  {
    version: '0.41.0',
    date: '2026-05-04',
    added: [
      {
        description:
          'Command palette entries to copy the current Pine expression and the current SQL.',
      },
      {
        description:
          'Copying SQL (command palette or SQL panel click) prepends each line of the Pine expression as `--` line comments above the SQL.',
      },
    ],
  },
  {
    version: '0.40.0',
    date: '2026-04-20',
    added: [
      {
        description:
          'Column hints for the `update!` / `u!` operation. Typing `u!` or `u! col = val,` suggests remaining assignable columns.',
      },
    ],
    breaking: [
      {
        description: 'Minimum required server version: 0.33.0',
      },
    ],
  },
  {
    version: '0.39.1',
    date: '2026-03-30',
    added: [
      {
        description:
          'Multi-table `update!` support: assignments targeting different tables now run as separate UPDATE queries.',
      },
    ],
    fixed: [
      {
        description:
          'Recursive delete no longer follows heuristic relations. Only tables with real foreign key constraints are included in the generated DELETE statements.',
      },
      {
        description:
          '`update!` now correctly uses table aliases when columns are qualified (e.g. `c.name`).',
      },
    ],
  },
  {
    version: '0.39.0',
    date: '2026-02-18',
    fixed: [
      {
        description:
          'Sticky column headers in the results table. The table header now stays visible when scrolling through results (by @Koziar)',
      },
    ],
  },
  {
    version: '0.38.0',
    date: '2026-02-16',
    added: [
      {
        description:
          'Table color decoration for Pine expressions and results. Expression segments and result columns are color-coded by table to help visualize the relationship between them (collaboration with @Koziar)',
      },
    ],
    changed: [
      {
        description:
          'Use server-side prettified expression and ranges from the build endpoint instead of client-side expression parsing. This fixes incorrect highlighting when string values contain `|` characters',
      },
    ],
    breaking: [
      {
        description: 'Minimum required server version: 0.31.0',
      },
    ],
  },
  {
    version: '0.37.1',
    date: '2026-02-08',
    fixed: [
      {
        description:
          'Notification bell animation no longer affects scrollbars by preventing layout shifts during animation',
      },
    ],
  },
  {
    version: '0.37.0',
    date: '2026-02-08',
    added: [
      {
        description:
          'Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider (by @Koziar)',
      },
    ],
    changed: [
      {
        description:
          'Improved dark theme candidate node contrast for better visibility (by @Koziar)',
      },
    ],
  },
  {
    version: '0.36.0',
    date: '2026-01-09',
    added: [
      {
        description:
          'Command palette for finding and running commands. This is similar to how VS Code lets you find and run commands.',
      },
    ],
  },
  {
    version: '0.35.1',
    date: '2025-12-26',
    added: [
      {
        description: 'Support for hints at cursor position',
      },
      {
        description: 'Notification bell animates when there are unread updates',
      },
    ],
    changed: [
      {
        description:
          'Pine operations will not be shown in suggestions e.g. when pressing `Tab`, etc',
      },
    ],
    fixed: [
      {
        description:
          'The candidate node was not being selected when cycling through suggestions. This was only happening when there were multiple nodes with the same table name',
      },
    ],
  },
  {
    version: '0.34.0',
    date: '2025-12-08',
    added: [
      {
        description:
          'Option to render bar chart when results have 2 column with string and number values respectively',
      },
    ],
  },
  {
    version: '0.33.0',
    date: '2025-10-21',
    added: [
      {
        description: 'Show the changelog',
      },
    ],
  },
  {
    version: '0.32.0',
    date: '2025-10-19',
    added: [
      {
        description: 'Support for comments (line and block) in the pine language',
        example: '-- This is a line comment\n/* This is a\n   multi-line\n   block comment */',
      },
    ],
    fixed: [
      {
        description: 'The graph was shown when there was an error in the expression',
      },
    ],
    changed: [
      {
        description: 'Showing a toggle button to switch between pine and sql modes',
      },
    ],
  },
  {
    version: '0.31.5',
    date: '2025-09-16',
    changed: [
      {
        description: 'Updated intro page with examples that are compatible with the playground',
      },
      {
        description:
          'Support for `?data=<encoded-object-with-expression>` URL parameter which is json encoded object containing the expression',
      },
    ],
  },
  {
    version: '0.31.2',
    date: '2025-09-11',
    changed: [
      {
        description: 'Using a company toggle button to switch input modes between pine and sql',
      },
    ],
  },
  {
    version: '0.31.1',
    date: '2025-09-11',
    changed: [
      {
        description:
          'Update model is not shown by default. It is shown when the inspect icon is clicked',
      },
    ],
  },
  {
    version: '0.31.0',
    date: '2025-09-10',
    added: [
      {
        description: 'Showing an update modal before updating a record',
      },
    ],
    changed: [
      {
        description: 'Farewell to the success messages',
      },
    ],
  },
  {
    version: '0.30.1',
    date: '2025-09-07',
    added: [
      {
        description: 'Support for SQL mode',
      },
    ],
  },
  {
    version: '0.29.1',
    date: '2025-08-30',
    security: [
      {
        description: "The updated values weren't being escaped",
      },
    ],
  },
  {
    version: '0.29.0',
    date: '2025-08-28',
    added: [
      {
        description: 'Force the user to upgrade the server if needed',
      },
    ],
    fixed: [
      {
        description: 'Error message was not being shown when the update failed',
      },
    ],
  },
  {
    version: '0.28.1',
    date: '2025-08-26',
    added: [
      {
        description: 'Support for updating rows in the results',
      },
      {
        description: 'Filter on any value in the results using the context menu',
      },
    ],
    changed: [
      {
        description: 'Values in the results can by copied using the context menu',
      },
    ],
    fixed: [
      {
        description: 'Keybinding for reloading the tab wasn&apos;t working',
      },
      {
        description: 'Cell values shouldn&apos;t be selectable',
      },
    ],
  },
  {
    version: '0.27.3',
    date: '2025-08-20',
    fixed: [
      {
        description: 'Related tables weren&apos;t being shown when clicking a table in the graph',
      },
      {
        description: 'The keybinding to run the expression also works on Mac',
      },
    ],
    changed: [
      {
        description:
          'The connection monitor is moved together with the other menu items in the settings',
      },
      {
        description: 'The graph has a minimize / maximize button',
      },
      {
        description: 'The resizable divider is slimmer - no icons are shown',
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2025-08-19',
    added: [
      {
        description: 'Support for `?query=<expression>` URL parameter',
      },
      {
        description: 'Show the graph in the secondary view when the results are shown',
      },
    ],
  },
  {
    version: '0.26.2',
    date: '2025-08-19',
    fixed: [
      {
        description: 'Disabled user authentication for playground',
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2025-08-18',
    added: [
      {
        description: 'Setup for playground i.e. playground.beamlynx.com',
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2025-07-13',
    added: [
      {
        description: 'Welcome page for new users',
      },
      {
        description: 'Polling for server connection status',
      },
    ],
    changed: [
      {
        description: 'Default width of the sidebar is increased to 400px',
      },
    ],
  },
  {
    version: '0.24.1',
    date: '2025-07-12',
    fixed: [
      {
        description: 'Performance issue with the SQL view',
      },
      {
        description: 'Improved graph renders',
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2025-07-12',
    added: [
      {
        description: 'Autocompletions for `where:` operation',
      },
    ],
    changed: [
      {
        description:
          'The expression is prettified when a table expression is selected from the autocompletion',
      },
    ],
    fixed: [
      {
        description: 'Mouse cursor was set to &apos;pointer&apos;',
      },
      {
        description:
          'Position of the &apos;Download CSV&apos; button in compact mode was overlapping with the &apos;Run&apos; button',
      },
      {
        description:
          'Autocomplete was not showing if opened too fast. Now we always have a backup no-op completion i.e. `Nothing found`',
      },
    ],
  },
  {
    version: '0.23.0',
    date: '2025-07-07',
    added: [
      {
        description: 'Autocompletions for `select:` and `order:` operations',
      },
    ],
  },
  {
    version: '0.22.2',
    date: '2025-07-07',
    changed: [
      {
        description: 'Autocompletion is not activated automatically',
      },
    ],
  },
  {
    version: '0.22.1',
    date: '2025-07-07',
    fixed: [
      {
        description: 'Pressing `Tab` now shows the suggestions',
      },
      {
        description: 'The first suggestion is selected when the suggestions are shown',
      },
    ],
    changed: [
      {
        description: 'The expression is prettified when a pipe `|` is entered',
      },
    ],
  },
  {
    version: '0.22.0',
    date: '2025-07-07',
    added: [
      {
        description: 'Download the results as a CSV file',
      },
      {
        description: 'Autocompletion support for pine operations and table names',
      },
    ],
    changed: [
      {
        description: 'Keybinding to run the expression is changed to `Ctrl + Enter`',
      },
      {
        description: 'Run button is moved within the text input',
      },
    ],
  },
  {
    version: '0.21.1',
    date: '2025-07-04',
    fixed: [
      {
        description: 'Focus (when pressing `Tab`) goes to the input window instead of settings',
      },
      {
        description: 'Improved colors for the graph in dark mode',
      },
    ],
    changed: [
      {
        description: 'The recursive delete queries also include the pine expressions',
      },
    ],
  },
  {
    version: '0.21.0',
    date: '2025-07-02',
    added: [
      {
        description: 'Support for running analysis templates',
      },
    ],
    fixed: [
      {
        description: 'Theme was being set for each tab and not globally',
      },
    ],
  },
  {
    version: '0.20.1',
    date: '2025-07-01',
    fixed: [
      {
        description: 'The SQL view was re-rendering causing a performance issue',
      },
    ],
  },
  {
    version: '0.20.0',
    date: '2025-07-01',
    added: [
      {
        description: 'A code editor for writing pine expressions',
      },
      {
        description: 'Dark mode',
      },
      {
        description: 'Vim mode',
      },
      {
        description: 'Syntax highlighting for SQL in dark mode',
      },
    ],
    fixed: [
      {
        description:
          'Focus on the input when the Escape key is pressed. This wasn&apos;t working if the mouse was used to click on other components of the UI',
      },
    ],
  },
  {
    version: '0.19.0',
    date: '2025-05-15',
    added: [
      {
        description: 'A button to evaluate the pine expressions',
      },
      {
        description:
          'The id column in the results are clickable. This adds a where condition and limits the results to the row clicked',
      },
      {
        description:
          'For a screen size less than 1200px (i.e. lg), the we update the layout accordingly. Instead of showing the SQL query, the main view is shown',
      },
    ],
    fixed: [
      {
        description: 'Handling errors when building recursive delete queries',
      },
      {
        description:
          'The graph is rendered for each table being evaluated when doing recursive deletes',
      },
    ],
    changed: [
      {
        description: 'The graph is rendered as soon as the expression is modified',
      },
      {
        description: 'The focus goes to the node that is selected as the candidate',
      },
    ],
  },
  {
    version: '0.18.2',
    date: '2025-05-13',
    fixed: [
      {
        description:
          'The delete queries use the correct column name i.e. column used in the previous join than the first column of the table',
      },
    ],
  },
  {
    version: '0.18.1',
    date: '2025-05-09',
    added: [
      {
        description:
          'If the pine server isn&apos;t running, then the correct version is shown instead of `latest`',
      },
    ],
  },
  {
    version: '0.18.0',
    date: '2025-03-23',
    added: [
      {
        description:
          'Clicking on a suggested column (select or order) in the selected node updates the expression',
      },
    ],
    changed: [
      {
        description: 'UX for setting up pine server and connecting to the database is improved',
      },
    ],
  },
  {
    version: '0.17.0',
    date: '2025-03-15',
    added: [
      {
        description: 'The suggested nodes can be clicked to select them',
      },
    ],
  },
  {
    version: '0.16.0',
    date: '2025-03-10',
    added: [
      {
        description: 'Show the icons for the main view mode i.e. documentation, graph and results',
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2025-03-02',
    added: [
      {
        description: 'Sidebar width can be adjusted by dragging the divider',
      },
      {
        description:
          'User preferences using local storage: sidebar width is supported to begin with',
      },
    ],
  },
  {
    version: '0.14.0',
    date: '2025-02-26',
    added: [
      {
        description: 'Remember the positions when previously selected nodes in the graph are moved',
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2025-02-09',
    added: [
      {
        description: 'Database connection monitor',
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2025-02-02',
    added: [
      {
        description: 'Show the selected and suggested columns for the `order` operation',
      },
    ],
    fixed: [
      {
        description: 'The graph was not being showing on modifying the expression that just ran',
      },
      {
        description: 'The graph was not being shown when a printable character was pressed',
      },
      {
        description:
          'Sidebar width for smaller screens i.e. adjust the width when the dev console is opened',
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2025-01-11',
    added: [
      {
        description: 'Arranged the layout so that the graph can take more space',
      },
    ],
    fixed: [
      {
        description: 'When selecting a suggested node, the graph is not re-rendered',
      },
    ],
  },
  {
    version: '0.10.2',
    date: '2025-01-08',
    fixed: [
      {
        description: 'Show the suggested columns for the relevant table when alias is used',
        example: 'company as c | document | select: c.id',
      },
    ],
  },
  {
    version: '0.10.1',
    date: '2025-01-07',
    added: [
      {
        description: 'Show selected columns for tables',
      },
      {
        description: 'Show suggested columns for current table',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2024-10-25',
    added: [
      {
        description: 'Support for db connections',
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2024-10-19',
    added: [
      {
        description: 'Support for tabs i.e. multiple sessions',
      },
      {
        description: 'Support for recursive deletes',
        example: "company | id='...' | delete:",
      },
    ],
  },
  {
    version: '0.7.1',
    date: '2024-09-22',
    fixed: [
      {
        description:
          'When adding a pipe `|`, the expression was always being prettified. This wasn&apos;t allowing for adding pipes in the middle of the expression',
      },
      {
        description:
          'When a candidate is selected in the graph, entering a non-printable character was entering the name of that character to the expression',
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2024-08-23',
    added: [
      {
        description: 'Show aliases for selected tables',
      },
    ],
    changed: [
      {
        description: 'Focus on the input when `Escape` is pressed',
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2024-08-13',
    changed: [
      {
        description: 'Prettify the expression when a pipe `|` is entered',
      },
    ],
    fixed: [
      {
        description: 'Focusing out and back in the input hides the results',
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2024-08-02',
    breaking: [
      {
        description:
          '`Tab` to focus on the graph. `Esc` or `Shift + Tab` to focus back on the input',
      },
      {
        description: 'The focused frame is highlighted with a border',
      },
      {
        description: 'When focused on the input, `Enter` fetches the results',
      },
      {
        description:
          'When focused on the graph, `Enter` selects the current candidate. Any other character brings you back to the input',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2024-07-31',
    breaking: [
      {
        description: 'Fetch results using `Ctrl + Enter` instead of `Enter`',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2024-07-30',
    added: [
      {
        description: 'Support for `from: <alias>`. This lets us set the context for joins',
      },
    ],
  },
  {
    version: '0.3.2',
    date: '2024-07-26',
    changed: [
      {
        description: 'Syntax erros are shown where the query is shown',
      },
      {
        description: 'Removed deprecated code',
      },
    ],
  },
  {
    version: '0.3.1',
    date: '2024-07-22',
    changed: [
      {
        description: 'Show sql query besides the pine input',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2024-07-22',
    added: [
      {
        description: 'Copy the query on click',
      },
      {
        description: 'Support for ambiguous joins',
      },
    ],
    changed: [
      {
        description: 'Obsolete version message is shown if version is not returned from the server',
      },
      {
        description: '⏳ Fetching rows ... message is shown during query execution',
      },
      {
        description: 'Clerk is not needed in development more',
      },
      {
        description: 'Sql query is indented:`tabular-right`',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2024-07-11',
    added: [
      {
        description: 'Clicking on a cell copies the value to the clipboard',
      },
    ],
    fixed: [
      {
        description: 'Navigation was breaking in case there were no candidates to select from',
      },
      {
        description:
          'In some cases, clicking on a cell would duplicate the rows / throw an error on moving away from the cell',
      },
    ],
  },
  {
    version: '0.1.1',
    date: '2024-07-08',
    changed: [
      {
        description: 'The graph now takes the full screen height',
      },
    ],
  },
];

export const LATEST_VERSION = '0.46.0';
