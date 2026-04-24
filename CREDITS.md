# Credits & References

Code and patterns in this project were informed by the following open-source projects.

## PR Body Generation (TODO #1)

| Repo | Stars | License | What we borrowed |
|------|-------|---------|-----------------|
| [Codium-ai/pr-agent](https://github.com/Codium-ai/pr-agent) | 10.9k | Apache-2.0 | PR description structure, diff-to-summary patterns |
| [jbrocher/auto-pr-body-generator](https://github.com/jbrocher/auto-pr-body-generator) | 19 | MIT | Template-based PR body from commit history |
| [coderabbitai/ai-pr-reviewer](https://github.com/coderabbitai/ai-pr-reviewer) | 2.1k | Apache-2.0 | Incremental review comment patterns |

## PR Quality Gates (TODO #2, #3)

| Repo | Stars | License | What we borrowed |
|------|-------|---------|-----------------|
| [danger/danger-js](https://github.com/danger/danger-js) | 5.5k | MIT | Programmable PR rules engine (Dangerfile pattern) |
| [Review-scope/ReviewScope](https://github.com/Review-scope/ReviewScope) | 21 | — | Issue-to-PR scope validation |
| [juliusz-cwiakalski/agentic-delivery-os](https://github.com/juliusz-cwiakalski/agentic-delivery-os) | 10 | — | Quality gate templates and SDLC pipeline |

## Linear Integration (TODO #7)

| Repo | Stars | License | What we borrowed |
|------|-------|---------|-----------------|
| [calcom/synclinear.com](https://github.com/calcom/synclinear.com) | 412 | AGPL-3.0 | Linear-GitHub bidirectional sync patterns |
| [jerhadf/linear-mcp-server](https://github.com/jerhadf/linear-mcp-server) | 344 | MIT | Linear integration tool definitions |
| [schpet/linear-cli](https://github.com/schpet/linear-cli) | 610 | MIT | Agent-friendly CLI patterns, JSON output |

## Post-Merge Automation (TODO #4)

Patterns informed by `semantic-release/semantic-release` (23.5k stars) and GitHub's native branch cleanup.

## CLI Workflow, Plugin, Research Constitution (TODO #5, #6, #8)

_(To be added as implementation proceeds)_
