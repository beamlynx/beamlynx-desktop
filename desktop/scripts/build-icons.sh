#!/usr/bin/env bash
# Renders the app icon from icons/icon.svg (and icons/icon-small.svg for
# 16-32px) into every file electron-builder and the app itself read.
# The outputs are committed, so this only needs re-running after editing
# an SVG. Needs rsvg-convert (librsvg) and ImageMagick 7 (`magick`).
set -euo pipefail

cd "$(dirname "$0")/../icons"

# macOS: electron-builder turns a 1024px PNG into the .icns itself.
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png

# Linux: one PNG per size, named NxN.png, as electron-builder expects.
mkdir -p png
for size in 16 24 32 48 64 128 256 512 1024; do
  if [ "$size" -le 32 ]; then src=icon-small.svg; else src=icon.svg; fi
  rsvg-convert -w "$size" -h "$size" "$src" -o "png/${size}x${size}.png"
done

# Windows: a multi-size .ico built from the same PNGs.
magick png/16x16.png png/24x24.png png/32x32.png png/48x48.png \
  png/64x64.png png/128x128.png png/256x256.png icon.ico

# Runtime window icon (Linux/Windows taskbar), shipped via assets/.
cp png/512x512.png ../assets/icon.png
