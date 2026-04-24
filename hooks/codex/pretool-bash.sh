#!/bin/bash
set -euo pipefail

PLUGIN_ROOT="${SCHOLAROS_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}}"
exec bash "$PLUGIN_ROOT/hooks/guard-write-route.sh"
