#!/bin/bash
# condition.sh for guard-issue-context
# Run: when Write/Edit/Bash modifies project files AND no locked_issue exists
set -euo pipefail

PROJECT_DIR="${FU_PROJECT_DIR:-${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 1

CONFIG_PATH=".fu.json"
[ -f "$CONFIG_PATH" ] || CONFIG_PATH=".academic-git.json"

# Not in a git repo → skip (degraded mode, no enforcement)
git rev-parse --git-dir &>/dev/null || exit 1

# Read tool input JSON from stdin
INPUT=$(cat)

# Extract tool name
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")

# Extract the file path being written/edited
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null || echo "")

# For Bash tool: check if the command writes to a file
if [ "$TOOL_NAME" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

  # If no command or not a file-writing command → skip
  # Detect common file-write patterns: > file, >> file, sed -i, tee, cp, mv, dd, install, redirect
  if echo "$CMD" | grep -qE '\s*>\s|>\s|>>\s|sed\s+-i|tee\s|cp\s|mv\s|install\s+-m|dd\s+of=|python3?\s+-c.*open\(.*["\x27]w'; then
    # This is a Bash write — condition met, run check
    :
  else
    # Not a write command → skip guard
    exit 1
  fi

  # For Bash writes we can't easily determine the target file path
  # so we skip the config-file allowlist and just check locked_issue
  if [ -f "$CONFIG_PATH" ]; then
    LOCKED_ISSUE=$(jq -r '.locked_issue // empty' "$CONFIG_PATH" 2>/dev/null || echo "")
    if [ -n "$LOCKED_ISSUE" ]; then
      # Has locked issue → check branch alignment
      LOCKED_BRANCH=$(jq -r '.locked_branch // empty' "$CONFIG_PATH" 2>/dev/null || echo "")
      CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
      if [ -n "$LOCKED_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LOCKED_BRANCH" ]; then
        exit 0  # On wrong branch → condition MET (guard should fire)
      fi
      exit 1  # Has locked issue, on correct branch → skip guard
    fi
  fi

  # No locked_issue → condition MET
  exit 0
fi

# For Write/Edit tools: check file path
if [ -z "$FILE_PATH" ]; then
  exit 1  # Can't determine target → skip
fi

# Allow config files without requiring handle-issue
REL_PATH="${FILE_PATH#"$PROJECT_DIR/"}"
REL_PATH="${REL_PATH#"$PWD/"}"

case "$REL_PATH" in
  .codex/*|.fu.json|.academic-git.json|AGENTS.md|.gitignore|README.md|.DS_Store)
    exit 1  # Config file → skip guard
    ;;
esac

# Check if locked_issue exists in .fu.json
if [ -f "$CONFIG_PATH" ]; then
  LOCKED_ISSUE=$(jq -r '.locked_issue // empty' "$CONFIG_PATH" 2>/dev/null || echo "")
  if [ -n "$LOCKED_ISSUE" ]; then
    # Has locked issue → check branch alignment
    LOCKED_BRANCH=$(jq -r '.locked_branch // empty' "$CONFIG_PATH" 2>/dev/null || echo "")
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

    if [ -n "$LOCKED_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LOCKED_BRANCH" ]; then
      # On wrong branch → condition MET (guard should fire)
      exit 0
    fi

    # Has locked issue and on correct branch → skip guard (allow writing)
    exit 1
  fi
fi

# No locked_issue → condition MET (guard should fire)
exit 0
