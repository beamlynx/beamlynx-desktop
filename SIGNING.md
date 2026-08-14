# Code signing and notarization

**macOS builds are signed and notarized as of 0.2.1** -- `MAC_CSC_LINK`,
`MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and
`APPLE_API_ISSUER` are all configured as repo secrets, and
`.github/workflows/release.yml`'s existing (previously dormant) signing
passthrough in the `package` job activates automatically based on which of
these are present -- nothing needed to change in code once they were added.
**Windows builds are still unsigned** (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`
not configured) -- see that section below.

## macOS

Requires an active [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/year).

1. Create a **Developer ID Application** certificate (not "Apple Development" --
   that's for local testing only, not distribution outside the App Store) at
   the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list).
   When prompted for a "Profile Type" / Sub-CA, pick **G2 Sub-CA (Xcode 11.4.1
   or later)** unless you specifically need compatibility with older Xcode.

   **No Mac required** -- the portal asks for a CSR ("from your Mac"), but a
   CSR is just a standard PKCS#10 file; Apple doesn't care what generated it.
   On Linux (or any OS with OpenSSL):
   ```
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout developerID_application.key \
     -out developerID_application.csr \
     -subj "/emailAddress=YOUR_APPLE_ID_EMAIL/CN=Your Full Name/C=YOUR_COUNTRY_CODE"
   ```
   (`CN` and `C` should match your Apple Developer account's registered name
   and country.) Upload the resulting `.csr` to the portal. Keep
   `developerID_application.key` -- you need it again in step 2.

2. Apple issues a certificate (`.cer`, DER-encoded) -- download it, then
   combine it with the private key from step 1 into a password-protected
   `.p12`, still no Mac/Keychain Access needed:
   ```
   openssl x509 -inform DER -in developerID_application.cer -out developerID_application.pem
   openssl pkcs12 -export \
     -inkey developerID_application.key \
     -in developerID_application.pem \
     -out DeveloperIDApplication.p12 \
     -password pass:CHOOSE_AN_EXPORT_PASSWORD
   ```
   (If you instead created the certificate via Xcode/Keychain Access on an
   actual Mac, export it from Keychain Access as a `.p12` with a password
   the same way -- either path produces an equivalent file.)
3. Base64-encode it and set as repo secrets:
   - `MAC_CSC_LINK` -- `base64 -i DeveloperIDApplication.p12 | tr -d '\n'` (Linux: `base64 -w0`)
   - `MAC_CSC_KEY_PASSWORD` -- the export password from step 2
4. For notarization, create an **App Store Connect API key** (recommended
   over an app-specific password -- see the comment in
   `node_modules/app-builder-lib/out/options/macOptions.d.ts`'s `notarize`
   field for why) at [App Store Connect > Users and Access > Integrations](https://appstoreconnect.apple.com/access/integrations/api):
   - Create it under **Team Keys**, not Individual Keys -- Team Keys aren't
     tied to one person's account/role, so they keep working regardless of
     team membership changes, which matters for a key CI depends on.
   - **Access role: Developer** -- the minimum role that can submit to the
     notary service; no need for Admin/App Manager/Account Holder.
   - Apple only lets you download the generated `.p8` key file **once** --
     back it up somewhere safe (a password manager, not just local disk)
     immediately, since losing it means revoking and generating a new key,
     not re-downloading the same one.
   - `APPLE_API_KEY` -- base64-encoded contents of the downloaded `.p8` key file
   - `APPLE_API_KEY_ID` -- the Key ID shown on that same page
   - `APPLE_API_ISSUER` -- the Issuer ID shown on that same page

**Back up the `.p12` and its export password too** (e.g. a password
manager), not just the `.p8` -- losing it means generating an entirely new
Developer ID Application certificate from Apple, since the old one's
private key would be gone. GitHub Secrets are write-only: once saved, GitHub
will never show you the value again, only let you overwrite it, so these
files/passwords are the only real backup that will ever exist.

**Known open risk, not yet verified:** the app bundles `pine-server` (a
jpackage-built JVM app) via `extraResources` -- a nested executable that
Apple's notarization service checks independently of the main Electron
binary. It likely needs its own valid signature, which `jpackage` can
produce directly via `--mac-sign`/`--mac-signing-key-user-name` in
`pine-lang/desktop/build-app-image.sh` (that script already runs inside this
same CI job, so it would receive the same `MAC_CSC_LINK` secret). This has
not been implemented or tested -- 0.2.1 is the first real release to
actually exercise notarization end-to-end, so it's the first data point on
whether this is a real problem.

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
