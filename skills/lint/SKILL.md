---
name: lint
description: Run the Academic Git local data-science lint pass. Use when Adrian asks for local lint, Python lint, R lint, ruff, lintr, or a quick static check before pushing.
allowed-tools: ["academic-git"]
---

# Lint — Local Python/R Static Checks

This skill runs only the two configured local lint commands:

- `lint.python`
- `lint.r`

Do not add Quarto lint, research-policy lint, data-pipeline lint, or Git safety lint to this skill. Those belong to separate gates if Adrian asks for them later.

## Configuration

Commands live in the project `.fu_git.json` file. Legacy `.academic-git.json` remains readable during migration:

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

1. Run `fu_git lint --target all`.
2. If only one language is requested, run `fu_git lint --target python` or `fu_git lint --target r`.
3. Treat non-zero lint results as failures to fix before pushing, but do not confuse lint with the remote CI render gate.

## Boundary

Local lint is fast feedback for Codex and Adrian. GitHub Actions remains the authoritative remote reproducibility check for whether the project formal entry point runs in a clean environment.
