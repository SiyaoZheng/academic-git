#!/bin/bash
set -euo pipefail

PLUGIN_ROOT="${ACADEMIC_GIT_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}}"
exec python3 "$PLUGIN_ROOT/hooks/codex/route-workflow.py" --event UserPromptSubmit
