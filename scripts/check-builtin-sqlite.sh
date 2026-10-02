#!/usr/bin/env bash
# Checks that the packaged app's own Node runtime has a working built-in
# SQLite (node:sqlite). The app keeps its own data in SQLite, so a build
# without it would start but lose every setting. Runs the packaged binary
# with ELECTRON_RUN_AS_NODE, so it needs no display.
#
# Run after electron-builder, from the repo root.
set -euo pipefail

case "$(uname -s)" in
  Linux*)  bin="release/linux-unpacked/beamlynx-desktop" ;;
  Darwin*) bin="$(find release -path '*/beamlynx.app/Contents/MacOS/beamlynx' -type f | head -n 1)" ;;
  MINGW*|MSYS*|CYGWIN*) bin="release/win-unpacked/beamlynx.exe" ;;
  *) echo "Unknown platform: $(uname -s)" >&2; exit 1 ;;
esac

if [ -z "$bin" ] || [ ! -f "$bin" ]; then
  echo "Packaged binary not found (looked for '$bin'). Run electron-builder first." >&2
  exit 1
fi

ELECTRON_RUN_AS_NODE=1 "$bin" -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (k TEXT PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO t VALUES (?, ?)').run('k', 'v');
  if (db.prepare('SELECT v FROM t WHERE k = ?').get('k').v !== 'v') process.exit(1);
  console.log('Built-in SQLite works: Node ' + process.versions.node + ', SQLite ' + db.prepare('SELECT sqlite_version() AS v').get().v);
"
