#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_SERVER="$PLUGIN_DIR/mcp/src/server.js"

if [ ! -f "$SOURCE_SERVER" ]; then
  echo "academic-git MCP server not found: $SOURCE_SERVER" >&2
  exit 1
fi

if [ -z "${CLAUDE_PROJECT_DIR:-}" ]; then
  for candidate in "${CODEX_WORKSPACE_ROOT:-}" "${CODEX_PROJECT_DIR:-}" "$PWD"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      if git -C "$candidate" rev-parse --show-toplevel >/dev/null 2>&1; then
        export CLAUDE_PROJECT_DIR="$(git -C "$candidate" rev-parse --show-toplevel)"
        break
      fi
    fi
  done
fi

if [ -z "${CLAUDE_PROJECT_DIR:-}" ]; then
  export CLAUDE_PROJECT_DIR="$PWD"
fi

cd "$CLAUDE_PROJECT_DIR"
exec node "$SOURCE_SERVER"
