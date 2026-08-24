#!/usr/bin/env bash
# Renders the game to a PNG without a display, using Xvfb and software OpenGL.
# This is how the renderer is verified on a machine with no GPU and no window server.
#
#   tools/screenshot.sh out.png                       title screen
#   tools/screenshot.sh out.png --seed 1 --warmup 10  a world, ten seconds in
set -e
cd "$(dirname "$0")/.."

OUT="${1:?usage: screenshot.sh <output.png> [extra game args]}"
shift

export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe

dotnet build desktop/CastleMinerZ.Desktop.csproj -v q --nologo
exec xvfb-run -a --server-args="-screen 0 1280x720x24" \
  dotnet run --project desktop/CastleMinerZ.Desktop.csproj --no-build -- \
  --frame 150 --screenshot "$OUT" "$@"
