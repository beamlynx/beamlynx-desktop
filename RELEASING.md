# Releasing beamlynx-desktop

beamlynx-desktop is versioned and released independently of `pine-lang` and
`beamlynx-ui` — do not conflate version numbers across the three. Tag
pattern is a plain `X.Y.Z` (no prefix) — this repo has its own tag
namespace, so there's no collision to disambiguate against.

Unlike `pine-lang`/`beamlynx-ui`, this repo doesn't use a PR-review release
flow — a pushed tag directly triggers the build. Reviewing the diff before
tagging is still worthwhile; do it on the `release/X.Y.Z` branch before
merging, rather than via a PR.

## Checklist

1. Create branch `release/X.Y.Z` from `main`.

2. **Pin `bundled-versions.json` to an exact commit SHA, not a branch name** — `git rev-parse <branch>` on each of `pine-lang` and `beamlynx-ui`. This matters: a branch pin silently bundles whatever that branch's HEAD happens to be at tag-push time, which has previously (0.1.8, 0.1.9) produced a release missing work that had already been committed to the branch but wasn't accounted for when the tag was cut. A SHA pin makes exactly what's bundled explicit and reviewable in this file's own diff. Once the pinned fixes land in a real tagged `pine-lang`/`beamlynx-ui` release, switch to that tag instead of a SHA.

3. Bump `package.json` → `"version": "X.Y.Z"`, then run `mise exec node@20.20.2 -- npm install --package-lock-only` (electron-builder needs a newer Node than this machine's default) to keep `package-lock.json`'s version field in sync — don't forget this, it's easy to skip since nothing else visibly breaks if you do.

4. Move the `## [Unreleased]` section in `CHANGELOG.md` into a new `## [X.Y.Z] - YYYY-MM-DD` section (today's date), leaving `## [Unreleased]` empty.

5. Commit all changed files, push the branch.

6. **Before merging or tagging**, watch `.github/workflows/ci.yml` run on that branch/commit and confirm it passes (`gh run watch <run-id> --exit-status`). It's a cheap unpacked-build sanity check — much faster to catch a break here than in the full 3-OS release build.

7. Merge the branch to `main` (push directly — no branch protection rule observed on this repo, unlike `pine-lang`'s `master`).

8. Tag `main` as `X.Y.Z` and push the tag:
   ```
   git tag X.Y.Z && git push origin X.Y.Z
   ```
   This triggers `.github/workflows/release.yml` — builds Linux/macOS/Windows installers and publishes them to a GitHub Release.

9. Watch the release workflow through to completion (`gh run watch <run-id> --exit-status`) — it takes longer than CI (full matrix build + sequential publish job).

10. Verify the published release before announcing:
    - `gh release view X.Y.Z` — confirm the expected assets are present: `beamlynx.AppImage` (stable, unversioned filename), `beamlynx-X.Y.Z.deb`, `beamlynx-X.Y.Z.dmg` + `.blockmap`, `beamlynx-X.Y.Z.exe` + `.blockmap`, `latest.yml`/`latest-mac.yml`/`latest-linux.yml`.
    - Download at least the Linux artifact and confirm a real database connection + query round-trip works.

11. **Update the personal Homebrew tap** (`beamlynx/homebrew-tap`, separate repo) so `brew install --cask beamlynx/tap/beamlynx` / `brew upgrade --cask` picks up this release:
    - Compute the real dmg sha256 from the published asset (don't reuse a locally-rebuilt dmg — it won't match): `gh release download X.Y.Z -R beamlynx/beamlynx-desktop -p '*.dmg' -O /tmp/beamlynx-X.Y.Z.dmg && shasum -a 256 /tmp/beamlynx-X.Y.Z.dmg`.
    - In `beamlynx/homebrew-tap`, edit `Casks/beamlynx.rb`: bump `version` to `X.Y.Z` and `sha256` to the hash above.
    - Commit (e.g. `Bump to X.Y.Z`) and push directly — like this repo, the tap has no PR-review flow.
    - This step is mandatory on every release, not just ones that touch macOS-specific code — the tap always points at the latest dmg regardless of what changed.

## Local dev/test workflow

See `DEVELOPMENT.md` for how to iterate on changes before cutting a release — it covers the fast browser-based path for most UI changes, and how to run the real Electron shell (menu, native window, bundled server) when that's what's actually being changed.

## Code signing

See `SIGNING.md`. Builds are unsigned until the relevant secrets are configured; this doesn't block a release, just leaves Gatekeeper/SmartScreen warnings on macOS/Windows installers.
