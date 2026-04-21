#!/bin/bash
# condition.sh for begin-guard skill
# Run: when Write/Edit is called AND no locked_issue exists in .academic-git.json
# AND the target file is a project file (not .claude/ config)
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 1

# Not in a git repo → skip (degraded mode, no enforcement)
git rev-parse --git-dir &>/dev/null || exit 1

# Read tool input JSON from stdin
INPUT=$(cat)

# Extract the file path being written/edited
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null || echo "")

# If no file path found, skip (can't determine target)
[ -z "$FILE_PATH" ] && exit 1

# Allow config files without requiring /begin
# .claude/, .academic-git.json, CLAUDE.md, *.md in project root (docs), .gitignore
REL_PATH="${FILE_PATH#"$CLAUDE_PROJECT_DIR/"}"
REL_PATH="${REL_PATH#"$PWD/"}"

case "$REL_PATH" in
  .claude/*|.academic-git.json|CLAUDE.md|.gitignore|README.md|.DS_Store)
    exit 1  # Config file → skip guard
    ;;
esac

# Check if locked_issue exists in .academic-git.json
if [ -f ".academic-git.json" ]; then
  LOCKED_ISSUE=$(jq -r '.locked_issue // empty' .academic-git.json 2>/dev/null || echo "")
  if [ -n "$LOCKED_ISSUE" ]; then
    # Has locked issue → check branch alignment
    LOCKED_BRANCH=$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")
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
