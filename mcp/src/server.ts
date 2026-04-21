import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";

// ── Helpers ──

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd: cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function runSafe(cmd: string, cwd?: string): string {
  try {
    return run(cmd, cwd);
  } catch (e: any) {
    return e.stderr?.trim() ?? e.message;
  }
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function err(s: string) {
  return { content: [{ type: "text" as const, text: `ERROR: ${s}` }], isError: true };
}

function repoDir(): string {
  const d = process.env.CLAUDE_PROJECT_DIR;
  if (!d) throw new Error("CLAUDE_PROJECT_DIR not set");
  return d;
}

// ── MCP Server ──

const server = new McpServer({
  name: "academic-git",
  version: "0.1.0",
});

// ════════════════════════════════════════
//  READ TOOLS
// ════════════════════════════════════════

server.tool(
  "status",
  "Show working tree status (modified, new, deleted files)",
  {},
  async () => {
    const out = runSafe("git status --short");
    return text(out || "(clean)");
  }
);

server.tool(
  "diff",
  "Show all uncommitted changes (working tree vs last commit)",
  { path: z.string().optional().describe("Specific file path to diff") },
  async ({ path }) => {
    const target = path ? `-- "${path}"` : "";
    const out = runSafe(`git diff HEAD ${target}`);
    return text(out || "(no changes)");
  }
);

server.tool(
  "log",
  "Show recent commit history",
  { count: z.number().default(10).describe("Number of commits to show") },
  async ({ count }) => {
    const out = run(`git log --oneline -${count}`);
    return text(out);
  }
);

server.tool(
  "current_branch",
  "Show the current branch name",
  {},
  async () => {
    const branch = run("git branch --show-current");
    return text(branch);
  }
);

// ════════════════════════════════════════
//  ISSUE TOOLS
// ════════════════════════════════════════

server.tool(
  "list_issues",
  "List open GitHub Issues for the current repo",
  { limit: z.number().default(20).describe("Max issues to return") },
  async ({ limit }) => {
    const out = run(`gh issue list --state open --limit ${limit} --json number,title,labels`);
    return text(out);
  }
);

server.tool(
  "view_issue",
  "View a GitHub Issue (body + comments = current truth)",
  { issue: z.number().describe("Issue number") },
  async ({ issue }) => {
    const body = run(`gh issue view ${issue} --json title,body,state,comments --jq '{title, body, state, comments: [.comments[] | {body, createdAt, author: .author.login}]}'`);
    return text(body);
  }
);

server.tool(
  "create_issue",
  "Create a new GitHub Issue. Body MUST follow the DAG checklist template (Context, Task with letter IDs + dependencies, Scope, Affected Files, Verification).",
  {
    title: z.string().describe("Issue title — concise, action-oriented"),
    body: z.string().describe("Issue body — must include ## Context, ## Task (DAG checklist), ## Scope, ## Affected Files, ## Verification"),
  },
  async ({ title, body }) => {
    // Validate template sections
    const required = ["## Context", "## Task", "## Scope"];
    const missing = required.filter((s) => !body.includes(s));
    if (missing.length > 0) {
      return err(`Issue body missing required sections: ${missing.join(", ")}`);
    }

    // Validate checklist items have letter IDs
    const checklistLines = body.split("\n").filter((l) => /^- \[ \] [A-Z]\./.test(l));
    if (checklistLines.length === 0) {
      return err("Issue body must contain at least one checklist item (format: - [ ] A. description)");
    }

    const out = run(`gh issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`);
    return text(out);
  }
);

server.tool(
  "refine_issue",
  "Add a refinement comment to an Issue. Body is NEVER modified — all changes via append-only comments.",
  {
    issue: z.number().describe("Issue number"),
    action: z.enum(["added", "removed", "scope-change", "context-update"]).describe("Type of change"),
    items_affected: z.string().describe("Which items or sections affected (e.g., 'A, B, E' or 'scope')"),
    detail: z.string().describe("Precise description of what changed"),
    reason: z.string().describe("Why this change was made"),
    requested_by: z.string().default("Adrian").describe("Who requested the change"),
  },
  async ({ issue, action, items_affected, detail, reason, requested_by }) => {
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const comment = `**Refinement (${timestamp})**

**Action:** ${action}
**Items affected:** ${items_affected}
**Detail:**
${detail}

**Reason:** ${reason}
**Requested by:** ${requested_by}`;

    const out = run(`gh issue comment ${issue} --body ${JSON.stringify(comment)}`);
    return text(out);
  }
);

server.tool(
  "check_item",
  "Check off a completed checklist item on an Issue. Only toggles the specific item — no other body changes allowed.",
  {
    issue: z.number().describe("Issue number"),
    letter: z.string().regex(/^[A-Z]$/).describe("Checklist item letter (A-Z)"),
  },
  async ({ issue, letter }) => {
    const body = run(`gh issue view ${issue} --json body --jq '.body'`);

    // Only toggle the matching checkbox
    const pattern = new RegExp(`^- \\[ \\] ${letter}\\.`, "m");
    if (!pattern.test(body)) {
      // Check if already done
      const donePattern = new RegExp(`^- \\[x\\] ${letter}\\.`, "m");
      if (donePattern.test(body)) {
        return err(`Item ${letter} is already checked off`);
      }
      return err(`Item ${letter} not found in Issue #${issue}`);
    }

    const updated = body.replace(pattern, `- [x] ${letter}.`);
    run(`gh issue edit ${issue} --body ${JSON.stringify(updated)}`);
    return text(`Checked off item ${letter} on Issue #${issue}`);
  }
);

// ════════════════════════════════════════
//  COMMIT TOOLS
// ════════════════════════════════════════

server.tool(
  "commit",
  "Create a formal commit tied to a specific Issue checklist item. Format: type(#N/X): description. Auto adds all changes, commits, and pushes.",
  {
    issue: z.number().describe("Issue number"),
    item: z.string().regex(/^[A-Z]$/).describe("Checklist item letter (A-Z)"),
    type: z.enum(["feat", "fix", "refactor", "docs", "test", "chore", "perf"]).describe("Commit type"),
    description: z.string().describe("Commit description (imperative mood)"),
  },
  async ({ issue, item, type, description }) => {
    // Verify issue exists and item is valid
    const body = run(`gh issue view ${issue} --json body --jq '.body'`);
    const itemPattern = new RegExp(`^- \\[ \\] ${item}\\.`, "m");
    if (!itemPattern.test(body)) {
      const donePattern = new RegExp(`^- \\[x\\] ${item}\\.`, "m");
      if (donePattern.test(body)) {
        return err(`Item ${item} is already completed`);
      }
      return err(`Item ${item} not found in Issue #${issue}`);
    }

    // Check DAG: all predecessors must be [x]
    const lines = body.split("\n");
    const itemLine = lines.find((l) => new RegExp(`^- \\[ \\] ${item}\\.`).test(l));
    const afterMatch = itemLine?.match(/→ after: ([A-Z,\s]+)/);
    if (afterMatch) {
      const predecessors = afterMatch[1].split(",").map((s) => s.trim());
      for (const pred of predecessors) {
        const predDone = new RegExp(`^- \\[x\\] ${pred}\\.`, "m");
        if (!predDone.test(body)) {
          return err(`DAG blocked: predecessor ${pred} is not completed yet`);
        }
      }
    }

    // Stage all changes
    run("git add -A");

    // Check something is staged
    const staged = runSafe("git diff --cached --stat");
    if (!staged) {
      return err("Nothing to commit (working tree clean)");
    }

    // Commit
    const msg = `${type}(#${issue}/${item}): ${description}`;
    run(`git commit -m ${JSON.stringify(msg)}`);

    // Push
    const branch = run("git branch --show-current");
    runSafe(`git push -u origin "${branch}"`);

    return text(`Committed: ${msg}\nPushed to ${branch}`);
  }
);

server.tool(
  "wip",
  "Create a wip snapshot commit (safety net, not a formal commit). Auto adds, commits, and pushes.",
  {},
  async () => {
    run("git add -A");

    const staged = runSafe("git diff --cached --stat");
    if (!staged) {
      return text("Nothing to commit (clean)");
    }

    const files = run("git diff --cached --name-only").split("\n");
    const msg =
      files.length <= 2
        ? `wip: ${files.join(", ")}`
        : `wip: ${files[0]} + ${files.length} files`;

    run(`git commit -m ${JSON.stringify(msg)} --no-verify`);

    const branch = runSafe("git branch --show-current");
    if (branch) {
      runSafe(`git push -u origin "${branch}"`);
    }

    return text(`wip committed: ${msg}`);
  }
);

// ════════════════════════════════════════
//  PR TOOLS
// ════════════════════════════════════════

server.tool(
  "create_pr",
  "Create a Pull Request. Validates all checklist items are [x] before allowing PR creation.",
  {
    issue: z.number().describe("Issue number this PR closes"),
    title: z.string().describe("PR title"),
    body: z.string().describe("PR body (must include Closes #N)"),
  },
  async ({ issue, title, body: prBody }) => {
    // Validate all checklist items are done
    const issueBody = run(`gh issue view ${issue} --json body --jq '.body'`);
    const unchecked = issueBody.split("\n").filter((l) => /^- \[ \] [A-Z]\./.test(l));

    // Filter out removed items (strikethrough)
    const realUnchecked = unchecked.filter((l) => !l.includes("~~"));
    if (realUnchecked.length > 0) {
      const items = realUnchecked.map((l) => l.match(/[A-Z]\./)?.[0] ?? "?").join(", ");
      return err(`Cannot create PR: uncompleted items: ${items}`);
    }

    // Validate Closes #N
    if (!prBody.includes(`Closes #${issue}`)) {
      return err(`PR body must include "Closes #${issue}"`);
    }

    const out = run(`gh pr create --title ${JSON.stringify(title)} --body ${JSON.stringify(prBody)}`);
    return text(out);
  }
);

server.tool(
  "merge_pr",
  "Squash-merge a PR and delete the branch. Returns to main.",
  { pr: z.number().describe("PR number") },
  async ({ pr }) => {
    run(`gh pr merge ${pr} --squash --delete-branch`);
    run("git switch main");
    run("git pull");
    return text(`PR #${pr} merged. Now on main.`);
  }
);

server.tool(
  "view_pr",
  "View a Pull Request",
  { pr: z.number().describe("PR number") },
  async ({ pr }) => {
    const out = run(`gh pr view ${pr} --json number,title,state,body,url`);
    return text(out);
  }
);

// ════════════════════════════════════════
//  BRANCH TOOLS
// ════════════════════════════════════════

server.tool(
  "create_branch",
  "Create a new feature branch from main. Naming: feat/<slug>",
  { slug: z.string().describe("Branch slug (lowercase, hyphens, max 40 chars)") },
  async ({ slug }) => {
    // Enforce naming
    const clean = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
    const branch = `feat/${clean}`;

    // Check if exists
    const existing = runSafe(`git branch --list "${branch}"`);
    if (existing.trim()) {
      run(`git switch "${branch}"`);
      return text(`Switched to existing branch ${branch}`);
    }

    run("git switch main");
    run("git pull");
    run(`git switch -c "${branch}"`);
    return text(`Created and switched to ${branch}`);
  }
);

server.tool(
  "switch_branch",
  "Switch to an existing branch",
  { branch: z.string().describe("Branch name (e.g., feat/revise-table-3)") },
  async ({ branch }) => {
    run(`git switch "${branch}"`);
    return text(`Switched to ${branch}`);
  }
);

server.tool(
  "list_branches",
  "List feature branches",
  {},
  async () => {
    const out = runSafe("git branch --list 'feat/*'");
    return text(out || "(no feature branches)");
  }
);

// ════════════════════════════════════════
//  TAG TOOLS
// ════════════════════════════════════════

server.tool(
  "create_tag",
  "Create a milestone tag on main. Types: email-YYYY-MM-DD, meeting-YYYY-MM-DD, chat-YYYY-MM-DD, conference-YYYY-MM-DD",
  {
    name: z.string().describe("Tag name (e.g., email-2026-04-21)"),
    message: z.string().describe("Tag message describing the milestone"),
  },
  async ({ name, message }) => {
    // Validate tag format
    const valid = /^(email|meeting|chat|conference)-\d{4}-\d{2}-\d{2}$/.test(name);
    if (!valid) {
      return err("Tag must match format: (email|meeting|chat|conference)-YYYY-MM-DD");
    }

    run(`git tag -a "${name}" -m ${JSON.stringify(message)}`);
    runSafe(`git push origin "${name}"`);
    return text(`Tag ${name} created and pushed`);
  }
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
