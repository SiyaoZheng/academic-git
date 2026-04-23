#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
ENV_STOP_HOOK_ACTIVE="${STOP_HOOK_ACTIVE:-${stop_hook_active:-}}"
PAYLOAD_STOP_HOOK_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // empty' 2>/dev/null || echo "")"
STOP_HOOK_ACTIVE="${PAYLOAD_STOP_HOOK_ACTIVE:-${ENV_STOP_HOOK_ACTIVE:-false}}"

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

emit_block() {
  local reason="$1"
  local context="$2"
  jq -n --arg reason "$reason" --arg context "$context" '{
    decision: "block",
    reason: $reason,
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: $context
    }
  }'
  exit 0
}

detect_main_branch() {
  local branch=""
  branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo "")"
  if [ -n "$branch" ]; then
    printf '%s\n' "$branch"
    return 0
  fi

  branch="$(timeout_cmd 3 git remote show origin 2>/dev/null | awk '/HEAD branch/{print $NF}' || echo "")"
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

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

if [ -n "$(git diff --name-only --diff-filter=U 2>/dev/null)" ]; then
  CONFLICTS="$(git diff --name-only --diff-filter=U 2>/dev/null | sed -n '1,20p')"
  emit_block \
    "Auto-Commit detected unresolved merge conflicts. Resolve conflicts before ending the session; do not create a commit until the conflicted files are clean." \
    "Unresolved conflicts:\n${CONFLICTS}"
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo "")"
DIRTY="$(git status --porcelain --untracked-files=all --ignore-submodules=dirty 2>/dev/null || true)"
PROTECTED_BRANCH=false

case "${BRANCH:-}" in
  ""|main|master|develop|trunk|release/*|hotfix/*)
    PROTECTED_BRANCH=true
    ;;
esac

if [ -n "$DIRTY" ]; then
  FILE_COUNT="$(printf '%s\n' "$DIRTY" | sed '/^$/d' | wc -l | tr -d ' ')"
  CHANGE_SAMPLE="$(printf '%s\n' "$DIRTY" | sed -n '1,20p')"
  LOCKED_ISSUE=""
  LOCKED_BRANCH=""

  if [ -f .academic-git.json ]; then
    LOCKED_ISSUE="$(jq -r '.locked_issue // empty' .academic-git.json 2>/dev/null || echo "")"
    LOCKED_BRANCH="$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")"
  fi

  REASON="Auto-Commit detected ${FILE_COUNT} uncommitted file(s) on branch '${BRANCH:-unknown}'. Do not end the session yet. Inspect the changes, then use the academic-git commit workflow: choose the correct Issue checklist item, make a meaningful issue-linked commit, and pass explicit paths when changes can be separated. Do not run raw git add/commit/push."

  if [ "$PROTECTED_BRANCH" = true ]; then
    REASON="${REASON} The current branch is protected, so first create or switch to the appropriate feature branch, or ask Adrian if this work intentionally has no issue."
  elif [ -z "$LOCKED_ISSUE" ]; then
    REASON="${REASON} No locked issue is configured, so run begin/codex-gh-issue-start triage or ask Adrian which issue this work belongs to before committing."
  elif [ -n "$LOCKED_BRANCH" ] && [ -n "$BRANCH" ] && [ "$LOCKED_BRANCH" != "$BRANCH" ]; then
    REASON="${REASON} The repository is locked to branch '${LOCKED_BRANCH}', but the current branch is '${BRANCH}'; switch via academic-git before committing."
  fi

  CONTEXT="Auto-Commit guard blocked Stop because the working tree is dirty.\nbranch=${BRANCH:-unknown}\nlocked_issue=${LOCKED_ISSUE:-none}\nlocked_branch=${LOCKED_BRANCH:-none}\nchanged_files=${FILE_COUNT}\nstatus_sample:\n${CHANGE_SAMPLE}"
  emit_block "$REASON" "$CONTEXT"
fi

if [ "$PROTECTED_BRANCH" = false ] && [ -n "$BRANCH" ] && git remote get-url origin >/dev/null 2>&1 && command -v gh >/dev/null 2>&1; then
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo "false")" != "true" ]; then
    MAIN_BRANCH="$(detect_main_branch)"

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
