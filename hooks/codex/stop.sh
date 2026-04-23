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
    reason: ($reason + "\n\n" + $context)
  }'
  exit 0
}

issue_from_branch() {
  local branch="$1"
  case "$branch" in
    codex/issue-[0-9]*)
      printf '%s\n' "$branch" | sed -n 's|^codex/issue-\([0-9][0-9]*\).*|\1|p'
      ;;
    *)
      printf '\n'
      ;;
  esac
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
  CONTEXT="$(printf 'Unresolved conflicts:\n%s' "$CONFLICTS")"
  emit_block \
    "Auto-Commit detected unresolved merge conflicts. Resolve conflicts before ending the session; do not create a commit until the conflicted files are clean." \
    "$CONTEXT"
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo "")"
LOCKED_ISSUE=""
LOCKED_BRANCH=""

if [ -f .academic-git.json ]; then
  LOCKED_ISSUE="$(jq -r '.locked_issue // empty' .academic-git.json 2>/dev/null || echo "")"
  LOCKED_BRANCH="$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")"
fi

BRANCH_ISSUE="$(issue_from_branch "${BRANCH:-}")"
EFFECTIVE_ISSUE="${LOCKED_ISSUE:-${BRANCH_ISSUE:-}}"
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

  REASON="Auto-Commit detected ${FILE_COUNT} uncommitted file(s) on branch '${BRANCH:-unknown}'. Do not end the session yet. Inspect the changes, then use the academic-git commit workflow: choose the correct Issue checklist item, make a meaningful issue-linked commit, and pass explicit paths when changes can be separated. Do not run raw git add/commit/push."

  if [ "$PROTECTED_BRANCH" = true ]; then
    REASON="${REASON} The current branch is protected, so first create or switch to the appropriate feature branch, or ask Adrian if this work intentionally has no issue."
  elif [ -z "$EFFECTIVE_ISSUE" ]; then
    REASON="${REASON} No locked issue is configured, so run begin/codex-gh-issue-start triage or ask Adrian which issue this work belongs to before committing."
  elif [ -n "$LOCKED_BRANCH" ] && [ -n "$BRANCH" ] && [ "$LOCKED_BRANCH" != "$BRANCH" ]; then
    REASON="${REASON} The repository is locked to branch '${LOCKED_BRANCH}', but the current branch is '${BRANCH}'; switch via academic-git before committing."
  fi

  CONTEXT="$(printf 'Auto-Commit guard blocked Stop because the working tree is dirty.\nbranch=%s\nissue=%s\nlocked_issue=%s\nbranch_issue=%s\nlocked_branch=%s\nchanged_files=%s\nstatus_sample:\n%s' \
    "${BRANCH:-unknown}" \
    "${EFFECTIVE_ISSUE:-none}" \
    "${LOCKED_ISSUE:-none}" \
    "${BRANCH_ISSUE:-none}" \
    "${LOCKED_BRANCH:-none}" \
    "$FILE_COUNT" \
    "$CHANGE_SAMPLE")"
  emit_block "$REASON" "$CONTEXT"
fi

