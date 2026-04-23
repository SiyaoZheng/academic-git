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
if echo "$CMD" | grep -qE '(^|\s|&&|\|\||;|\||\$\(|`)(\s*)gh\s+issue\s+create\b'; then
  cat <<'EOF'
{"decision": "block", "reason": "Direct gh issue create is blocked. Use codex-gh-issue-start so the Issue, linked branch, and dedicated worktree are created together."}
EOF
  exit 0
fi

if echo "$CMD" | grep -qE '(^|\s|&&|\|\||;|\||\$\(|`)(\s*)(git|gh)\s'; then
  cat <<'EOF'
{"decision": "block", "reason": "Direct git/gh commands are blocked. Use academic-git MCP tools for existing workflow actions, and codex-gh-issue-start for new implementation Issues."}
EOF
  exit 0
fi

# Not a git/gh command — approve
exit 0
