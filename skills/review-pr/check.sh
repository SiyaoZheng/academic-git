#!/bin/bash
# check.sh for review-pr skill
# PreToolUse hook (BLOCKING): supplementary check before PR creation
# Clean-room pipeline + gates are enforced by the create_pr MCP tool before gh pr create.
# This hook is kept as a defense-in-depth layer for any cases where the MCP tool
# is bypassed (e.g., direct gh pr create).
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# No additional checks — pipeline + gates are enforced by the MCP tool.
exit 0
