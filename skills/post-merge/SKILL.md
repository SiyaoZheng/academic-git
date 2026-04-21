---
name: post-merge
description: Post-merge flow — tag, next issue routing, branch unlock. Triggered automatically after merge_pr.
allowed-tools: ["academic-git"]
---

# Post-Merge Flow

After a PR is merged, guide the next steps.

## DISPATCH

Triggered when:
- `merge_pr` MCP tool completes
- Hook output shows open issues + tag suggestion

## BEHAVIOR

### 1. Read Hook Output

The PostToolUse hook on `merge_pr` outputs:
- Open issues list
- Tag suggestion (if milestone keywords detected)
- Branch lock cleared

### 2. Tag Judgment

If the hook detected milestone keywords (email, meeting, conference, submit, deadline):
- Ask Adrian: "Is this a milestone delivery? Should I create a tag?"
- If yes → `create_tag(name="email-YYYY-MM-DD", message="...")`

### 3. Next Issue Routing

Show the open issues from hook output.
Ask Adrian which one to pick → route to `/begin`.

### 4. Linear Sync

If `LINEAR_SYNC_ENABLED=true`:
- The hook already mirrored the merge to Linear
- No additional action needed

## OUTPUT RULES

- Always show open issues after merge
- Always ask about tag for milestones
- Branch lock is auto-cleared by the hook

## NON-GOALS

- This skill does NOT start working on the next issue — that's `/begin`
- This skill does NOT push tags — `create_tag` MCP tool does that
