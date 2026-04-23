#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
STOP_HOOK_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")"

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

emit_system_message() {
  local message="$1"
  jq -n --arg message "$message" '{systemMessage: $message}'
  exit 0
}

timeout_cmd() {
  local secs="$1"
  shift

  "$@" &
  local pid=$!
  (
    sleep "$secs"
    kill "$pid" 2>/dev/null || true
  ) &
  local watchdog=$!

  set +e
  wait "$pid" 2>/dev/null
  local status=$?
  set -e
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  return "$status"
}

MESSAGE=""
append_message() {
  local line="$1"
  if [ -z "$MESSAGE" ]; then
    MESSAGE="$line"
  else
    MESSAGE="${MESSAGE}
${line}"
  fi
}

if [ -n "$(git diff --name-only --diff-filter=U 2>/dev/null)" ]; then
  jq -n --arg reason "Merge conflict detected. Resolve conflicts first (git diff --name-only --diff-filter=U to see conflicted files), then git add and commit." '{
    decision: "block",
    reason: $reason
  }'
  exit 0
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo "")"
DIRTY="$(git status --porcelain 2>/dev/null || true)"
PROTECTED_BRANCH=false

case "${BRANCH:-}" in
  ""|main|master|develop|trunk|release/*|hotfix/*)
    PROTECTED_BRANCH=true
    ;;
esac

if [ "$STOP_HOOK_ACTIVE" != "true" ] && [ -n "$DIRTY" ]; then
  if [ "$PROTECTED_BRANCH" = true ]; then
    append_message "[academic-git] Stop hook skipped auto-save on protected branch '${BRANCH:-unknown}'."
  else
    FILE_COUNT="$(printf '%s\n' "$DIRTY" | sed '/^$/d' | wc -l | tr -d ' ')"
    DATE_STAMP="$(date +%Y-%m-%d)"
    COMMIT_MESSAGE="wip(#0): session-sweep ${FILE_COUNT} files (${DATE_STAMP})"

    if ! git add -A 2>/dev/null; then
      append_message "[academic-git] Stop hook could not stage changes for auto-save."
    elif ! git commit -m "$COMMIT_MESSAGE" >/dev/null 2>&1; then
      append_message "[academic-git] Stop hook could not create the auto-save commit."
    else
      SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
      SUBJECT="$(git log -1 --pretty=format:%s HEAD 2>/dev/null || echo "$COMMIT_MESSAGE")"
      append_message "[academic-git] Auto-save commit created on '${BRANCH}': ${SHORT_SHA} ${SUBJECT}"

      STATE_FILE="$(git rev-parse --git-path academic-git-posttool-last-head 2>/dev/null || echo "")"
      if [ -n "$STATE_FILE" ]; then
        mkdir -p "$(dirname "$STATE_FILE")"
        printf '%s\n' "$(git rev-parse HEAD 2>/dev/null || echo "")" >"$STATE_FILE"
      fi

      if git remote get-url origin >/dev/null 2>&1; then
        if ! timeout_cmd 15 git push origin "$BRANCH" >/dev/null 2>&1; then
          append_message "[academic-git] Auto-save commit was created locally on '${BRANCH}', but push to origin failed."
        fi
      fi
    fi
  fi
fi

if [ "$PROTECTED_BRANCH" = false ] && [ -n "$BRANCH" ] && git remote get-url origin >/dev/null 2>&1 && command -v gh >/dev/null 2>&1; then
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo "false")" != "true" ]; then
    MAIN_BRANCH="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')"
    if [ -z "$MAIN_BRANCH" ]; then
      MAIN_BRANCH="$(timeout_cmd 3 git remote show origin 2>/dev/null | awk '/HEAD branch/{print $NF}' || echo "")"
    fi
    if [ -z "$MAIN_BRANCH" ]; then
      MAIN_BRANCH="main"
    fi

    AHEAD="$(git rev-list --count "origin/${MAIN_BRANCH}..${BRANCH}" 2>/dev/null || echo "0")"
    if [ -n "$AHEAD" ] && [ "$AHEAD" -ge 1 ]; then
      EXISTING_PR="$(timeout_cmd 3 gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty' 2>/dev/null || echo "")"
      if [ -z "$EXISTING_PR" ]; then
        append_message "[academic-git] Branch '${BRANCH}' has ${AHEAD} commits ahead of ${MAIN_BRANCH} with no open PR."
      fi
    fi
  fi
fi

if [ -n "$MESSAGE" ]; then
  emit_system_message "$MESSAGE"
fi

exit 0
