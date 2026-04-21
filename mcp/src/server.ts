import { runAllGates, type GateContext, type GateMode } from "./gates.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

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

// ── Retry & Error Classification ──
// Borrowed from octokit/plugin-retry.js + plugin-throttling.js

const DO_NOT_RETRY_PATTERNS = [
  /not found/i,
  /permission denied/i,
  /authentication failed/i,
  /401|403|404|422/,
  /already exists/i,
];

const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /api rate limit/i,
  /secondary rate/i,
  /429/,
  /abuse detection/i,
];

const TRANSIENT_PATTERNS = [
  /500|502|503/,
  /connection timed out/i,
  /network error/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
];

function classifyGhError(stderr: string): "retry" | "fail" | "unknown" {
  if (RATE_LIMIT_PATTERNS.some((p) => p.test(stderr))) return "retry";
  if (DO_NOT_RETRY_PATTERNS.some((p) => p.test(stderr))) return "fail";
  if (TRANSIENT_PATTERNS.some((p) => p.test(stderr))) return "retry";
  return "unknown";
}

function parseGhError(stderr: string): string {
  // Try to extract the gh CLI error message from stderr
  // gh typically outputs: "gh: error: <message>" or "error: <message>"
  const match = stderr.match(/(?:gh:\s*)?error:\s*(.+)/is);
  return match?.[1]?.trim() ?? stderr.slice(0, 200);
}

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

