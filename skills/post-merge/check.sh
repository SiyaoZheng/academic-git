#!/bin/bash
# check.sh for post-merge skill
# PostToolUse hook: after merge, output open issues + tag suggestion + unlock branch
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

OUTPUT=""

# --- Open issues ---
ISSUES=$(gh issue list --state open --limit 10 2>/dev/null || echo "(gh not available)")
OUTPUT="${OUTPUT}[academic-git] Post-merge status:\\n\\nOpen Issues:\\n${ISSUES}"

# --- Tag suggestion: check if merged PR has milestone keywords ---
MERGE_MSG=$(git log -1 --merges --format="%s %b" 2>/dev/null || echo "")
if echo "$MERGE_MSG" | grep -qiE 'email|meeting|conference|submit|send|deadline'; then
  TAG_DATE=$(date +%Y-%m-%d)
  OUTPUT="${OUTPUT}\\n\\n[academic-git] Milestone keywords detected. Consider: create_tag(name='email-${TAG_DATE}', message='...')"
fi

# --- Unlock branch: clear locked_branch in .academic-git.json ---
if [ -f ".academic-git.json" ]; then
  python3 -c "
import json
try:
    with open('.academic-git.json', 'r') as f:
        d = json.load(f)
    if 'locked_branch' in d:
        del d['locked_branch']
    if 'locked_issue' in d:
        del d['locked_issue']
    with open('.academic-git.json', 'w') as f:
        json.dump(d, f, indent=2)
except: pass
" 2>/dev/null || true
  OUTPUT="${OUTPUT}\\n\\n[academic-git] Branch lock cleared."
fi

echo "{\"supplementary_output\": \"${OUTPUT}\"}"
exit 0
