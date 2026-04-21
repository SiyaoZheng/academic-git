---
name: commit
description: Commit uncommitted changes. Auto-analyzes diffs, generates conventional commit messages, supports grouped commits. Triggered by Stop hook. Add `pr` to create a draft PR.
argument-hint: "[optional: commit message | pr | draft | local | push]"
allowed-tools: ["Bash", "Read", "Glob"]
---

# Git Commit Skill

Two commit mechanisms exist. Do not confuse them:

| Mechanism | Trigger | Message format | Purpose |
|-----------|---------|----------------|---------|
| `auto-commit.sh` (Stop hook) | Dirty files after any Claude response | `wip: <files>` | Safety net — prevents data loss. NOT a real commit. |
| `/commit` (this skill) | Checklist item completed | `type(#N/X): description` | Real commit — tied to Issue checklist. Checks off item. |

**The Issue is the SSOT.** Claude only invokes `/commit` when a checklist item is genuinely done. The trigger is "item X is complete", not "files are dirty".

## Parameters (mandatory on `feat/*` branches)

On a `feat/*` branch, every `/commit` invocation must resolve two parameters:

1. **Issue number** (`#N`) — the linked Issue
2. **Checklist item** (`X`) — the letter ID of the completed item (A, B, C...)

Claude determines these by reading the Issue (`gh issue view N`), not from `$ARGUMENTS`.

On `main` or non-feature branches, these parameters are not required.

## Commit Message Format

```
type(#N/X): description
```

Examples:
- `feat(#5/B): add cluster standard errors to Table 3`
- `fix(#12/A): correct income variable coding`
- `refactor(#8/C): extract robustness checks into separate script`

## Modes

| Invocation | Behavior |
|------------|----------|
| `/commit` | commit + **auto push** (default, ADHD-friendly) |
| `/commit pr` | commit + push + draft PR (triggers when all items `[x]`) |
| `/commit draft` | same as `pr` |
| `/commit local` | local commit only, no push |

## Workflow

### Step 1: Read Issue (on feat/* branches)

Before anything else, read the SSOT:

```bash
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" == feat/* ]]; then
  # Find Issue number linked to this branch
  ISSUE_NUM=$(gh issue list --state open --json number,title --jq '.[].number' 2>/dev/null | head -1)
  gh issue view "$ISSUE_NUM" --json body --jq '.body'
fi
```

From the Issue body, identify:
- Which items are `[x]` (done) and which are `[ ]` (pending)
- The next item whose `→ after:` predecessors are all `[x]`
- Whether the work just completed matches a pending item

If no pending item matches the current changes → do NOT commit. Ask Adrian.

### Step 2: Check Uncommitted Changes

```bash
git status --short
```

Classify change types:
- M — modified
- ?? — untracked (new file)
- D — deleted
- R — renamed

### Step 3: Analyze Changes

Map file paths to change categories:

| Path Pattern | Category |
|-------------|----------|
| R/ or analysis/ or code/ | Research code / analysis |
| data/ or _targets/ | Data / pipeline artifacts |
| paper/ or manuscript/ | Paper / manuscript |
| .claude/skills/ | Skill configuration |
| docs/ or README | Documentation |
| src/ | Source code |
| Other | Project config / misc |

### Step 4: Decide Commit Strategy

Single-topic changes: commit all files together.

Multi-topic changes: group by logical theme.

Grouping priority:
1. Analysis code (one commit per analysis step)
2. Data / pipeline artifacts (merge into one commit)
3. Paper / manuscript (separate commit)
4. Skills / config files (merge into one commit)

### Step 5: Generate Commit Message

On `feat/*` branch (mandatory format):
```
type(#N/X): description
```
- `#N` = Issue number, `X` = checklist item letter
- Types: feat / fix / refactor / docs / chore / perf / test / ci
- Description in English, concise, imperative mood

On `main` or non-feature branches (standard format):
```
type: description
```

### Step 6: Codex Review (before commit)

Stage files first, then run Codex against the staged diff:

```bash
git add <file1> <file2> ...
STAGED_DIFF=$(git diff --cached --stat)

node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task \
  "Review this commit. Check: (1) any silent error swallowed? (2) any hardcoded value that should be config? (3) anything that breaks reproducibility? Reply PASS or list problems.\n\nCOMMIT: ${COMMIT_MSG}\n\nDIFF STAT:\n${STAGED_DIFF}" \
  --wait
```

If Codex finds problems, fix before committing. If PASS, proceed.

### Step 7: Execute Commit

```bash
# On feat/* branch:
git commit -m "type(#N/X): description"

# On main or non-feature:
git commit -m "type: description"
```

Rules:
- Files are already staged from Step 5 — do not re-add
- Never add sensitive files (.env, credentials, API keys)
- Exclude temp files (.bak-*, .DS_Store, *.Rproj.user/)
- On `feat/*`: commit message MUST contain `(#N/X)` — reject if missing

### Step 8: Check Off Issue Item

If on a `feat/*` branch linked to an Issue, check off the completed checklist item(s):

```bash
# Find linked Issue number from branch or PR
ISSUE_NUM=$(gh pr list --head "$BRANCH" --json body --jq '.[0].body' 2>/dev/null \
  | grep -oP 'Closes #\K\d+' || echo "")

if [ -n "$ISSUE_NUM" ]; then
  # Read current body, replace matching "- [ ]" with "- [x]"
  BODY=$(gh issue view "$ISSUE_NUM" --json body --jq '.body')
  # Claude edits the body to check off the item(s) this commit addresses
  gh issue edit "$ISSUE_NUM" --body "$UPDATED_BODY"
fi
```