function runWithRetry(cmd: string, opts?: RetryOptions, cwd?: string): string {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return run(cmd, cwd);
    } catch (e: any) {
      const stderr: string = e.stderr?.trim() ?? e.message ?? "";

      // Last attempt or non-retriable → throw with parsed error
      if (attempt === maxRetries) {
        throw new Error(parseGhError(stderr) || cmd + " failed");
      }

      const classification = classifyGhError(stderr);
      if (classification === "fail") {
        throw new Error(parseGhError(stderr) || cmd + " failed");
      }

      // Only retry on "retry" or "unknown" with quadratic backoff
      const delayMs = baseDelayMs * (attempt + 1) ** 2;
      if (classification === "retry" || classification === "unknown") {
        // Synchronous sleep (acceptable for MCP tool calls)
        execSync(`sleep ${delayMs / 1000}`, { timeout: delayMs + 1000 });
      }
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error(cmd + " failed after retries");
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

// ── Config ──

interface AcademicGitConfig {
  pipeline: { run: string };
  locked_branch: string;
  locked_issue: number | null;
  checkpoint_count: number;
}

const DEFAULT_CONFIG: AcademicGitConfig = {
  pipeline: { run: "" },
  locked_branch: "",
  locked_issue: null,
  checkpoint_count: 0,
};

function configPath(): string {
  return join(repoDir(), ".academic-git.json");
}

function readConfig(): AcademicGitConfig {
  const p = configPath();
  if (!existsSync(p)) {
    writeFileSync(p, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    return { ...DEFAULT_CONFIG, pipeline: { ...DEFAULT_CONFIG.pipeline } };
  }
  return JSON.parse(readFileSync(p, "utf-8"));
}

function writeConfig(config: AcademicGitConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n");
}

function ensureConfig(): AcademicGitConfig {
  return readConfig();
}

// ── Gate Context Builder ──

function buildGateContext(issue: number): GateContext {
  const issueJson = runWithRetry(`gh issue view ${issue} --json body`);
  const issueBody = JSON.parse(issueJson).body as string;

  const checklist = issueBody
    .split("\n")
    .filter((l: string) => /^- \[[x ]\] [A-Z]\./.test(l))
    .map((l: string) => {
      const done = /^- \[x\]/.test(l);
      const letter = l.match(/[A-Z]\./)?.[0]?.replace(".", "") ?? "?";
      const desc = l.replace(/^- \[[x ]\] [A-Z]\. /, "").replace(/→ after:.*$/, "").trim();
      return { letter, desc, done };
    });

  const branch = run("git branch --show-current");
  const diffStat = runSafe("git diff main...HEAD --stat");
  const changedFiles = runSafe("git diff main...HEAD --name-only").split("\n").filter(Boolean);
  const patch = runSafe("git diff main...HEAD");
  const commits = runSafe("git log main...HEAD --oneline").split("\n").filter(Boolean);

  const ctx: GateContext = {
    issueBody,
    issueNumber: issue,
    checklist,
    diff: { files: changedFiles, stat: diffStat, patch },
    commits,
    branch,
  };

  return ctx;
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
    const out = runWithRetry(`gh issue list --state open --limit ${limit} --json number,title,labels`);
    return text(out);
  }
);

server.tool(
  "view_issue",
  "View a GitHub Issue (body + comments = current truth)",
  { issue: z.number().describe("Issue number") },
  async ({ issue }) => {
    const body = runWithRetry(`gh issue view ${issue} --json title,body,state,comments --jq '{title, body, state, comments: [.comments[] | {body, createdAt, author: .author.login}]}'`);
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

    const out = runWithRetry(`gh issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`);
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

    const out = runWithRetry(`gh issue comment ${issue} --body ${JSON.stringify(comment)}`);
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
    const body = runWithRetry(`gh issue view ${issue} --json body --jq '.body'`);

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
    runWithRetry(`gh issue edit ${issue} --body ${JSON.stringify(updated)}`);
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
    // Ensure config exists
    ensureConfig();

    // Verify issue exists and item is valid
    const body = runWithRetry(`gh issue view ${issue} --json body --jq '.body'`);
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

    // --- Pipeline check (if configured) ---
    const config = ensureConfig();
    if (config.pipeline.run) {
      try {
        run(config.pipeline.run, repoDir());
      } catch (e: any) {
        return err(`Pipeline FAILED: ${e.message}. Fix before committing.`);
      }
    }

    // --- Gate check (block on CRITICAL) ---
    let gateWarning = "";
    try {
      const gateCtx = buildGateContext(issue);
      const gateResult = runAllGates(gateCtx, "commit");
      const critical = gateResult.violations.filter(v => v.severity === "CRITICAL");
      if (critical.length > 0) {
        return err(
          `Gate BLOCKED — ${critical.length} CRITICAL violation(s):\n` +
          critical.map(v => `  ${v.ruleId}: ${v.message}`).join("\n") +
          `\nRun run_gates(issue=${issue}) for full report.`
        );
      }
      // HIGH violations are advisory for commits
      const highViolations = gateResult.violations.filter(v => v.severity === "HIGH");
      if (highViolations.length > 0) {
        gateWarning = `\n\nAdvisory: ${highViolations.length} HIGH violation(s):\n` +
          highViolations.map(v => `  ${v.ruleId}: ${v.message}`).join("\n");
      }
    } catch {
      // Gate check fails open (network/auth issues shouldn't block commits)
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

    return text(`Committed: ${msg}\nPushed to ${branch}${gateWarning}`);
  }
);

// ════════════════════════════════════════
//  PR TOOLS
// ════════════════════════════════════════

server.tool(
  "generate_pr_body",
  "Generate a PR body draft by mapping git diff changes to Issue checklist items. Returns a filled template for review before create_pr.",
  {
    issue: z.number().describe("Issue number this PR will close"),
  },
  async ({ issue }) => {
    // Get issue details
    const issueJson = runWithRetry(`gh issue view ${issue} --json number,title,body`);
    const { number, title: issueTitle, body: issueBody } = JSON.parse(issueJson);

    // Extract checklist items (all — checked and unchecked)
    const allItems: { letter: string; desc: string; done: boolean }[] = issueBody
      .split("\n")
      .filter((l: string) => /^- \[[x ]\] [A-Z]\./.test(l))
      .map((l: string) => {
        const done = /^- \[x\]/.test(l);
        const letter = l.match(/[A-Z]\./)?.[0]?.replace(".", "") ?? "?";
        const desc = l.replace(/^- \[[x ]\] [A-Z]\. /, "").replace(/→ after:.*$/, "").trim();
        return { letter, desc, done };
      });

    // Get diff stats: files changed per commit, grouped
    const diffStat = runSafe("git diff main...HEAD --stat");
    const changedFiles = runSafe("git diff main...HEAD --name-only")
      .split("\n")
      .filter(Boolean);

    // Get commit log with messages (to infer which item each commit belongs to)
    const commitLog = runSafe("git log main...HEAD --oneline");

    // Map commits to items using commit message pattern type(#N/X):
    const commitsByItem: Record<string, string[]> = {};
    for (const line of commitLog.split("\n").filter(Boolean)) {
      const m = line.match(/\(#\d+\/([A-Z])\)/);
      if (m) {
        const letter = m[1];
        if (!commitsByItem[letter]) commitsByItem[letter] = [];
        commitsByItem[letter].push(line);
      }
    }

    // Build changes section for each item
    const changeLines = allItems
      .map(({ letter, desc, done }) => {
        const commits = commitsByItem[letter] ?? [];
        const commitStr = commits.length > 0 ? commits.map((c) => `  - ${c}`).join("\n") : "  - (no commits tagged to this item)";
        return `- [${done ? "x" : " "}] **${letter}. ${desc}**\n${commitStr}`;
      })
      .join("\n\n");

    // Files summary
    const filesSummary =
      changedFiles.length > 0
        ? changedFiles.map((f: string) => `- \`${f}\``).join("\n")
        : "- (no file changes detected)";

    const prBodyDraft = `## Summary

Closes #${number}

## Changes by Checklist Item

${changeLines}

## Files Changed

${filesSummary}

## Diff Stat

\`\`\`
${diffStat || "(empty diff)"}
\`\`\``;

    return text(
      `**Issue #${number}: ${issueTitle}**\n\n` +
      `---\n\n` +
      `Suggested PR body (review before calling create_pr):\n\n` +
      prBodyDraft
    );
  }
);

server.tool(
  "create_pr",
  "Create a Pull Request. Validates all checklist items are [x] before allowing PR creation.",
  {
    issue: z.number().describe("Issue number this PR closes"),
    title: z.string().describe("PR title"),
    body: z.string().describe("PR body (must include Closes #N)"),
  },
  async ({ issue, title, body: prBody }) => {
    // Ensure config exists
    ensureConfig();

    // Validate all checklist items are done
    const issueBody = runWithRetry(`gh issue view ${issue} --json body --jq '.body'`);
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

    // --- Gate check (block on CRITICAL + HIGH) ---
    let advisoryNote = "";
    try {
      const gateCtx = buildGateContext(issue);
      const gateResult = runAllGates(gateCtx, "pr");
      const blocking = gateResult.violations.filter(
        v => v.severity === "CRITICAL" || v.severity === "HIGH"
      );
      if (blocking.length > 0) {
        return err(
          `Gate BLOCKED — ${blocking.length} blocking violation(s):\n` +
          blocking.map(v => `  [${v.severity}] ${v.ruleId}: ${v.message}`).join("\n") +
          `\nRun run_gates(issue=${issue}) for full report.`
        );
      }
      // MEDIUM/INFO are advisory for PRs
      const advisory = gateResult.violations.filter(
        v => v.severity === "MEDIUM" || v.severity === "INFO"
      );
      if (advisory.length > 0) {
        advisoryNote = `\n\nAdvisory: ${advisory.length} MEDIUM/INFO violation(s) noted in gate report.`;
      }
    } catch {
      // Gate check fails open (network/auth issues shouldn't block PRs)
    }

    const out = runWithRetry(`gh pr create --title ${JSON.stringify(title)} --body ${JSON.stringify(prBody)}`);
    return text(`${out}${advisoryNote}`);
  }
);

server.tool(
  "merge_pr",
  "Squash-merge a PR and delete the branch. Returns to main.",
  { pr: z.number().describe("PR number") },
  async ({ pr }) => {
    runWithRetry(`gh pr merge ${pr} --squash --delete-branch`);
    const defaultBranch = runSafe("git symbolic-ref refs/remotes/origin/HEAD").replace("refs/remotes/origin/", "") || "main";
    run(`git switch "${defaultBranch}"`);
    run("git pull");
    return text(`PR #${pr} merged. Now on ${defaultBranch}.`);
  }
);

server.tool(
  "view_pr",
  "View a Pull Request",
  { pr: z.number().describe("PR number") },
  async ({ pr }) => {
    const out = runWithRetry(`gh pr view ${pr} --json number,title,state,body,url`);
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
    // Ensure config exists
    ensureConfig();

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

    const defaultBranch = runSafe("git symbolic-ref refs/remotes/origin/HEAD").replace("refs/remotes/origin/", "") || "main";
    run(`git switch "${defaultBranch}"`);
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

// ════════════════════════════════════════
//  GATE TOOLS
// ════════════════════════════════════════

server.tool(
  "run_gates",
  "Run all gate checks against the current branch state. Returns structured violation report. Hooks call this automatically; use manually to pre-check.",
  {
    issue: z.number().describe("Issue number to check against"),
    mode: z.enum(["commit", "pr"]).default("pr").describe("Gate mode: 'commit' checks code-level rules, 'pr' adds checklist/convergence checks"),
  },
  async ({ issue, mode }) => {
    // Ensure config exists
    ensureConfig();

    const ctx = buildGateContext(issue);
    const result = runAllGates(ctx, mode);
    return text(JSON.stringify(result, null, 2));
  }
);

// ════════════════════════════════════════
//  CONFIG TOOL
// ════════════════════════════════════════

server.tool(
  "configure",
  "Set project configuration values (pipeline command, branch locking). Creates .academic-git.json if missing.",
  {
    pipeline_run: z.string().optional().describe("Command for pipeline on every commit (e.g., 'make test')"),
    locked_branch: z.string().optional().describe("Lock focus to this branch"),
    locked_issue: z.number().optional().describe("Issue number for the locked branch"),
  },
  async ({ pipeline_run, locked_branch, locked_issue }) => {
    const config = readConfig();
    if (pipeline_run !== undefined) config.pipeline.run = pipeline_run;
    if (locked_branch !== undefined) config.locked_branch = locked_branch;
    if (locked_issue !== undefined) config.locked_issue = locked_issue;
    writeConfig(config);
    return text(`Configuration updated:\n${JSON.stringify(config, null, 2)}`);
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
