# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]
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
