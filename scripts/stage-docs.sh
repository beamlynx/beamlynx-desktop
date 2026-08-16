#!/usr/bin/env bash
set -e

# Copies src/main/mcp/pine-reference/*.md into resources/docs/, so the MCP
# server's list_pine_docs/get_pine_doc tools (src/main/mcp/stdio-relay.ts)
# have something to teach Claude Pine syntax with. Mirrors stage-server.sh's
# pattern -- a plain copy, so the Electron main process reads from the same
# place whether running from source (dev) or packaged by electron-builder
# (see src/main/resources.ts's getResourcesRoot()).
#
# src/main/mcp/pine-reference/*.md is hand-maintained and git-tracked in
# this repo, not generated -- kept in sync with beamlynx.com's documentation
# pages by whoever (human or Claude) updates either one, the same way
# beamlynx-ui/CHANGELOG.md and utils/changelog.data.ts are two independently
# maintained files kept in sync by discipline, not a build script. See
# src/main/mcp/pine-reference/README.md.

cd "$(dirname "$0")/.."

SRC="src/main/mcp/pine-reference"
DEST="resources/docs"

rm -rf "$DEST"
mkdir -p "$DEST"
# Excludes README.md deliberately -- it documents this directory for human
# contributors, not a Pine topic; copying it would surface a spurious
# "readme" entry to list_pine_docs.
find "$SRC" -maxdepth 1 -name '*.md' ! -name 'README.md' -exec cp {} "$DEST/" \;

echo "Staged $(ls "$DEST" | wc -l | tr -d ' ') pine doc(s) into $DEST"