if [ "$PROTECTED_BRANCH" = false ] && [ -n "$BRANCH" ] && git remote get-url origin >/dev/null 2>&1 && command -v gh >/dev/null 2>&1; then
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo "false")" != "true" ]; then
    MAIN_BRANCH="$(detect_main_branch)"

    AHEAD="$(git rev-list --count "origin/${MAIN_BRANCH}..${BRANCH}" 2>/dev/null || echo "0")"
    if [ -n "$AHEAD" ] && [ "$AHEAD" -ge 1 ]; then
      EXISTING_PR="$(timeout_cmd 3 gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty' 2>/dev/null || echo "")"
      if [ -z "$EXISTING_PR" ]; then
        REMOTE_HEAD="$(git rev-parse "refs/remotes/origin/${BRANCH}^{commit}" 2>/dev/null || echo "")"
        LOCAL_HEAD="$(git rev-parse HEAD 2>/dev/null || echo "")"

        if [ -z "$REMOTE_HEAD" ] || [ "$REMOTE_HEAD" != "$LOCAL_HEAD" ]; then
          append_message "[academic-git] Branch '${BRANCH}' is clean and ${AHEAD} commits ahead of ${MAIN_BRANCH}, but origin/${BRANCH} is missing or stale. Auto-Pull-Request will wait until the issue branch is pushed through the academic-git workflow."
        elif [ -z "$EFFECTIVE_ISSUE" ]; then
          append_message "[academic-git] Branch '${BRANCH}' is clean and ${AHEAD} commits ahead of ${MAIN_BRANCH} with no open PR, but no linked issue could be inferred. Run begin to lock the issue before PR creation."
        else
          ISSUE_JSON="$(timeout_cmd 5 gh issue view "$EFFECTIVE_ISSUE" --json title,body 2>/dev/null || echo "")"
          ISSUE_TITLE="$(printf '%s' "$ISSUE_JSON" | jq -r '.title // empty' 2>/dev/null || echo "")"
          ISSUE_BODY="$(printf '%s' "$ISSUE_JSON" | jq -r '.body // empty' 2>/dev/null || echo "")"

          if [ -z "$ISSUE_BODY" ]; then
            append_message "[academic-git] Branch '${BRANCH}' is clean and ${AHEAD} commits ahead of ${MAIN_BRANCH} with no open PR, but issue #${EFFECTIVE_ISSUE} could not be read. Auto-Pull-Request did not block because readiness could not be verified."
          elif ! printf '%s\n' "$ISSUE_BODY" | grep -Eq '^- \[[x ]\] [A-Z]\.'; then
            append_message "[academic-git] Branch '${BRANCH}' is clean and ${AHEAD} commits ahead of ${MAIN_BRANCH} with no open PR, but issue #${EFFECTIVE_ISSUE} has no checklist items. Auto-Pull-Request needs an auditable checklist before PR creation."
          else
            OPEN_ITEMS="$(printf '%s\n' "$ISSUE_BODY" | awk '/^- \[ \] [A-Z]\./ && $0 !~ /~~/ {print}' | sed -n '1,20p')"
            if [ -n "$OPEN_ITEMS" ]; then
              append_message "[academic-git] Branch '${BRANCH}' is clean and ${AHEAD} commits ahead of ${MAIN_BRANCH} with no open PR, but issue #${EFFECTIVE_ISSUE} still has unchecked checklist items."
            else
              REASON="Auto-Pull-Request detected branch '${BRANCH}' is clean, pushed, ${AHEAD} commits ahead of ${MAIN_BRANCH}, linked to completed issue #${EFFECTIVE_ISSUE}, and has no open PR. Do not end the session yet. Generate the PR body with generate_pr_body(issue: ${EFFECTIVE_ISSUE}), review it, then call create_pr(issue: ${EFFECTIVE_ISSUE}, title: \"...\", body: \"...\"). The create_pr tool must enforce checklist completion, Closes #${EFFECTIVE_ISSUE}, and PR-mode gates."
              CONTEXT="$(printf 'Auto-Pull-Request guard blocked Stop because this branch is PR-ready.\nbranch=%s\nissue=%s\nissue_title=%s\nbase=%s\nahead_commits=%s\nopen_pr=none\nrequired_next_steps:\n1. generate_pr_body(issue: %s)\n2. review the generated body for scope and traceability\n3. create_pr(issue: %s, title: ..., body: ...)' \
                "$BRANCH" \
                "$EFFECTIVE_ISSUE" \
                "${ISSUE_TITLE:-unknown}" \
                "$MAIN_BRANCH" \
                "$AHEAD" \
                "$EFFECTIVE_ISSUE" \
                "$EFFECTIVE_ISSUE")"
              emit_block "$REASON" "$CONTEXT"
            fi
          fi
        fi
      fi
    fi
  fi
fi

if [ -n "$MESSAGE" ]; then
  emit_system_message "$MESSAGE"
fi

exit 0
