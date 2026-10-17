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

# -E, not -P -- this runs on macOS's BSD grep too, which has no -P support.
PINE_VERSION=$(grep -oE '"[0-9]+\.[0-9]+\.[0-9]+[^"]*"' "$PINE_LANG_DIR/src/pine/version.clj" | tr -d '"')

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$APP_IMAGE_BASE/$APP_IMAGE_NAME" "$DEST/$APP_IMAGE_NAME"
echo "$PINE_VERSION" > "$DEST/VERSION"

# macOS: the SQLite driver packs its native libraries inside the jar
# (org/sqlite/native/Mac/<arch>/libsqlitejdbc.dylib) and extracts one to a
# temp folder when it first opens a database. Apple's notarization inspects
# the jar, finds those two unsigned dylibs, and rejects the whole app:
# electron-builder signs every binary in the bundle, but not ones inside a
# jar. So take them out: put the one for this build's architecture next to
# the jar, where electron-builder signs it with the rest, and point the
# driver at it through the launcher's Java options. Without them in the
# jar, the driver can only load the signed copy.
if [ "$APP_IMAGE_NAME" = "pine-server.app" ]; then
  APP_DIR="$DEST/pine-server.app/Contents/app"
  JAR="$APP_DIR/pine-standalone.jar"
  CFG="$APP_DIR/pine-server.cfg"
  case "$(uname -m)" in
    arm64) SQLITE_ARCH=aarch64 ;;
    x86_64) SQLITE_ARCH=x86_64 ;;
    *) echo "No SQLite native library for $(uname -m)" >&2; exit 1 ;;
  esac
  mkdir -p "$APP_DIR/sqlite-native"
  unzip -p "$JAR" "org/sqlite/native/Mac/$SQLITE_ARCH/libsqlitejdbc.dylib" > "$APP_DIR/sqlite-native/libsqlitejdbc.dylib"
  [ -s "$APP_DIR/sqlite-native/libsqlitejdbc.dylib" ] || { echo "libsqlitejdbc.dylib not found in $JAR" >&2; exit 1; }
  zip -q -d "$JAR" 'org/sqlite/native/Mac/*'
  grep -q '^\[JavaOptions\]$' "$CFG" || { echo "No [JavaOptions] in $CFG" >&2; exit 1; }
  awk '{ print } /^\[JavaOptions\]$/ {
    print "java-options=-Dorg.sqlite.lib.path=$APPDIR/sqlite-native"
    print "java-options=-Dorg.sqlite.lib.name=libsqlitejdbc.dylib"
  }' "$CFG" > "$CFG.new" && mv "$CFG.new" "$CFG"
  echo "Moved the SQLite $SQLITE_ARCH native library out of the jar, for signing"
fi

echo "Staged pine-server $PINE_VERSION into $DEST"
