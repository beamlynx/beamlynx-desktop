# Third-party package manager distribution

Distributing beamlynx-desktop outside GitHub Releases: Homebrew is live,
AUR is still a draft.

## Homebrew (macOS only)

Live, not a draft -- see the separate `beamlynx/homebrew-tap` repo
(`Casks/beamlynx.rb`). Install with `brew install --cask
beamlynx/tap/beamlynx`. Bumping it per release is part of this repo's own
`RELEASING.md` checklist now (step 11), not covered here.

## Arch Linux / AUR

`aur/PKGBUILD` + `aur/beamlynx-desktop-bin.install` + `aur/.SRCINFO` build
`beamlynx-desktop-bin`, repackaging the `.deb` release asset (which already
has the right FHS layout) rather than building from source. Not live yet --
these files are a starting point, not something CI consumes today.
Verified locally with `makepkg` against the real 0.1.15 `.deb` -- package
builds clean and lays down `/opt/beamlynx`, `/usr/bin/beamlynx-desktop`
(symlink), desktop file, and hicolor icons correctly. Not yet verified with
a real `makepkg -si` install + launch on this machine (that step needs
`sudo` and alters real system state, so it was left for you to run
deliberately rather than done as part of drafting this).

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
