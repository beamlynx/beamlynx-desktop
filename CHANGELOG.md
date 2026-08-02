# Change Log

All notable changes to this project will be documented in this file. This change
log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [Unreleased]

## [0.1.11] - 2026-08-02
### Fixed
- User preferences (vim mode, sidebar width, theme, etc.) could silently revert after an auto-update -- Chromium buffers localStorage writes and only periodically flushes them to disk, and the abrupt quit-and-relaunch auto-update performs could race that flush and lose whatever hadn't been written yet. Both quit paths now force a flush (`session.flushStorageData()`) before quitting.

## [0.1.10] - 2026-08-02
### Added
- Auto-update progress is now shown in-app (bundled from `beamlynx-ui`'s `DesktopUpdateBanner`) -- "Downloading update... NN%", then "Update ready -- Restart to install". Replaces the previous console-only/native-OS-notification behavior (`checkForUpdatesAndNotify()` swapped for `checkForUpdates()` to avoid a redundant native toast alongside the in-app one).

## [0.1.9] - 2026-08-02
### Added
- A loading splash (`assets/loading.html`) shown immediately on launch, instead of a blank window for several seconds while the bundled server boots.
- Desktop-only keybindings: `Ctrl/Cmd+K` (command palette), `Ctrl/Cmd+T` (new tab), `Ctrl/Cmd+W` (close tab), bundled from `beamlynx-ui`'s `desktop-app` branch. See its `utils/keybindings.ts`.
- `DEVELOPMENT.md` documenting the local dev/test workflow.

### Changed
- An explicit application menu, so `Ctrl/Cmd+W` reaches the page's own close-tab handler instead of Electron's default menu closing the whole window.
- The connected server's version chip (e.g. `[0.37.0]`) no longer shows in the UI -- bundled from the same `beamlynx-ui` commit as the keybindings above.

### Fixed
- The window now appears immediately on launch instead of only after the bundled server finishes booting (up to ~15s).

## [0.1.8] - 2026-08-02
### Changed
- Sign-in is no longer required -- reverts the Clerk auth added in 0.1.6. Google OAuth's redirect flow doesn't work from a `file://`-loaded static export ("The provided redirect url has a prohibited URL scheme"), and email/password-only auth wasn't enough on its own to justify keeping it. Desktop goes back to the pre-0.1.6 behavior: no login screen, `[Desktop]` label shown instead of the user box.

## [0.1.7] - 2026-08-01
### Changed
- No functional change -- verifies that a symlink pointing at the stable `beamlynx.AppImage` filename (introduced in 0.1.6) survives an actual auto-update instead of dangling.

## [0.1.6] - 2026-08-01
### Added
- Sign-in is now required, matching the hosted product, via `beamlynx-ui`'s `desktop-app` branch (client-side Clerk gating, since a static export can't run `middleware.ts`). Not present in any earlier release -- this is the first one that includes it.

### Fixed
- The Linux AppImage's filename no longer changes across auto-updates (was `beamlynx-X.Y.Z.AppImage`, now a stable `beamlynx.AppImage`) -- previously, a symlink pointing at a specific version's filename would dangle the moment the app self-updated.

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
