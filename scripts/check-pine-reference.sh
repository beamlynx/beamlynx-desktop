#!/usr/bin/env bash
set -e

# Checks that every example in the agent's Pine reference
# (src/main/mcp/pine-reference/) parses with pine-lang. Run it whenever
# bundled-versions.json moves pine-lang, with that version checked out
# (see RELEASING.md). Needs the Clojure CLI.
#
# Usage: scripts/check-pine-reference.sh [path to pine-lang]   (default ../pine-lang)

cd "$(dirname "$0")/.."
DOCS="$PWD/src/main/mcp/pine-reference"
SCRIPT="$PWD/scripts/check-pine-reference.clj"
PINE_LANG="${1:-../pine-lang}"

cd "$PINE_LANG"
echo "Checking against pine-lang $(git describe --tags --always 2>/dev/null || echo '(unknown version)')"
clojure -M "$SCRIPT" "$DOCS"