Rules:
- Match commit content to the most relevant unchecked item(s)
- Only check off items that are genuinely completed, not partially done
- **DAG enforcement**: before starting the NEXT item, verify all its `→ after:` predecessors are `[x]`. If not, stop and resolve the blocked predecessor first.
- If all items are now `[x]` → this triggers the completion flow (PR → merge → main)

### Step 9: Auto Push

Unless `local` is specified, push after commit:

```bash
BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ]; then
  echo "WARNING: detached HEAD — commit saved locally, skipping push."
else
  if git remote get-url origin &>/dev/null; then
    # Fire-and-forget push with 10s kill (prevent zombie on proxy down)
    ( git push -u origin "$BRANCH" &>/dev/null &
      PUSH_PID=$!
      ( sleep 10 && kill "$PUSH_PID" 2>/dev/null ) &
      wait "$PUSH_PID" 2>/dev/null ) &
    disown
  fi
fi
```

Push failure is reported (not silent) but does not block the session.

### Step 10: Confirm Result

```bash
git log --oneline -3
```

## PR Flow (`/commit pr` or `/commit draft`)

When creating a PR:

### 1. Create Branch (if needed)

If on main/master, create a feature branch:

```bash
DESC="<one-two word description>"
BRANCH="feat/$(echo "$DESC" | sed 's/^[a-z]*: //' | tr ' [:upper:]' '-[:lower:]' | tr -cd 'a-z0-9-' | head -c 40)"
git switch -c "$BRANCH"
```

Branch naming: `feat/<slug>` / `fix/<slug>` / `refactor/<slug>`

If already on a feature branch, skip.

### 2. Push

```bash
# Fire-and-forget with timeout
( git push -u origin "$BRANCH" &>/dev/null &
  PUSH_PID=$!
  ( sleep 10 && kill "$PUSH_PID" 2>/dev/null ) &
  wait "$PUSH_PID" 2>/dev/null )
```

### 3. Collect PR Context

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH="main"

git log "$DEFAULT_BRANCH"..HEAD --oneline
git diff "$DEFAULT_BRANCH"...HEAD --stat
```

### 4. Select PR Template

Choose template based on branch prefix and change content:

---

#### Template A: Feature (new analysis, figure, section)

```markdown
Closes #N

## Summary
- What was added and why

## Key Changes
- `path/to/file.R` — new robustness analysis
- `paper/section3.qmd` — added results table

## Specification Decisions
- [ ] Variable construction: [describe choices made]
- [ ] Sample restriction: [describe if applicable]

## Verification
- [ ] Run `Rscript R/analysis.R` — check output matches expectations
- [ ] Figures render correctly in `paper/`
```

#### Template B: Fix (data bug, calculation error, convergence issue)

```markdown
Closes #N

## Problem
- What was wrong and how it was discovered

## Root Cause
- Why it happened

## Fix
- What was changed

## Verification
- [ ] Before: [describe incorrect output]
- [ ] After: [describe correct output]
- [ ] No other analyses affected
```

#### Template C: Revision (responding to peer review)

```markdown
Closes #N

## Reviewer Request
- What the reviewer asked for (quote or paraphrase)

## Response
- What was done to address it

## Changes
- `path/to/file` — description

## Verification
- [ ] Response addresses the reviewer's concern
- [ ] No unintended side effects on other results
```

#### Template D: Docs / Config (README, methodology notes, project config)

```markdown
Closes #N

## Summary
- What was updated and why

## Changes
- `path/to/file` — description
```

---

### 5. Codex Review (before PR creation)

Run Codex to challenge the PR before submitting. Keep the prompt minimal:

```bash
DIFF_STAT=$(git diff "$DEFAULT_BRANCH"...HEAD --stat)
COMMIT_LOG=$(git log "$DEFAULT_BRANCH"..HEAD --oneline)

node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task \
  "Review this PR diff. Check: (1) any untested specification change? (2) any silent error swallowed? (3) scope creep beyond the Issue? Reply PASS or list problems.\n\nCOMMITS:\n${COMMIT_LOG}\n\nDIFF STAT:\n${DIFF_STAT}" \
  --wait
```

If Codex finds problems, fix them before creating the PR. If PASS, proceed.

### 6. Create Draft PR (no confirmation needed)

```bash
gh pr create --draft --title "<type>: <description>" --base "$DEFAULT_BRANCH" --body "$(cat <<'EOF'
<filled template>
EOF
)"
```

Use `--draft` to prevent accidental merge. Adrian can mark "Ready for review" on GitHub.

### 7. Return PR URL

Output the PR link.

## Exclusion Rules

These files are never committed:
- .env / .env.* — secrets and environment variables
- *.bak-* — backup files
- .DS_Store — macOS system files
- node_modules/ — dependency directory
- *.Rproj.user/ — RStudio user files
- .Rhistory — R history file
- _targets/ — R targets pipeline cache (can be GBs)
- .Rdata / .RData — R workspace dumps
- *.rds — R serialized objects
- *.feather / *.parquet / *.arrow — columnar data files
- __pycache__/ — Python bytecode
- .ipynb_checkpoints/ — Jupyter autosave
- data/ files >1MB (small lookup tables are OK)
