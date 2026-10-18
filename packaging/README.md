# Third-party package manager distribution

Distributing beamlynx-desktop outside GitHub Releases: a Homebrew tap for
macOS and an AUR package for Arch Linux.

## Homebrew (macOS only)

Live, not a draft -- see the separate `beamlynx/homebrew-tap` repo
(`Casks/beamlynx.rb`). Install with `brew install --cask
beamlynx/tap/beamlynx`. Bumping it per release is part of this repo's own
`RELEASING.md` checklist now (step 11), not covered here.

## Arch Linux / AUR

The AUR package is `beamlynx-bin`. Arch users install it with an AUR helper,
for example `yay -S beamlynx-bin`, and start the app with `beamlynx`.

It repackages the `.deb` release asset instead of building from source. The
AUR requires the `-bin` suffix for that. A plain `beamlynx` name is left for
a from-source package, and `provides=('beamlynx')` lets helpers find this one
under that name.

The files in `aur/` are the source of truth. The AUR has its own git repo,
`ssh://aur@aur.archlinux.org/beamlynx-bin.git`, and you publish by copying
these files into it and pushing. Nothing in CI does this.

### Publish a new version

`RELEASING.md` step 12 runs this after every release.

1. In `aur/PKGBUILD`, set `pkgver` to the new version and `pkgrel=1`.
2. Update both `sha256sums`: the `.deb` from the release, and the `LICENSE`
   file at that tag. `updpkgsums` (from `pacman-contrib`) does both.
3. Test it: `makepkg -si`, then launch `beamlynx`.
4. Regenerate the metadata: `makepkg --printsrcinfo > .SRCINFO`.
5. Copy `PKGBUILD`, `.SRCINFO` and `beamlynx-bin.install` into your clone of
   the AUR repo, commit, and `git push origin master`.
6. Commit the same changes here through a PR.

### First-time setup

Pushing needs an AUR account with your SSH public key added
(https://aur.archlinux.org/register), and this in `~/.ssh/config`:

```
Host aur.archlinux.org
  IdentityFile ~/.ssh/id_ed25519
  User aur
```

## Not covered here

- Flatpak / Snap -- not investigated, would need their own manifests.
- `homebrew-core` / official `homebrew-cask` / official Arch `extra`
  submission -- both have maintainer review and eligibility bars beyond
  what's needed for a personal tap + AUR, out of scope until there's
  real install-base demand.
