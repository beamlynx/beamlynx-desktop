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
    version: '0.37.0',
    date: '2026-02-08',
    added: [
      {
        description: 'Resizable sidebar functionality. The sidebar width can now be adjusted by dragging the divider',
      },
    ],
    changed: [
      {
        description: 'Improved dark theme candidate node contrast for better visibility',
      },
    ],
  },
  {
    version: '0.36.0',
    date: '2026-01-09',
    added: [
      {
        description: 'Command palette for finding and running commands. This is similar to how VS Code lets you find and run commands.',
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
        description: 'Pine operations will not be shown in suggestions e.g. when pressing `Tab`, etc',
      },
    ],
    fixed: [
      {
        description: 'The candidate node was not being selected when cycling through suggestions. This was only happening when there were multiple nodes with the same table name',
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

export const LATEST_VERSION = '0.37.0';
