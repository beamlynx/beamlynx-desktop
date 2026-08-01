#!/usr/bin/env bash
set -e

# Builds a static export of beamlynx-ui for the desktop app and stages it
# into beamlynx-desktop/resources/ui/.
#
# next.config.js's `output: 'export'` (gated behind NEXT_DESKTOP=1) errors
# outright if middleware.ts is present -- Next doesn't just no-op it, it's
# an unsupported combination. So this builds from a staged copy of
# beamlynx-ui with middleware.ts excluded, rather than touching the real
# tree (no risk of a crashed build leaving middleware.ts renamed/missing in
# the actual source tree).

cd "$(dirname "$0")/.."

UI_SRC="../beamlynx-ui"
STAGE_DIR="build/ui-stage"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

rsync -a \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude 'middleware.ts' \
  "$UI_SRC/" "$STAGE_DIR/"

# Reuse the real tree's installed deps instead of reinstalling -- build-only,
# nothing here writes to node_modules.
ln -s "$(cd "$UI_SRC/node_modules" && pwd)" "$STAGE_DIR/node_modules"

if [ -z "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then
  echo "Warning: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. The build will" >&2
  echo "still succeed (ClerkProvider isn't invoked during static generation)," >&2
  echo "but the packaged app will fail to sign in at runtime with" >&2
  echo "'Missing publishableKey' until this is set to a real key from" >&2
  echo "https://dashboard.clerk.com." >&2
fi

(
  cd "$STAGE_DIR"
  NEXT_DESKTOP=1 NEXT_PUBLIC_DESKTOP=1 \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
    npm run build
)

rm -rf resources/ui
mkdir -p resources/ui
cp -a "$STAGE_DIR/out/." resources/ui/

echo "Staged static UI export into resources/ui"
