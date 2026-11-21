#!/usr/bin/env bash
set -euo pipefail

# Regenerates/verifies the macOS signing + notarization material and pushes
# it straight to this repo's GitHub Actions secrets: MAC_CSC_LINK,
# MAC_CSC_KEY_PASSWORD, APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER.
# macOS only - doesn't touch WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD (Windows
# isn't signed at all yet, see SIGNING.md's Windows section). See
# SIGNING.md for how to obtain the underlying files in the first place
# (works entirely on Linux via OpenSSL - no Mac needed).
#
# Deliberately does NOT cd anywhere (unlike this repo's other scripts/*.sh)
# - run this FROM whatever directory holds your actual key material
# (developerID_application.key/.pem/.cer, AuthKey_*.p8). That material is
# never checked into this repo, so there's no "repo root" to normalize to -
# it has to run wherever those files actually live.

REPO="${1:-beamlynx/beamlynx-desktop}"

echo "== macOS code signing (Developer ID Application) - repo: $REPO =="

KEY_FILE="developerID_application.key"
PEM_FILE="developerID_application.pem"
CER_FILE="developerID_application.cer"
P12_FILE="DeveloperIDApplication.p12"

if [ ! -f "$KEY_FILE" ]; then
  echo "No $KEY_FILE in $(pwd) - skipping MAC_CSC_LINK/MAC_CSC_KEY_PASSWORD."
  echo "(See SIGNING.md step 1 to generate one, if you haven't yet.)"
else
  if [ ! -f "$PEM_FILE" ]; then
    if [ -f "$CER_FILE" ]; then
      echo "Converting $CER_FILE (DER, as Apple issues it) -> $PEM_FILE"
      openssl x509 -inform DER -in "$CER_FILE" -out "$PEM_FILE"
    else
      echo "Have $KEY_FILE but neither $PEM_FILE nor $CER_FILE - can't build the .p12. Aborting." >&2
      exit 1
    fi
  fi

  read -rs -p "Developer ID .p12 export password: " MAC_PW
  echo
  echo

  # -legacy is required, not optional, whenever the local openssl is 3.x -
  # its default PKCS12 scheme (PBES2/AES-256/SHA-256) isn't readable by
  # macOS's own Keychain Services. Without it, CI's `security import` fails
  # with a misleading "MAC verification failed during PKCS12 import (wrong
  # password?)" regardless of whether the password is actually correct -
  # this exact failure mode cost a lot of debugging time before the actual
  # cause (an algorithm mismatch, not a wrong password) was found. See
  # SIGNING.md for the full story.
  openssl pkcs12 -export -legacy \
    -inkey "$KEY_FILE" \
    -in "$PEM_FILE" \
    -out "$P12_FILE" \
    -password pass:"$MAC_PW"

  echo "== Verifying $P12_FILE (expect pbeWithSHA1And40BitRC2-CBC / pbeWithSHA1And3-KeyTripleDES-CBC, NOT PBES2/AES-256) =="
  openssl pkcs12 -legacy -info -in "$P12_FILE" -passin pass:"$MAC_PW" -noout

  # openssl base64, not the base64 CLI - GNU base64's `-w0` (no wrapping)
  # and BSD/macOS base64's equivalent aren't the same flag, so this is the
  # one encoding path that behaves identically on Linux and macOS.
  ENCODED="$(mktemp)"
  ROUNDTRIP="$(mktemp)"
  trap 'rm -f "$ENCODED" "$ROUNDTRIP"' EXIT

  openssl base64 -A -in "$P12_FILE" -out "$ENCODED"

  # Round-trip it back to binary and re-verify against THAT copy before
  # uploading anything - this is what actually catches a bad encode/paste
  # before it costs a CI round-trip, not just "the export succeeded".
  openssl base64 -d -A -in "$ENCODED" -out "$ROUNDTRIP"
  diff "$P12_FILE" "$ROUNDTRIP" && echo "base64 round-trip OK"
  openssl pkcs12 -legacy -info -in "$ROUNDTRIP" -passin pass:"$MAC_PW" -noout

  gh secret set MAC_CSC_LINK --repo "$REPO" < "$ENCODED"
  printf '%s' "$MAC_PW" | gh secret set MAC_CSC_KEY_PASSWORD --repo "$REPO"
  echo "MAC_CSC_LINK / MAC_CSC_KEY_PASSWORD updated."
fi

echo
echo "== Notarization (App Store Connect API key) =="

# Apple names the downloaded key AuthKey_<KEYID>.p8 - the KEYID varies per
# key, so auto-detect rather than hardcode a name. Takes the first match if
# more than one is somehow present; move/rename older ones out of the way
# if that's ever ambiguous.
P8_FILE="$(find . -maxdepth 1 -name 'AuthKey_*.p8' -print -quit)"
if [ -z "$P8_FILE" ]; then
  echo "No AuthKey_*.p8 in $(pwd) - skipping APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER."
  echo "(See SIGNING.md step 4 to generate one, if you haven't yet - Team Keys, Developer role.)"
else
  echo "Found $P8_FILE"
  read -rp "Key ID (shown next to the key on App Store Connect): " APPLE_KEY_ID
  read -rp "Issuer ID (shown on the same App Store Connect page): " APPLE_ISSUER_ID

  # Unlike MAC_CSC_LINK, this secret's value is passed straight through to
  # Apple's own notarytool --key <path> with no decoding by electron-builder
  # - release.yml decodes it back to a file itself before use. See
  # SIGNING.md and release.yml's own comment on that step.
  openssl base64 -A -in "$P8_FILE" | gh secret set APPLE_API_KEY --repo "$REPO"
  printf '%s' "$APPLE_KEY_ID" | gh secret set APPLE_API_KEY_ID --repo "$REPO"
  printf '%s' "$APPLE_ISSUER_ID" | gh secret set APPLE_API_ISSUER --repo "$REPO"
  echo "APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER updated."
fi

echo
echo "Done."
