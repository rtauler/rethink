#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
host=${1:-rtauler@100.73.187.94}
version=$(sed -n "s/^version: '\([^']*\)'/\1/p" ha-addon/config.yaml)
case "$version" in
    ''|*[!a-zA-Z0-9._-]*) echo 'Invalid add-on version' >&2; exit 1 ;;
esac
release="$version-$(git rev-parse --short=12 HEAD)"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT HUP INT TERM
sh scripts/package-ha-addon.sh "$staging/source"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$staging/source.tar.gz" -C "$staging/source" .
ssh "$host" "mkdir -p 'rethink-builds/$release'"
scp "$staging/source.tar.gz" "$host:rethink-builds/$release/source.tar.gz"
ssh "$host" "mkdir -p 'rethink-builds/$release/source' && tar -xzf 'rethink-builds/$release/source.tar.gz' -C 'rethink-builds/$release/source'"
ssh -t "$host" "sudo python3 'rethink-builds/$release/source/ha-addon/deploy-host.py' 'rethink-builds/$release/source'"
