#!/usr/bin/env bash
# Prints the head branch of the pull request that produced GITHUB_SHA on main, or nothing.
# The commits/{sha}/pulls endpoint can return an empty list for a few seconds after a merge
# (bipe-shared 81ed044: land saw no pull request, so the sibling regen pull requests stayed open).
# Retry it, then fall back to the "(#N)" or "#N" in the commit subject.
set -euo pipefail

for _ in 1 2 3 4 5 6; do
  branch=$(gh api "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/pulls" --jq '.[0].head.ref // empty')
  if [ -n "$branch" ]; then
    echo "$branch"
    exit 0
  fi
  sleep 10
done

subject=$(gh api "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}" --jq '.commit.message' | head -n 1)
number=$(printf '%s' "$subject" | grep -oE '#[0-9]+' | tail -n 1 | tr -d '#' || true)
if [ -n "$number" ]; then
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${number}" --jq 'select(.merged_at != null) | .head.ref // empty'
fi
