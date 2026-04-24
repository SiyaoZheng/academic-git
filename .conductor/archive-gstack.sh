#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
skills_dir="$repo_root/.agents/skills"
claude_skills_dir="$repo_root/.claude/skills"

rm -rf "$skills_dir/gstack"
rm -rf "$skills_dir"/gstack-*
rm -rf "$claude_skills_dir/gstack"
rm -rf "$claude_skills_dir"/gstack-*

if [ -d "$skills_dir" ] && [ -z "$(find "$skills_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  rmdir "$skills_dir" || true
  rmdir "$repo_root/.agents" || true
fi

if [ -d "$claude_skills_dir" ] && [ -z "$(find "$claude_skills_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  rmdir "$claude_skills_dir" || true
  rmdir "$repo_root/.claude" || true
fi

echo "Conductor archive: cleaned repo-local gstack links"
