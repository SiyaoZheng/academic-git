#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
skills_dir="$repo_root/.agents/skills"
runtime_root="$skills_dir/gstack"
claude_skills_dir="$repo_root/.claude/skills"

find_local_gstack() {
  local candidate=""
  local worktree_path=""

  for candidate in \
    "${GSTACK_ROOT:-}" \
    "$HOME/gstack" \
    "$HOME/.claude/skills/gstack"; do
    if [ -n "$candidate" ] && [ -x "$candidate/setup" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  while IFS= read -r worktree_path; do
    [ -n "$worktree_path" ] || continue

    if [ -x "$worktree_path/.agents/skills/gstack/setup" ]; then
      printf '%s\n' "$worktree_path/.agents/skills/gstack"
      return 0
    fi

    if [ -x "$worktree_path/external/gstack/setup" ]; then
      printf '%s\n' "$worktree_path/external/gstack"
      return 0
    fi
  done < <(git worktree list --porcelain | awk '/^worktree / {print substr($0, 10)}')

  return 1
}

link_path() {
  local src="$1"
  local dst="$2"

  mkdir -p "$(dirname "$dst")"

  if [ -L "$dst" ]; then
    ln -snf "$src" "$dst"
    return 0
  fi

  if [ -d "$dst" ]; then
    rm -rf "$dst"
  elif [ -e "$dst" ]; then
    rm -f "$dst"
  fi

  ln -snf "$src" "$dst"
}

link_claude_skill_dirs() {
  local gstack_dir="$1"
  local skills_root="$2"
  local skill_dir=""

  for skill_dir in "$gstack_dir"/*/; do
    [ -d "$skill_dir" ] || continue
    [ -f "$skill_dir/SKILL.md" ] || continue

    local dir_name
    local skill_name
    local link_name
    local target_dir

    dir_name="$(basename "$skill_dir")"
    [ "$dir_name" = "node_modules" ] && continue

    skill_name="$(grep -m1 '^name:' "$skill_dir/SKILL.md" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '[:space:]')"
    [ -z "$skill_name" ] && skill_name="$dir_name"

    case "$skill_name" in
      gstack-*) link_name="$skill_name" ;;
      *) link_name="gstack-$skill_name" ;;
    esac

    target_dir="$skills_root/$link_name"
    mkdir -p "$target_dir"
    link_path "$gstack_dir/$dir_name/SKILL.md" "$target_dir/SKILL.md"
  done
}

gstack_root="$(find_local_gstack || true)"
if [ -z "$gstack_root" ]; then
  echo "Conductor setup failed: could not find a local gstack checkout." >&2
  echo "Checked:" >&2
  echo "  - \$GSTACK_ROOT" >&2
  echo "  - $HOME/gstack" >&2
  echo "  - $HOME/.claude/skills/gstack" >&2
  echo "  - <worktree>/.agents/skills/gstack" >&2
  echo "  - <worktree>/external/gstack" >&2
  exit 1
fi

agents_source_dir="$gstack_root/.agents/skills"

needs_build=0
for required_path in \
  "$gstack_root/browse/dist/browse" \
  "$gstack_root/design/dist/design" \
  "$gstack_root/make-pdf/dist/pdf" \
  "$agents_source_dir/gstack/SKILL.md" \
  "$agents_source_dir/gstack-review/SKILL.md"; do
  if [ ! -e "$required_path" ]; then
    needs_build=1
    break
  fi
done

if [ "$needs_build" -eq 1 ]; then
  (
    cd "$gstack_root"
    bun install --frozen-lockfile 2>/dev/null || bun install
    bun run build
  )

  if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
    for bin_path in \
      "$gstack_root/browse/dist/browse" \
      "$gstack_root/browse/dist/find-browse" \
      "$gstack_root/design/dist/design" \
      "$gstack_root/make-pdf/dist/pdf" \
      "$gstack_root/bin/gstack-global-discover"; do
      [ -f "$bin_path" ] && [ -x "$bin_path" ] || continue
      codesign --remove-signature "$bin_path" 2>/dev/null || true
      codesign -s - -f "$bin_path" 2>/dev/null || true
    done
  fi
fi

mkdir -p "$skills_dir"
mkdir -p "$runtime_root" "$runtime_root/agents" "$runtime_root/browse" "$runtime_root/design" "$runtime_root/gstack-upgrade" "$runtime_root/review"
rm -rf "$runtime_root/gstack"

link_path "$agents_source_dir/gstack/SKILL.md" "$runtime_root/SKILL.md"
if [ -f "$agents_source_dir/gstack/agents/openai.yaml" ]; then
  link_path "$agents_source_dir/gstack/agents/openai.yaml" "$runtime_root/agents/openai.yaml"
fi
link_path "$gstack_root/bin" "$runtime_root/bin"
link_path "$gstack_root/browse" "$runtime_root/browse"
link_path "$gstack_root/design/dist" "$runtime_root/design/dist"
link_path "$gstack_root/qa" "$runtime_root/qa"
link_path "$gstack_root/review" "$runtime_root/review"
link_path "$gstack_root/ETHOS.md" "$runtime_root/ETHOS.md"
if [ -f "$agents_source_dir/gstack-upgrade/SKILL.md" ]; then
  link_path "$agents_source_dir/gstack-upgrade/SKILL.md" "$runtime_root/gstack-upgrade/SKILL.md"
fi

for skill_dir in "$agents_source_dir"/gstack*/; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  [ "$skill_name" = "gstack" ] && continue
  if [ -f "$skill_dir/SKILL.md" ]; then
    link_path "$skill_dir" "$skills_dir/$skill_name"
  fi
done

mkdir -p "$claude_skills_dir"
link_path "$gstack_root" "$claude_skills_dir/gstack"
link_claude_skill_dirs "$gstack_root" "$claude_skills_dir"
link_path "gstack/open-gstack-browser" "$claude_skills_dir/gstack-connect-chrome"

echo "Conductor setup: repo-local gstack ready from $gstack_root"
