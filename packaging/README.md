# Third-party package manager distribution

Drafts for distributing beamlynx-desktop outside GitHub Releases. Neither
path is live yet -- these files are a starting point, not something CI
consumes today.

## Homebrew (macOS only)

`homebrew/beamlynx.rb` is a **Cask** (packaged GUI app), not a Formula
(Formulas are for CLI tools / source builds). Casks are macOS-only --
Homebrew-on-Linux has no equivalent for a GUI .app bundle, so this doesn't
help Arch.

To ship it:
1. Create a new repo `beamlynx/homebrew-tap` with `Casks/beamlynx.rb` at
   its root (copy of the draft here). Skip the official `homebrew-cask`
   tap for now -- it has a notability bar and PR review latency; a
   personal tap installs immediately via
   `brew install --cask beamlynx/tap/beamlynx`.
2. Fill in the real `sha256` of the release dmg (`shasum -a 256
   beamlynx-<version>.dmg`), and keep it updated per release -- either by
   hand or with `brew bump-cask-pr` / a small workflow in the tap repo that
   runs on beamlynx-desktop's release event. That workflow needs a PAT
   with write access to the tap repo (the release workflow's own
   `GITHUB_TOKEN` can't write to a different repo).
3. **Verify the arch match before publishing.** `electron-builder.yml`'s
   `mac.target` doesn't pin an arch, and GitHub's `macos-latest` runner has
   been Apple Silicon since 2024 -- the current dmg is likely arm64-only.
   The draft cask pins `depends_on arch: :arm64` to reflect that; either
   keep that restriction, or add an `macos-13` (Intel) leg to
   `release.yml`'s package matrix and ship both.
4. **Verify Gatekeeper behavior end-to-end on a real Mac before
   publishing.** `SIGNING.md` confirms the build is unsigned/unnotarized;
   Homebrew Cask quarantines downloads by default, which may block first
   launch. This was drafted without access to a Mac to test on.
5. `electron-updater` is active in the packaged app regardless of install
   method (`src/main/auto-update.ts` calls
   `checkForUpdatesAndNotify()` unconditionally) -- the cask sets
   `auto_updates true` so `brew upgrade --cask` doesn't fight it.

## Arch Linux / AUR

`aur/PKGBUILD` + `aur/beamlynx-desktop-bin.install` + `aur/.SRCINFO` build
`beamlynx-desktop-bin`, repackaging the `.deb` release asset (which already
has the right FHS layout) rather than building from source. Verified
locally with `makepkg` against the real 0.1.5 `.deb` -- package builds
clean and lays down `/opt/beamlynx`, `/usr/bin/beamlynx-desktop` (symlink),
desktop file, and hicolor icons correctly. Not yet verified with a real
`makepkg -si` install + launch on this machine (that step needs `sudo` and
alters real system state, so it was left for you to run deliberately
rather than done as part of drafting this).

To ship it:
1. Create an AUR account and register an SSH key
   (https://aur.archlinux.org/register), if you don't have one already.
2. Bump `pkgver`/`sha256sums` per release (`updpkgsums` recomputes the
   hash) and regenerate `.SRCINFO` (`makepkg --printsrcinfo >
   .SRCINFO`) -- this repo's release workflow doesn't do this
   automatically; either script it as a follow-up (needs the AUR SSH deploy
   key as a repo secret) or do it by hand per release for now.
3. `git clone ssh://aur@aur.archlinux.org/beamlynx-desktop-bin.git`,
   copy `PKGBUILD` + `.install` + `.SRCINFO` in, commit, push.
4. Check name availability on the AUR first
   (https://aur.archlinux.org/packages/beamlynx-desktop-bin) -- and note
   `provides`/`conflicts` are set on `beamlynx-desktop` (the actual binary
   name inside the .deb), not `beamlynx`, so this doesn't collide with the
   unrelated `beamlynx-cli` project if that ever ships a package of its
   own.

## Not covered here

- Flatpak / Snap -- not investigated, would need their own manifests.
- `homebrew-core` / official `homebrew-cask` / official Arch `extra`
  submission -- both have maintainer review and eligibility bars beyond
  what's needed for a personal tap + AUR, out of scope until there's
  real install-base demand.
