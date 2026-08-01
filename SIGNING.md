# Code signing and notarization

Currently unsigned: macOS builds show a Gatekeeper warning ("cannot be
opened because it is from an unidentified developer"), and Windows builds
show a SmartScreen warning. The plumbing to sign both is in place
(`electron-builder.yml`, `build/entitlements.mac.plist`,
`.github/workflows/release.yml`'s secret passthrough in the `package` job) --
it activates automatically based on which of the secrets below are actually
configured in this repo's GitHub Actions secrets. Nothing needs to change in
code once they're added.

This hasn't been verified end-to-end (no real Apple/Windows credentials were
available to test with) -- treat the first real signed release as the actual
test, not this document.

## macOS

Requires an active [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/year).

1. In Xcode or the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list),
   create a **Developer ID Application** certificate (not "Apple Development" --
   that's for local testing only, not distribution outside the App Store).
2. Export it from Keychain Access as a `.p12` file with a password.
3. Base64-encode it and set as repo secrets:
   - `MAC_CSC_LINK` -- `base64 -i DeveloperIDApplication.p12 | tr -d '\n'`
   - `MAC_CSC_KEY_PASSWORD` -- the export password from step 2
4. For notarization, create an **App Store Connect API key** (recommended
   over an app-specific password -- see the comment in
   `node_modules/app-builder-lib/out/options/macOptions.d.ts`'s `notarize`
   field for why) at [App Store Connect > Users and Access > Integrations](https://appstoreconnect.apple.com/access/integrations/api):
   - `APPLE_API_KEY` -- base64-encoded contents of the downloaded `.p8` key file
   - `APPLE_API_KEY_ID` -- the Key ID shown in App Store Connect
   - `APPLE_API_ISSUER` -- the Issuer ID shown in App Store Connect

**Known open risk, not yet verified:** the app bundles `pine-server` (a
jpackage-built JVM app) via `extraResources` -- a nested executable that
Apple's notarization service checks independently of the main Electron
binary. It likely needs its own valid signature, which `jpackage` can
produce directly via `--mac-sign`/`--mac-signing-key-user-name` in
`pine-lang/desktop/build-app-image.sh` (that script already runs inside this
same CI job, so it would receive the same `MAC_CSC_LINK` secret). This has
not been implemented or tested -- expect the first real notarization attempt
to surface whether it's actually necessary.

## Windows

Traditional certificates on a physical USB token (previously required by
CA/Browser Forum rules for EV certs) don't work in CI at all. Two options:

- **A standard (non-EV) code-signing certificate** from a CA (DigiCert,
  Sectigo, SSL.com, etc.), exported as a `.pfx`:
  - `WIN_CSC_LINK` -- `base64 -i cert.pfx | tr -d '\n'`
  - `WIN_CSC_KEY_PASSWORD` -- the export password
- **Azure Trusted Signing** (the modern, CI-friendly option most EV
  certificates have moved to) -- not wired up here yet; would need
  `win.azureSignOptions` in `electron-builder.yml` plus Azure-side setup if
  this is the path chosen instead.

## Verifying it worked

Once secrets are configured, the next tag push's `package` job will sign and
notarize automatically. Confirm by:
- Downloading the mac `.dmg`/Windows `.exe` fresh (not from a machine that
  already trusts them) and opening it without a Gatekeeper/SmartScreen
  warning.
- `codesign --verify --deep --strict <App>.app` and
  `spctl --assess --type execute <App>.app` on mac.
