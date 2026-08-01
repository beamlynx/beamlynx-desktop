#!/usr/bin/env bash
set -e

# Copies pine-lang's M1 jpackage app-image output into
# beamlynx-desktop/resources/server/, so the Electron main process always
# reads from the same place whether running from source (dev) or packaged
# by electron-builder. Also drops a VERSION file server-process.ts checks
# the running server's reported version against.

cd "$(dirname "$0")/.."

PINE_LANG_DIR="../pine-lang"
APP_IMAGE_SRC="$PINE_LANG_DIR/desktop/build/app-image/pine-server"
DEST="resources/server"

if [ ! -d "$APP_IMAGE_SRC" ]; then
  echo "No app-image found at $APP_IMAGE_SRC -- run pine-lang/desktop/build-app-image.sh first." >&2
  exit 1
fi

PINE_VERSION=$(grep -oP '\b\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?\b' "$PINE_LANG_DIR/src/pine/version.clj")

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$APP_IMAGE_SRC" "$DEST/pine-server"
echo "$PINE_VERSION" > "$DEST/VERSION"

echo "Staged pine-server $PINE_VERSION into $DEST"
