#!/usr/bin/env bash
set -e

# Checks that every example in the agent's Pine reference
# (src/main/mcp/pine-reference/) parses with pine-lang. CI runs it on
# every change. Needs the Clojure CLI.
#
# Usage: scripts/check-pine-reference.sh [path to pine-lang]   (default ../pine)

cd "$(dirname "$0")/.."
DOCS="$PWD/src/main/mcp/pine-reference"
SCRIPT="$PWD/scripts/check-pine-reference.clj"
PINE_LANG="${1:-../pine}"

cd "$PINE_LANG"
echo "Checking against the Pine in $PWD"
clojure -M "$SCRIPT" "$DOCS"
