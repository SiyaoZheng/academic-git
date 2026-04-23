#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

detect_main_branch() {
  local branch=""
  branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo "")"
  if [ -n "$branch" ]; then
    printf '%s\n' "$branch"
    return 0
  fi

  branch="$(git remote show origin 2>/dev/null | awk '/HEAD branch/{print $NF}' || echo "")"
  if [ -n "$branch" ]; then
    printf '%s\n' "$branch"
    return 0
  fi

  if git show-ref --verify --quiet refs/remotes/origin/master; then
    printf '%s\n' "master"
    return 0
  fi

  if git show-ref --verify --quiet refs/remotes/origin/main; then
    printf '%s\n' "main"
    return 0
  fi

  printf '%s\n' "main"
}

BRANCH="$(git branch --show-current 2>/dev/null || echo "")"
DIRTY="$(git status --porcelain --ignore-submodules=dirty 2>/dev/null | sed '/^$/d' | wc -l | tr -d ' ')"
MAIN_BRANCH="$(detect_main_branch)"
HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
STATE_FILE="$(git rev-parse --git-path academic-git-posttool-last-head 2>/dev/null || echo "")"

AHEAD="$(git rev-list --count "origin/${MAIN_BRANCH}..HEAD" 2>/dev/null || echo "0")"
LOCKED_ISSUE=""
LOCKED_BRANCH=""

if [ -f .academic-git.json ]; then
  LOCKED_ISSUE="$(jq -r '.locked_issue // empty' .academic-git.json 2>/dev/null || echo "")"
  LOCKED_BRANCH="$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")"
fi

if [ -z "$LOCKED_ISSUE" ]; then
  LOCKED_ISSUE="(none)"
fi

if [ -z "$LOCKED_BRANCH" ]; then
  LOCKED_BRANCH="(none)"
fi

if [ -n "$STATE_FILE" ] && [ -n "$HEAD_SHA" ]; then
  mkdir -p "$(dirname "$STATE_FILE")"
  printf '%s\n' "$HEAD_SHA" >"$STATE_FILE"
fi

CONTEXT="academic-git status: branch=${BRANCH:-unknown}, dirty_files=${DIRTY:-0}, ahead_of_${MAIN_BRANCH}=${AHEAD:-0}, locked_issue=${LOCKED_ISSUE}, locked_branch=${LOCKED_BRANCH}. This system-level plugin is active in this git repository."

jq -n --arg context "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $context
  }
}'
