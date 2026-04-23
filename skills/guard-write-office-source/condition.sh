#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
COMMAND_STR="$(printf '%s' "$INPUT" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("tool_input", {}).get("command", ""))' 2>/dev/null || true)"

if printf '%s' "$COMMAND_STR" | grep -qiE '\.(docx|xlsx|pptx)\b'; then
  exit 0
fi

REPO_DIR="$(printf '%s' "$INPUT" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("cwd") or data.get("tool_input", {}).get("cwd", ""))' 2>/dev/null || true)"
if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || exit 1

if git diff --name-only HEAD -- '*.docx' '*.xlsx' '*.pptx' 2>/dev/null | grep -q .; then
  exit 0
fi

if git ls-files --others --exclude-standard -- '*.docx' '*.xlsx' '*.pptx' 2>/dev/null | grep -q .; then
  exit 0
fi

exit 1
