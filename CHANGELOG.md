# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.1.5] - 2026-08-01
### Changed
- No functional change -- verifies that differential/delta auto-update still works now that the new AppImage toolset embeds the blockmap inside the binary instead of publishing it as a separate sidecar file.

## [0.1.4] - 2026-08-01
### Fixed
- The Linux AppImage no longer requires FUSE to run. Many distros (Arch, Ubuntu 22.04+, Fedora, etc.) don't ship `libfuse.so.2` by default anymore, which made the AppImage fail outright with "dlopen(): error loading libfuse.so.2" unless the user separately installed `fuse2` or ran it with `--appimage-extract-and-run`. Switched to electron-builder's newer static, FUSE-less AppImage runtime (`toolsets.appimage: "1.0.3"`), which needed bumping `electron-builder` from 24.x to 26.x.

## [0.1.3] - 2026-08-01
### Changed
- No functional change -- verifies an installed 0.1.2 correctly detects, downloads, and applies this version via electron-updater (the actual M5 gate test).

## [0.1.2] - 2026-08-01
### Added
- Console logging for auto-update lifecycle events (checking/available/downloading/downloaded), needed to actually observe the round-trip while verifying it -- previously silent unless something errored.

## [0.1.1] - 2026-08-01
### Changed
- No functional change -- this release exists to verify the auto-update round-trip (an installed 0.1.0 correctly detects, downloads, and applies this version).

## [0.1.0] - 2026-08-01
### Added
- Initial release: an Electron app that bundles the pine-lang server (as a
  self-contained jpackage runtime, no Docker required) and a static export of
  beamlynx-ui, so the two can never drift out of version sync.
- Auto-update via electron-updater and GitHub Releases.
- Linux (AppImage, deb) and Windows (nsis) installers; macOS (dmg) unsigned
  for now -- code signing/notarization is a separate, later milestone.
