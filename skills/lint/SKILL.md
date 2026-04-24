---
name: lint
description: Run the Fu local data-science lint pass. Use when Adrian asks for local lint, Python lint, R lint, ruff, lintr, or a quick static check before pushing.
allowed-tools: ["fu"]
---

# Lint — Local Python/R Static Checks

## Source Repo Self-Disable

If the current repo top-level contains Fu's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

This skill runs only the two configured local lint commands:

- `lint.python`
- `lint.r`

Do not add Quarto lint, research-policy lint, data-pipeline lint, or Git safety lint to this skill. Those belong to separate gates if Adrian asks for them later.

## Configuration

Commands live in the project `.fu.json` file:

```json
{
  "lint": {
    "python": "ruff check --select E9,F63,F7,F82 .",
    "r": "Rscript -e 'l <- lintr::lint_dir(\"R\", linters = list()); print(l); quit(status = length(l) > 0)'"
  }
}
```

Projects may choose stricter commands or leave either command blank. The plugin should not hardcode project paths.

## Workflow

1. Run the `fu` `lint` tool with `target: "all"`.
2. If only one language is requested, run `lint` with `target: "python"` or `target: "r"`.
3. Treat non-zero lint results as failures to fix before pushing, but do not confuse lint with the remote CI render gate.

## Boundary

Local lint is fast feedback for Codex and Adrian. GitHub Actions remains the authoritative remote reproducibility check for whether the project formal entry point runs in a clean environment.
