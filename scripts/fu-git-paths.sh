#!/bin/bash
# Shared path resolution for the Fu Git CLI integration layer.

fu_git_project_dir() {
  printf '%s\n' "${FU_GIT_PROJECT_DIR:-${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}}"
}


fu_git_find_config_path() {
  local repo_dir="${1:-.}"
  local candidate
  for candidate in \
    "$repo_dir/.fu_git.json" \
    "$repo_dir/.fu-git.json" \
    "$repo_dir/.academic-git.json"
  do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' "$repo_dir/.fu_git.json"
}


fu_git_find_routing_path() {
  local repo_dir="${1:-.}"
  local candidate
  for candidate in \
    "$repo_dir/.fu-routing.json" \
    "$repo_dir/.academic-git-routing.json"
  do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' "$repo_dir/.fu-routing.json"
}
