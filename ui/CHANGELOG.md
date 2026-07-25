# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]
### Added
- A selected table node now shows one connection handle per distinct FK relation instead of a single shared handle per side — e.g. a table with two FK columns to the same parent table gets two separate, labeled handles on that side. (Superseded the join-relation-on-edges entry from this same series — the column is now shown on the handle instead of the edge.)

### Fixed
- A node's lone relation handle (only one FK relation on that side) now shows its column label instead of staying an anonymous dot — a single dot could be any column, so it's identified the same as multi-handle sides.
- Expanding a checkpoint/variable container's inner-table list no longer overlaps the relation handle labels below it — the container now grows to fit the expanded list.
- Editor sluggishness that worsened with more expression blocks/variables: the Pine input's CodeMirror extensions were being fully reconfigured on every keystroke instead of only when the AST or theme actually changed.
- Remaining typing lag/dropped keystrokes in the Pine input: the read-only SQL panel's CodeMirror view was being destroyed and rebuilt on every keystroke, because its click handler unnecessarily depended on the Pine expression.
- Candidate node in the graph briefly flickering back to a plain suggestion right after pressing Tab, caused by a redundant hints rebuild when the cursor hadn't actually moved.
- Autocomplete dropdown incorrectly showing "Nothing found" while results were still loading; it now shows a distinct "Loading..." state, and neither that nor a genuine "Nothing found" is styled like a selected candidate anymore.

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
