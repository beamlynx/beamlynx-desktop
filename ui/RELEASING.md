# Releasing beamlynx-ui

## Checklist

1. Create branch `release/X.Y.Z` from `main`.
2. Bump `package.json` → `"version": "X.Y.Z"`.
3. **Ask**: do the unreleased changes depend on a specific minimum pine-lang server version? If yes, bump `RequiredVersion` in `constants.ts`.
4. Move the `## [Unreleased]` section in `CHANGELOG.md` into a new `## [X.Y.Z] - YYYY-MM-DD` section (today's date), leaving `## [Unreleased]` empty. If `RequiredVersion` changed, add a `### Breaking` entry noting the new minimum server version.
5. In `utils/changelog.data.ts`:
   - Prepend a new entry to the `CHANGELOG` array matching the `CHANGELOG.md` content for this version.
   - Update `LATEST_VERSION` at the bottom to `"X.Y.Z"`.
6. Commit all changed files: `Release X.Y.Z: <short description>`.
7. Push the branch and open a PR against `main`.
8. Once the PR merges, tag the merge commit on `main` and push the tag: `git tag X.Y.Z && git push origin X.Y.Z`. `beamlynx-desktop`'s `bundled-versions.json` pins a real tag rather than a SHA once one exists for the bundled version — skipping this leaves no tag for it to pin to.

`changelog.data.ts` must mirror `CHANGELOG.md` exactly — this drives both the in-app changelog modal and the notification-bell "unread updates" check (`LATEST_VERSION` compared against the user's last-read version in `localStorage`).
