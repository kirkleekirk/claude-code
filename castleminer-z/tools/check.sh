#!/usr/bin/env bash
# Compile-verify the shared sources against MonoGame (see desktop/CastleMinerZ.Desktop.csproj).
# Pass --lib to build as a library, for checking before the entry point exists.
set -e
export PATH="/home/user/.dotnet:$PATH"
cd "$(dirname "$0")/.."
EXTRA=""
if [ "$1" = "--lib" ]; then EXTRA="-p:OutputType=Library"; fi
dotnet build desktop/CastleMinerZ.Desktop.csproj -v q --nologo $EXTRA 2>&1 \
  | grep -E "error|warning CS|Build succeeded" | sort -u | head -40
