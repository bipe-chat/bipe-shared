#!/bin/sh
# The re-sign job of the signed lists (docs/signed-lists.md "Signing", bipe-chat/bipe#1242). Runs on mini4p from launchd
# every day (scripts/resign-lists.plist), as the copy on bipe-shared origin/main. launchd runs it in mz's GUI session:
# only there can tools/sign-list.mjs read the signer key from the login Keychain (an SSH session gets "User interaction
# is not allowed", ADR 0276). The key never leaves the Keychain. The clone below is the job's own; never work in it.
set -eu

state=${XDG_STATE_HOME:-$HOME/.local/state}/bipe-list-resign
repo=$state/bipe-shared
mkdir -p "$state"
# One run at a time. A lock older than 2 hours is from a run that was killed.
find "$state" -maxdepth 1 -name lock -type d -mmin +120 -exec rmdir {} \; 2>/dev/null || true
if ! mkdir "$state/lock" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) another run holds $state/lock"
  exit 0
fi
trap 'rmdir "$state/lock"' EXIT INT TERM

if [ ! -d "$repo/.git" ]; then
  git clone -q https://github.com/bipe-chat/bipe-shared.git "$repo"
fi
cd "$repo"
# gh pushes for this clone only; the global git config stays as it is.
git config credential.helper '!gh auth git-credential'
git fetch -q origin main
git checkout -q -f --detach origin/main
git clean -qfdx
node tools/resign-lists.mjs
date -u +%FT%TZ > "$state/last-run"
