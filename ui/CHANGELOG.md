# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

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
