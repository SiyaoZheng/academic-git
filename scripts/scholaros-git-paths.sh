#!/bin/bash
# Shared path resolution for the ScholarOS Git CLI integration layer.

scholaros_git_project_dir() {
  printf '%s\n' "${SCHOLAROS_GIT_PROJECT_DIR:-${SCHOLAROS_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}}"
}


scholaros_git_find_config_path() {
  local repo_dir="${1:-.}"
  local candidate
  for candidate in \
    "$repo_dir/.scholaros_git.json" \
    "$repo_dir/.scholaros-git.json" \
    "$repo_dir/.scholaros.json"
  do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' "$repo_dir/.scholaros_git.json"
}


scholaros_git_find_routing_path() {
  local repo_dir="${1:-.}"
  local candidate
  for candidate in "$repo_dir/.scholaros-routing.json"; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' "$repo_dir/.scholaros-routing.json"
}
