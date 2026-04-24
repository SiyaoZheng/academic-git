---
name: os-noise-guard
description: Prevent macOS and Windows metadata files from polluting fu worktrees and blocking session cleanup.
---

# OS Noise Guard

## Source Repo Self-Disable

If the current repo top-level contains Fu's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

Prevent macOS and Windows filesystem metadata from making fu worktrees
or nested project checkouts appear dirty.

## Purpose

This hook is intentionally narrow. It treats operating-system metadata as
workflow noise, not research evidence:

- Ensures the user's global Git excludes file contains common OS metadata
  patterns.
- Removes only those metadata files/directories from the current repository
  tree, including nested Git working trees.
- Blocks Stop when nested Git repositories remain dirty after cleanup, so real
  child repository changes are handled explicitly before the session ends.

## Hook Events

- `SessionStart`: repair global ignore settings early and surface dirty nested
  repositories in the startup context without blocking startup.
- `Stop`: clean OS noise before the dirty-worktree guard decides whether to
  block the session end; block if any nested repository is still dirty.

The guard is narrow-blocking. A successful metadata cleanup or global-ignore
repair never blocks. Remaining nested repository changes do block Stop because
they are no longer OS-noise false positives.

## Non-Goals

- Do not run `git clean -Xfd`; ignored caches such as `node_modules` are not OS
  metadata and must not be removed.
- Do not hide real nested repository changes. Anything remaining after OS-noise
  cleanup is surfaced as a dirty nested repository.
- Do not depend on `.fu.json`; plugin activation is system-level.
