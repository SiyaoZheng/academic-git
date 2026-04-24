#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
STRICT_STOP="${SCHOLAROS_OS_NOISE_STRICT:-false}"

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

REPO_DIR="$(pwd -P)"

OS_NOISE_PATTERNS=(
  ".DS_Store"
  "._*"
  ".AppleDouble"
  ".LSOverride"
  "Icon?"
  ".Spotlight-V100"
  ".Trashes"
  ".fseventsd"
  "Thumbs.db"
  "Thumbs.db:encryptable"
  "Desktop.ini"
)

MESSAGE=""
GLOBAL_IGNORE_CHANGED=0
GLOBAL_IGNORE_PATH=""
CLEANED_COUNT=0
CLEANED_SAMPLE=""
NESTED_DIRTY_COUNT=0
NESTED_DIRTY_SAMPLE=""

append_line() {
  local line="$1"
  if [ -z "$MESSAGE" ]; then
    MESSAGE="$line"
  else
    MESSAGE="${MESSAGE}
${line}"
  fi
}

append_sample_line() {
  local current="$1"
  local line="$2"
  local limit="$3"
  local count

  count="$(printf '%s\n' "$current" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$count" -ge "$limit" ]; then
    printf '%s' "$current"
    return 0
  fi

  if [ -z "$current" ]; then
    printf '%s' "$line"
  else
    printf '%s\n%s' "$current" "$line"
  fi
}

relative_path() {
  python3 - "$REPO_DIR" "$1" <<'PY'
import os
import sys

root, path = sys.argv[1], sys.argv[2]
print(os.path.relpath(path, root))
PY
}

ensure_global_ignore() {
  local excludes_file="${SCHOLAROS_OS_NOISE_EXCLUDESFILE:-}"
  local configured=""

  if [ -z "$excludes_file" ]; then
    configured="$(git config --global --get core.excludesfile 2>/dev/null || true)"
    if [ -n "$configured" ]; then
      excludes_file="$configured"
    else
      excludes_file="${HOME}/.gitignore_global"
      git config --global core.excludesfile "$excludes_file" >/dev/null 2>&1 || true
    fi
  fi

  GLOBAL_IGNORE_PATH="$excludes_file"
  mkdir -p "$(dirname "$excludes_file")" 2>/dev/null || return 0
  touch "$excludes_file" 2>/dev/null || return 0

  local pattern
  for pattern in "${OS_NOISE_PATTERNS[@]}"; do
    if ! grep -qxF "$pattern" "$excludes_file" 2>/dev/null; then
      printf '%s\n' "$pattern" >>"$excludes_file"
      GLOBAL_IGNORE_CHANGED=1
    fi
  done
}

cleanup_os_noise() {
  local path rel

  while IFS= read -r -d '' path; do
    rel="$(relative_path "$path")"
    rm -rf "$path"
    CLEANED_COUNT=$((CLEANED_COUNT + 1))
    CLEANED_SAMPLE="$(append_sample_line "$CLEANED_SAMPLE" "$rel" 12)"
  done < <(
    find "$REPO_DIR" \
      -name .git -prune -o \
      \( \
        -name ".DS_Store" -o \
        -name "._*" -o \
        -name ".AppleDouble" -o \
        -name ".LSOverride" -o \
        -name "Icon?" -o \
        -name ".Spotlight-V100" -o \
        -name ".Trashes" -o \
        -name ".fseventsd" -o \
        -name "Thumbs.db" -o \
        -name "Thumbs.db:encryptable" -o \
        -name "Desktop.ini" \
      \) -print0
  )
}

collect_nested_dirty_repos() {
  local git_dir nested_repo status sample rel_repo line

  while IFS= read -r -d '' git_dir; do
    nested_repo="$(dirname "$git_dir")"
    status="$(git -C "$nested_repo" status --porcelain --untracked-files=all 2>/dev/null | sed '/^$/d' || true)"
    if [ -z "$status" ]; then
      continue
    fi

    rel_repo="$(relative_path "$nested_repo")"
    sample="$(printf '%s\n' "$status" | sed -n '1,5p')"
    line="${rel_repo}: ${sample}"
    NESTED_DIRTY_COUNT=$((NESTED_DIRTY_COUNT + 1))
    NESTED_DIRTY_SAMPLE="$(append_sample_line "$NESTED_DIRTY_SAMPLE" "$line" 8)"
  done < <(
    find "$REPO_DIR" \
      -path "$REPO_DIR/.git" -prune -o \
      -type d -name .git -print0 -prune
  )
}

ensure_global_ignore
cleanup_os_noise
collect_nested_dirty_repos

if [ "$GLOBAL_IGNORE_CHANGED" -eq 1 ]; then
  append_line "[ScholarOS] Added OS metadata patterns to global Git ignore: ${GLOBAL_IGNORE_PATH}."
fi

if [ "$CLEANED_COUNT" -gt 0 ]; then
  append_line "[ScholarOS] Removed ${CLEANED_COUNT} OS metadata item(s) from the working tree before dirty checks."
  append_line "cleaned_sample:
${CLEANED_SAMPLE}"
fi

if [ "$NESTED_DIRTY_COUNT" -gt 0 ]; then
  append_line "[ScholarOS] ${NESTED_DIRTY_COUNT} nested Git repo(s) remain dirty after OS-noise cleanup; inspect or commit those child-repo changes explicitly."
  append_line "nested_dirty_sample:
${NESTED_DIRTY_SAMPLE}"
fi

if [ "$STRICT_STOP" = "true" ] && [ "$NESTED_DIRTY_COUNT" -gt 0 ]; then
  REASON="OS Noise Guard found ${NESTED_DIRTY_COUNT} nested Git repo(s) still dirty after metadata cleanup. Resolve or commit those child-repo changes before ending the session."
  jq -n --arg reason "$REASON" --arg context "$MESSAGE" '{
    decision: "block",
    reason: $reason,
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: $context
    }
  }'
  exit 1
fi

if [ -n "$MESSAGE" ]; then
  jq -n --arg context "$MESSAGE" '{
    hookSpecificOutput: {
      hookEventName: "OSNoiseGuard",
      additionalContext: $context
    }
  }'
fi

exit 0
