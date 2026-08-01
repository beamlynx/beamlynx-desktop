#!/usr/bin/env bash
set -e

# Copies pine-lang's M1 jpackage app-image output into
# beamlynx-desktop/resources/server/, so the Electron main process always
# reads from the same place whether running from source (dev) or packaged
# by electron-builder. Also drops a VERSION file server-process.ts checks
# the running server's reported version against.

cd "$(dirname "$0")/.."

PINE_LANG_DIR="../pine-lang"
APP_IMAGE_BASE="$PINE_LANG_DIR/desktop/build/app-image"
DEST="resources/server"

# jpackage names the app-image root differently by OS: a plain "pine-server"
# directory on Linux/Windows, or a "pine-server.app" bundle on macOS. Copy
# whichever exists under its own name -- server-process.ts's
# getServerBinaryPath() knows how to find the actual binary inside either.
if [ -d "$APP_IMAGE_BASE/pine-server.app" ]; then
  APP_IMAGE_NAME="pine-server.app"
elif [ -d "$APP_IMAGE_BASE/pine-server" ]; then
  APP_IMAGE_NAME="pine-server"
else
  echo "No app-image found under $APP_IMAGE_BASE -- run pine-lang/desktop/build-app-image.sh first." >&2
  exit 1
fi

PINE_VERSION=$(grep -oP '\b\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?\b' "$PINE_LANG_DIR/src/pine/version.clj")

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$APP_IMAGE_BASE/$APP_IMAGE_NAME" "$DEST/$APP_IMAGE_NAME"
echo "$PINE_VERSION" > "$DEST/VERSION"

echo "Staged pine-server $PINE_VERSION into $DEST"
