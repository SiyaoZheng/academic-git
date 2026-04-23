#!/bin/bash
set -euo pipefail

SKILL_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_ROOT=$(CDPATH= cd -- "$SKILL_DIR/../.." && pwd)

python3 "$PLUGIN_ROOT/scripts/office_markdown_guard.py"
