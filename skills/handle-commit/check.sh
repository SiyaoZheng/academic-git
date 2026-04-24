#!/bin/bash
# check.sh for handle-commit
# PostToolUse hook: supplementary output after create_commit
# Pipeline + gates are enforced BEFORE commit by the workflow tool.
# This hook only provides post-commit confirmation.
set -euo pipefail

PROJECT_DIR="${FU_PROJECT_DIR:-${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

echo "{\"supplementary_output\": \"[Fu] create_commit recorded a formal issue-linked commit. Pipeline + gates were enforced by Fu workflow checks.\"}"
exit 0
