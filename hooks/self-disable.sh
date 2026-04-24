#!/bin/bash
set -euo pipefail

scholaros_repo_root() {
  local candidate="${1:-}"
  if [ -z "$candidate" ]; then
    return 1
  fi
  git -C "$candidate" rev-parse --show-toplevel 2>/dev/null || return 1
}

scholaros_is_source_repo() {
  local candidate="${1:-$PWD}"
  local repo_root=""
  local plugin_name=""

  repo_root="$(scholaros_repo_root "$candidate" 2>/dev/null || true)"
  if [ -z "$repo_root" ]; then
    return 1
  fi

  [ -f "$repo_root/.codex-plugin/plugin.json" ] || return 1
  [ -f "$repo_root/hooks/codex/hooks.json" ] || return 1
  [ -f "$repo_root/skills/handle-issue/SKILL.md" ] || return 1

  plugin_name="$(jq -r '.name // empty' "$repo_root/.codex-plugin/plugin.json" 2>/dev/null || echo "")"
  [ "$plugin_name" = "scholaros" ]
}
