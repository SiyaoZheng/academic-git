# ECC for Codex CLI

This supplements the root `AGENTS.md` with a repo-local ECC baseline.

## Repo Skill

- Repo-generated Codex skill: `.agents/skills/scholaros/SKILL.md`
- Claude-facing companion skill: `.claude/skills/scholaros/SKILL.md`
- Keep user-specific credentials and personal tool config in `~/.codex/config.toml`, not in this repo.

## Repo Baseline

Treat `.codex/config.toml` as the default ECC-safe baseline for work in this repository.
The generated baseline keeps sandbox/web defaults plus multi-agent settings only; repo-local MCP entries have been removed.

## Multi-Agent Support

- Explorer: read-only evidence gathering
- Reviewer: correctness, security, and regression review
- Docs researcher: API and release-note verification

## Workflow Files

- No dedicated workflow command files were generated for this repo.

Use these workflow files as reusable task scaffolds when the detected repository workflows recur.
