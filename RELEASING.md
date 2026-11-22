# Releasing Beamlynx

One release ships everything in this repo: the desktop app, with the Pine server and the UI from the same commit inside it.

Only the desktop app gets a tag, a plain `X.Y.Z`. That tag starts `.github/workflows/release.yml`, and installed apps update from the GitHub Release it makes. Pine keeps its own version number, bumped in the same release PR without a tag of its own. The UI checks it against `RequiredVersion`. The UI has no version of its own.

There are two changelogs. `desktop/CHANGELOG.md` is the app's: the app's What's New is generated from it at build time. `pine/CHANGELOG.md` is the language's. `ui/CHANGELOG.md` ended at 0.79.0.

## Checklist

1. **Branch.** Create `release/X.Y.Z` from `main`, where X.Y.Z is the desktop app's next version.

2. **What changed?** Since the last release tag, list the changes in each folder:

   ```sh
   last=$(git describe --tags --abbrev=0 --match '[0-9]*.[0-9]*.[0-9]*')
   git log --oneline "$last"..main -- pine
   git log --oneline "$last"..main -- ui
   git log --oneline "$last"..main -- desktop
   ```

   Skip the steps for a folder with no changes.

3. **Pine** (`pine/`), if it changed:
   - Run the formatter: `clojure -M:fmt fix`.
   - Bump `src/pine/version.clj`.
   - Move `## [Unreleased]` in `CHANGELOG.md` into a new `## [A.B.C] - YYYY-MM-DD` section.
   - Read those entries. Each one that someone would notice in the app must also be in `desktop/CHANGELOG.md`, written as what they notice. Add any that are missing.

4. **UI** (`ui/`), if it changed:
   - Decide whether `RequiredVersion` in `constants.ts` has to rise to the new Pine version. Decide it from what the UI's changes call on the server. Don't add a changelog entry for it: the desktop app always bundles a matching Pine. Mention it in the release PR's description.

5. **The agent's Pine reference** (`desktop/src/main/mcp/pine-reference/`). It should already match Pine: a PR that changes Pine updates it too. CI parses every example with the Pine in this commit (`desktop/scripts/check-pine-reference.sh`). Remove any `-- pine-lang #N` markers the check lists as parsing now.

6. **Desktop** (`desktop/`):
   - Bump `package.json`'s `version` to X.Y.Z, then update the lock file: `npm install --package-lock-only` (Node 22 or later).
   - Move `## [Unreleased]` in `CHANGELOG.md` into `## [X.Y.Z] - YYYY-MM-DD`. The app's What's New and the bell's unread dot pick it up from there: nothing to copy.

7. **Pull request.** Commit as `Release X.Y.Z: <short description>`, push, and open a PR into `main`. Wait for CI to pass, then merge it.

8. **Tag** the merge commit on `main`:

   ```sh
   git tag X.Y.Z && git push origin X.Y.Z
   ```

   The release workflow's first job applies new Supabase migrations to the live database (`.github/workflows/supabase-migrate.yml`). Nothing is built until it succeeds. If it fails, fix the migration in a new PR and push the tag again. `desktop/supabase/README.md` explains why a migration never breaks an app that is already out there.

9. **Watch the release** to the end: `gh run watch <run-id> --exit-status`. It builds Linux, macOS and Windows, then publishes.

10. **Check the Release**: `gh release view X.Y.Z`. It should have:
    - `beamlynx.AppImage` (no version in the name), `beamlynx-X.Y.Z.deb`
    - `beamlynx-X.Y.Z.dmg` and its `.blockmap`, the mac `.zip`
    - `beamlynx-X.Y.Z.exe` and its `.blockmap`
    - `latest.yml`, `latest-mac.yml`, `latest-linux.yml`

11. **Update the Homebrew tap** (`beamlynx/homebrew-tap`). Do this on every release.
    - Download the published dmg and hash it: `gh release download X.Y.Z -R beamlynx/beamlynx-desktop -p '*.dmg' -O /tmp/beamlynx-X.Y.Z.dmg && shasum -a 256 /tmp/beamlynx-X.Y.Z.dmg`.
    - In `Casks/beamlynx.rb`, set `version` and `sha256`.
    - Commit `Bump to X.Y.Z` and push.

12. **The AUR package** (`beamlynx-bin`) is not published yet. When it is, follow "Publish a new version" in `desktop/packaging/README.md` on every release.

## Make everyone update

An app older than the **minimum version** can't be used: it shows a screen that only lets the person update. Raise the minimum only when an old version must stop being used, for example after a security fix. A release doesn't raise it.

1. Publish the release first, and check it as in step 10.
2. Open a PR that sets the version in `desktop/minimum-version.json`, and say in it why:

   ```json
   {
     "minimum_version": "X.Y.Z"
   }
   ```

   To remove the minimum again, set it to `null`.
3. Merge it. Apps read the file from `main`, so it takes effect within about 20 minutes: GitHub caches the file for up to 5, and apps check every 15.

What an older app then does:

- **It can update itself:** it downloads the update, then asks for a restart, and nothing else can be done until then.
- **It can't update itself:** it asks the person to download version X.Y.Z from beamlynx.com/download.

An app never blocks when it can't read the file, when the file is broken, or when no published version is new enough. So a minimum set too early blocks nobody, and neither does a broken file. CI also checks that the file reads correctly.

Only apps from 0.35.0 on read the minimum. Older ones never block.

## Test a release build without releasing

Run the release workflow by hand on a branch: `gh workflow run release.yml --ref <branch>`. It builds every installer but publishes nothing, because publishing only happens for a tag. The Supabase step skips itself on a branch.

## See also

- `desktop/DEVELOPMENT.md`: running the app from source.
- `desktop/SIGNING.md`: code signing and notarization.
