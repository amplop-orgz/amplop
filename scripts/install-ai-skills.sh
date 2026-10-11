#!/usr/bin/env bash
# Installs the pinned AI skills into .claude/skills (S02-26). Fails if a commit does not match the lock.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p .claude/skills

while read -r name url commit _; do
  [ -z "$name" ] && continue
  git clone -q "$url" "$tmp/$name"
  git -C "$tmp/$name" checkout -q "$commit"
  got=$(git -C "$tmp/$name" rev-parse --short=7 HEAD)
  [ "$got" = "$commit" ] || { echo "$name is at $got, lock says $commit" >&2; exit 1; }
  case "$name" in
    monskills)
      for s in monskill concepts gas addresses indexer tooling-and-infra scaffold; do
        cp -R "$tmp/$name/skills/$s" .claude/skills/
      done ;;
    pashov-skills)
      for s in x-ray solidity-auditor; do
        src=$(find "$tmp/$name" -maxdepth 3 -type d -name "$s" | head -1)
        [ -n "$src" ] || { echo "skill $s not found in $name" >&2; exit 1; }
        cp -R "$src" .claude/skills/
      done ;;
    *) echo "unknown skill set $name" >&2; exit 1 ;;
  esac
done < tools/ai-skills.lock
echo "installed: $(ls .claude/skills | tr '\n' ' ')"
