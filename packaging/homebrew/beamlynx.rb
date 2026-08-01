# Draft Cask for a separate `beamlynx/homebrew-tap` repo (Casks/beamlynx.rb).
# NOT consumed by this repo's CI yet -- see packaging/README.md for what's
# still manual (creating the tap repo, wiring a bump workflow, verifying
# Gatekeeper behavior on an unsigned build).
#
# Homebrew Cask, not Formula: this ships a packaged Electron GUI app, not
# something built from source or a CLI binary. Casks are macOS-only --
# Homebrew on Linux does not install GUI .app bundles this way, so this file
# has no bearing on the Arch/AUR path (see packaging/aur/PKGBUILD).
cask "beamlynx" do
  version "0.1.5"
  # `brew bump-cask-pr` (or a hand run of `shasum -a 256`) recomputes this
  # against the real dmg -- update this by hand per release until the tap
  # repo's bump automation exists.
  sha256 "08ac71583617b3c7b76c20dc45bc194898bd584c6d65f29a99c738290b1b0515"

  url "https://github.com/beamlynx/beamlynx-desktop/releases/download/#{version}/beamlynx-#{version}.dmg"
  name "beamlynx"
  desc "Desktop app bundling the pine-lang server and beamlynx-ui UI, no Docker required"
  homepage "https://github.com/beamlynx/beamlynx-desktop"

  # GitHub's macos-latest runner has been Apple Silicon (arm64) since 2024,
  # and electron-builder.yml's mac.target doesn't set an explicit arch
  # array, so the published dmg is arm64-only. Decided to ship arm64-only
  # for now rather than add an Intel (x64) leg to release.yml's package
  # matrix first -- most Macs from the last ~4 years are arm64, and this
  # restriction means an Intel colleague gets a clear "not supported"
  # instead of a cask that installs but doesn't launch. Revisit if that
  # turns out to matter.
  depends_on arch: :arm64

  app "beamlynx.app"

  # electron-updater is bundled and active (src/main/auto-update.ts calls
  # checkForUpdatesAndNotify unconditionally) -- it will keep the app
  # current independent of Homebrew. Setting auto_updates true stops
  # `brew upgrade --cask` from fighting it by reinstalling over a
  # newer-than-catalog copy.
  auto_updates true

  # release.yml builds unsigned/unnotarized (see SIGNING.md). Homebrew Cask
  # quarantines downloads by default, so Gatekeeper may block first launch
  # until the user right-clicks > Open, or the app is code-signed &
  # notarized upstream. Confirmed only in theory here -- no Mac was
  # available to test this cask end-to-end before drafting it.
  caveats <<~EOS
    This build is unsigned. If macOS Gatekeeper blocks the first launch,
    right-click beamlynx.app in Finder and choose Open, or run:
      xattr -dr com.apple.quarantine "#{appdir}/beamlynx.app"
  EOS

  zap trash: [
    "~/Library/Application Support/beamlynx",
    "~/Library/Saved Application State/com.beamlynx.desktop.savedState",
    "~/Library/Preferences/com.beamlynx.desktop.plist",
    "~/Library/Logs/beamlynx",
  ]
end
