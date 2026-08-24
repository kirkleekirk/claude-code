#!/usr/bin/env bash
# Launch the game. Needs nothing but the .NET SDK -- no content build, no shader
# compiler, no XNA. Any extra arguments are passed straight through (see src/Program.cs).
set -e
cd "$(dirname "$0")/.."
exec dotnet run --project desktop/CastleMinerZ.Desktop.csproj -- "$@"
