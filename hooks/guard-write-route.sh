#!/bin/bash
# PreToolUse hook: block direct git/gh CLI usage in Bash
# Forces all git operations through the academic-git MCP server.

set -euo pipefail

INPUT=$(cat 2>/dev/null || echo "")

# Extract the command from tool input
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then
  exit 0  # No command = approve (not a Bash call)
fi

# Check for git/gh commands
# Match: starts with git/gh, or contains && git, || git, ; git, | git, $( git, ` git
if echo "$CMD" | grep -qE '(^|\s|&&|\|\||;|\||\$\(|`)(\s*)(git|gh)\s'; then
  cat <<'EOF'
{"decision": "block", "reason": "Direct git/gh commands are blocked. Use academic-git MCP tools instead, except use codex-gh-issue-start or start_issue for new GitHub issues. Allowed MCP tools: start_issue, resume_issue, refine_issue, check_issue, create_commit, prepare_pr, open_pr, merge_pr, switch_branch, status, diff, log, list_issues, view_issue, view_pr, list_branches, create_tag, current_branch."}
EOF
  exit 0
fi

# Not a git/gh command — approve
exit 0
