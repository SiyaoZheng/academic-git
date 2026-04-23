#!/bin/bash
# check.sh for review-pr skill
# Non-blocking defense-in-depth: the create_pr MCP tool already validates
# all checklist items are done and runs all 9 gates.
# This hook runs before create_pr as a PreToolUse check, but since the MCP
# tool enforces the same rules, we pass through here.
# If someone bypasses MCP and uses `gh pr create` directly, the git-firewall
# hook blocks that instead.
set -euo pipefail

PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

exit 0
