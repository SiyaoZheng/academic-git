#!/bin/bash
# check.sh for commit skill
# PostToolUse hook: supplementary output after commit
# Pipeline + gates are enforced BEFORE commit by the MCP tool (pipeline → gates → git commit).
# This hook only provides post-commit confirmation.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

echo "{\"supplementary_output\": \"[academic-git] Commit recorded. Pipeline + gates enforced by MCP tool.\"}"
exit 0
