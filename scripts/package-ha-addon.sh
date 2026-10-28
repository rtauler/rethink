#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 NEW_OUTPUT_DIRECTORY" >&2
    exit 2
fi
if [ -n "$(git status --porcelain)" ]; then
    echo 'Commit the source first; deployment packages must identify an exact Git revision.' >&2
    exit 1
fi
if [ -e "$1" ]; then
    echo 'Output directory must not already exist.' >&2
    exit 1
fi

revision=$(git rev-parse HEAD)
mkdir -p "$1"
output=$(cd "$1" && pwd)
git archive HEAD | tar -xf - -C "$output"
cp "$output/ha-addon/config.yaml" "$output/config.yaml"
printf 'args:\n    GIT_REVISION: "%s"\n' "$revision" > "$output/build.yaml"
printf '%s\n' "$revision" > "$output/SOURCE_REVISION"
printf 'Packaged %s at %s\n' "$revision" "$output"
