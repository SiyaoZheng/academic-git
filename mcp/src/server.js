"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gates_js_1 = require("./gates.js");
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const command_js_1 = require("./command.js");
const gh_js_1 = require("./gh.js");
const workflow_js_1 = require("./workflow.js");
const git_js_1 = require("./git.js");
const issue_start_js_1 = require("./issue-start.js");
const merge_cleanup_js_1 = require("./merge-cleanup.js");
// ── Helpers ──
function run(cmd, cwd) {
    return (0, child_process_1.execSync)(cmd, {
        cwd: cwd ?? projectDirFromEnv() ?? process.cwd(),
        encoding: "utf-8",
        timeout: 30_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
}
function runSafe(cmd, cwd) {
    try {
        return run(cmd, cwd);
    }
    catch (e) {
        return e.stderr?.trim() ?? e.message;
    }
}
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function shellArgs(values) {
    return values.map(shellQuote).join(" ");
}
function splitNonEmptyLines(value) {
    return value.split("\n").map((line) => line.trim()).filter(Boolean);
}
function gitRefExists(ref) {
    try {
        run(`git show-ref --verify --quiet ${shellQuote(ref)}`);
        return true;
    }
    catch {
        return false;
    }
}
function defaultBranch() {
    const symbolic = runSafe("git symbolic-ref refs/remotes/origin/HEAD")
        .replace("refs/remotes/origin/", "")
        .trim();
    if (symbolic && !symbolic.toLowerCase().includes("fatal")) {
        return symbolic;
    }
    const remoteShow = runSafe("git remote show origin");
    const remoteMatch = remoteShow.match(/HEAD branch:\s*(\S+)/);
    if (remoteMatch?.[1]) {
        return remoteMatch[1];
    }
    if (gitRefExists("refs/remotes/origin/master"))
        return "master";
    if (gitRefExists("refs/remotes/origin/main"))
        return "main";
    if (gitRefExists("refs/heads/master"))
        return "master";
    return "main";
}
function defaultBaseRef() {
    const branch = defaultBranch();
    return gitRefExists(`refs/remotes/origin/${branch}`) ? `origin/${branch}` : branch;
}
function defaultBranchRange() {
    return `${shellArgs([defaultBaseRef()])}...HEAD`;
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
function classifyGhError(stderr) {
    if (RATE_LIMIT_PATTERNS.some((p) => p.test(stderr)))
        return "retry";
    if (DO_NOT_RETRY_PATTERNS.some((p) => p.test(stderr)))
        return "fail";
    if (TRANSIENT_PATTERNS.some((p) => p.test(stderr)))
        return "retry";
    return "unknown";
}
function parseGhError(stderr) {
    // Try to extract the gh CLI error message from stderr
    // gh typically outputs: "gh: error: <message>" or "error: <message>"
    const match = stderr.match(/(?:gh:\s*)?error:\s*(.+)/is);
    return match?.[1]?.trim() ?? stderr.slice(0, 200);
}
function runWithRetry(cmd, opts, cwd) {
    const maxRetries = opts?.maxRetries ?? 3;
    const baseDelayMs = opts?.baseDelayMs ?? 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return run(cmd, cwd);
        }
        catch (e) {
            const stderr = e.stderr?.trim() ?? e.message ?? "";
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
                (0, child_process_1.execSync)(`sleep ${delayMs / 1000}`, { timeout: delayMs + 1000 });
            }
        }
    }
    // Unreachable, but TypeScript needs it
    throw new Error(cmd + " failed after retries");
}
function runGhWithRetry(args, opts, cwd) {
    const maxRetries = opts?.maxRetries ?? 3;
    const baseDelayMs = opts?.baseDelayMs ?? 1000;
    const preview = (0, command_js_1.commandPreview)("gh", args);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return (0, command_js_1.runFile)("gh", args, cwd ?? repoDir());
        }
        catch (e) {
            const stderr = e.stderr?.toString().trim() ?? e.message ?? "";
            // Last attempt or non-retriable -> throw with parsed error
            if (attempt === maxRetries) {
                throw new Error(parseGhError(stderr) || preview + " failed");
            }
            const classification = classifyGhError(stderr);
            if (classification === "fail") {
                throw new Error(parseGhError(stderr) || preview + " failed");
            }
            // Only retry on "retry" or "unknown" with quadratic backoff
            const delayMs = baseDelayMs * (attempt + 1) ** 2;
            if (classification === "retry" || classification === "unknown") {
                (0, child_process_1.execSync)(`sleep ${delayMs / 1000}`, { timeout: delayMs + 1000 });
            }
        }
    }
    // Unreachable, but TypeScript needs it
    throw new Error(preview + " failed after retries");
}
function text(s) {
    return { content: [{ type: "text", text: s }] };
}
function err(s) {
    return { content: [{ type: "text", text: `ERROR: ${s}` }], isError: true };
}
function normalizeIssueBody(body) {
    if (!body.includes("\n") && body.includes("\\n")) {
        return body.replace(/\\n/g, "\n");
    }
    return body;
}
function readIssueBody(issue) {
    const issueJson = runWithRetry(`gh issue view ${issue} --json body`);
    return normalizeIssueBody(JSON.parse(issueJson).body);
}
function repoDir() {
    return projectDirFromEnv() ?? process.cwd();
}
function projectDirFromEnv() {
    return (process.env.ACADEMIC_GIT_PROJECT_DIR ??
        process.env.CODEX_WORKSPACE_ROOT ??
        process.env.CODEX_PROJECT_DIR);
}
const MCP_TOOL_NAMES = new Set([
    "status",
    "diff",
    "log",
    "current_branch",
    "list_issues",
    "view_issue",
    "create_issue",
    "start_issue",
    "refine_issue",
    "check_issue",
    "close_issue",
    "create_commit",
    "prepare_pr",
    "open_pr",
    "merge_pr",
    "close_pr",
    "view_pr",
    "create_branch",
    "switch_branch",
    "list_branches",
    "create_tag",
    "run_gates",
    "lint",
    "configure",
]);
function routingTablePath() {
    return (0, path_1.join)(repoDir(), ".academic-git-routing.json");
}
function readRoutingTable() {
    const p = routingTablePath();
    if (!(0, fs_1.existsSync)(p)) {
        throw new Error(`Missing routing table: ${p}`);
    }
    return JSON.parse((0, fs_1.readFileSync)(p, "utf-8"));
}
function validateRoutingTable() {
    const table = readRoutingTable();
    if (!Array.isArray(table.entries) || table.entries.length === 0) {
        throw new Error("Routing table has no entries");
    }
    const unknownTools = table.entries.filter((entry) => entry.decision === "route" && (!entry.tool || !MCP_TOOL_NAMES.has(entry.tool)));
    if (unknownTools.length > 0) {
        const labels = unknownTools.map((entry) => `${entry.match} -> ${entry.tool ?? "(missing tool)"}`);
        throw new Error(`Routing table references unknown MCP tools:\n${labels.map((label) => `  ${label}`).join("\n")}`);
    }
}
const DEFAULT_CONFIG = {
    pipeline: { run: "" },
    lint: {},
    locked_branch: "",
    locked_issue: null,
    checkpoint_count: 0,
    auto_workflow: null,
};
function configPath() {
    return (0, path_1.join)(repoDir(), ".academic-git.json");
}
function readConfig() {
    const p = configPath();
    if (!(0, fs_1.existsSync)(p)) {
        (0, fs_1.writeFileSync)(p, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
        return normalizeConfig(DEFAULT_CONFIG);
    }
    return normalizeConfig(JSON.parse((0, fs_1.readFileSync)(p, "utf-8")));
}
function writeConfig(config) {
    (0, fs_1.writeFileSync)(configPath(), JSON.stringify(config, null, 2) + "\n");
}
function ensureConfig() {
    return readConfig();
}
function normalizeConfig(raw) {
    return {
        ...DEFAULT_CONFIG,
        ...raw,
        pipeline: { ...DEFAULT_CONFIG.pipeline, ...(raw.pipeline ?? {}) },
        lint: { ...DEFAULT_CONFIG.lint, ...(raw.lint ?? {}) },
        renv: raw.renv ? { ...raw.renv } : undefined,
        project: raw.project ? { ...raw.project } : undefined,
        auto_workflow: raw.auto_workflow ? { ...raw.auto_workflow } : null,
    };
}
function currentHeadSha() {
    return runSafe("git rev-parse HEAD");
}
function currentTreeFingerprint() {
    const dirty = runSafe("git status --porcelain --untracked-files=all --ignore-submodules=dirty");
    const basis = dirty || `clean:${currentHeadSha()}`;
    return (0, crypto_1.createHash)("sha256").update(basis).digest("hex").slice(0, 16);
}
function currentBranch() {
    return run("git branch --show-current");
}
function buildIdempotencyKey(parts) {
    return (0, crypto_1.createHash)("sha256")
        .update(JSON.stringify(parts, Object.keys(parts).sort()))
        .digest("hex")
        .slice(0, 20);
}
function setAutomationJournal(journal) {
    const config = readConfig();
    config.auto_workflow = journal;
    writeConfig(config);
    return config;
}
function listOpenPrForBranch(branch) {
    const prRaw = runSafe(`gh pr list --head "${branch}" --state open --json number,url`);
    try {
        const parsed = JSON.parse(prRaw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
    }
    catch {
        return null;
    }
}
function runLintCommand(cmd, cwd) {
    try {
        const stdout = (0, child_process_1.execSync)(cmd, {
            cwd,
            encoding: "utf-8",
            timeout: 120_000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        return { ok: true, output: stdout.trim() };
    }
    catch (e) {
        const stdout = e.stdout?.toString().trim() ?? "";
        const stderr = e.stderr?.toString().trim() ?? "";
        const message = e.message?.toString().trim() ?? "";
        return { ok: false, output: [stdout, stderr, message].filter(Boolean).join("\n") };
    }
}
// ── Gate Context Builder ──
function buildGateContext(issue, opts) {
    const issueBody = readIssueBody(issue);
    const checklist = issueBody
        .split("\n")
        .filter((l) => /^- \[[x ]\] [A-Z]\./.test(l))
        .map((l) => {
        const done = /^- \[x\]/.test(l);
        const letter = l.match(/[A-Z]\./)?.[0]?.replace(".", "") ?? "?";
        const desc = l.replace(/^- \[[x ]\] [A-Z]\. /, "").replace(/→ after:.*$/, "").trim();
        return { letter, desc, done };
    });
    const branch = run("git branch --show-current");
    const range = defaultBranchRange();
    const branchDiffStat = runSafe(`git diff ${range} --stat`);
    const stagedDiffStat = opts?.includeStaged ? runSafe("git diff --cached --stat") : "";
    const diffStat = [
        branchDiffStat,
        stagedDiffStat ? `Staged changes pending commit:\n${stagedDiffStat}` : "",
    ].filter(Boolean).join("\n\n");
    const branchFiles = splitNonEmptyLines(runSafe(`git diff ${range} --name-only`));
    const stagedFiles = opts?.includeStaged
        ? splitNonEmptyLines(runSafe("git diff --cached --name-only"))
        : [];
    const changedFiles = Array.from(new Set([...branchFiles, ...stagedFiles]));
    const branchPatch = runSafe(`git diff ${range}`);
    const stagedPatch = opts?.includeStaged ? runSafe("git diff --cached") : "";
    const patch = [
        branchPatch,
        stagedPatch ? `\n\n# Staged changes pending commit\n${stagedPatch}` : "",
    ].filter(Boolean).join("\n");
    const commits = splitNonEmptyLines(runSafe(`git log ${range} --oneline`));
    if (opts?.pendingCommitMessage) {
        commits.push(`[pending] ${opts.pendingCommitMessage}`);
    }
    const ctx = {
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
const server = new mcp_js_1.McpServer({
    name: "academic-git",
    version: "0.1.0",
});
// ════════════════════════════════════════
//  READ TOOLS
// ════════════════════════════════════════
server.tool("status", "Show working tree status (modified, new, deleted files)", {}, async () => {
    const out = runSafe("git status --short");
    return text(out || "(clean)");
});
server.tool("diff", "Show all uncommitted changes (working tree vs last commit)", { path: zod_1.z.string().optional().describe("Specific file path to diff") }, async ({ path }) => {
    const target = path ? `-- "${path}"` : "";
    const out = runSafe(`git diff HEAD ${target}`);
    return text(out || "(no changes)");
});
server.tool("log", "Show recent commit history", { count: zod_1.z.number().default(10).describe("Number of commits to show") }, async ({ count }) => {
    const out = run(`git log --oneline -${count}`);
    return text(out);
});
server.tool("current_branch", "Show the current branch name", {}, async () => {
    const branch = run("git branch --show-current");
    return text(branch);
});
// ════════════════════════════════════════
//  ISSUE TOOLS
// ════════════════════════════════════════
server.tool("list_issues", "List open GitHub Issues for the current repo", { limit: zod_1.z.number().default(20).describe("Max issues to return") }, async ({ limit }) => {
    const out = runWithRetry(`gh issue list --state open --limit ${limit} --json number,title,labels`);
    return text(out);
});
server.tool("resume_issue", "Lock the current worktree to an existing issue branch so route-issue can resume work safely.", {
    issue: zod_1.z.number().optional().describe("Issue number to lock to. Defaults to the current codex/issue-* branch."),
    branch: zod_1.z.string().optional().describe("Branch to resume. Defaults to the current branch."),
}, async ({ issue, branch }) => {
    const targetBranch = branch?.trim() || currentBranch();
    if (!targetBranch) {
        return err("Cannot resume issue: current branch is unavailable");
    }
    if (targetBranch !== currentBranch()) {
        run(`git switch "${targetBranch}"`);
    }
    const branchMatch = targetBranch.match(/^codex\/issue-(\d+)/);
    const branchIssue = branchMatch?.[1] ? Number(branchMatch[1]) : null;
    const targetIssue = issue ?? branchIssue;
    if (!targetIssue) {
        return err(`Cannot resume issue from branch '${targetBranch}': no issue number could be inferred`);
    }
    if (branchIssue && branchIssue !== targetIssue) {
        return err(`Branch '${targetBranch}' belongs to issue #${branchIssue}, not #${targetIssue}`);
    }
    const config = readConfig();
    config.locked_issue = targetIssue;
    config.locked_branch = targetBranch;
    writeConfig(config);
    return text(`Issue context resumed:\n` +
        `  issue: #${targetIssue}\n` +
        `  branch: ${targetBranch}\n` +
        `  worktree: ${repoDir()}`);
});
server.tool("view_issue", "View a GitHub Issue (body + comments = current truth)", { issue: zod_1.z.number().describe("Issue number") }, async ({ issue }) => {
    const body = runWithRetry(`gh issue view ${issue} --json title,body,state,comments --jq '{title, body, state, comments: [.comments[] | {body, createdAt, author: .author.login}]}'`);
    return text(body);
});
server.tool("create_issue", "Create a standalone bookkeeping GitHub Issue only. For implementation work, use /codex-gh-issue-start and start_issue so the Issue, branch, and worktree are created together.", {
    title: zod_1.z.string().describe("Issue title"),
    body: zod_1.z.string().describe("Issue body"),
    labels: zod_1.z.array(zod_1.z.string()).optional().describe("Optional labels to apply"),
    assignees: zod_1.z.array(zod_1.z.string()).optional().describe("Optional explicit assignees to add. Defaults to Adrian via `me` when omitted."),
    milestone: zod_1.z.string().optional().describe("Optional milestone"),
}, async ({ title, body, labels, assignees, milestone }) => {
    const args = (0, gh_js_1.ghIssueCreateArgs)(title, body, { labels, assignees, milestone });
    const out = runGhWithRetry(args);
    return text(out);
});
server.tool("start_issue", "SSOT issue-start primitive: validate the issue body, then create the GitHub Issue plus linked codex/issue-* branch and dedicated sibling worktree without switching the current worktree.", {
    title: zod_1.z.string().describe("Issue title"),
    body: zod_1.z.string().describe("Issue body in codex-gh-issue-start DAG format"),
    labels: zod_1.z.array(zod_1.z.string()).optional().describe("Optional labels to apply"),
    assignees: zod_1.z.array(zod_1.z.string()).optional().describe("Optional explicit assignees to add. Defaults to Adrian via `me` when omitted."),
    milestone: zod_1.z.string().optional().describe("Optional milestone"),
    branch_slug: zod_1.z.string().optional().describe("Optional short slug source; defaults to the title"),
    base_ref: zod_1.z.string().optional().describe("Optional branch start point; defaults to the repository default base ref"),
    worktree_path: zod_1.z.string().optional().describe("Optional dedicated worktree path; defaults to a sibling academic-git.issue-N-slug path"),
}, async ({ title, body, labels, assignees, milestone, branch_slug, base_ref, worktree_path }) => {
    for (const value of [title, branch_slug ?? "", base_ref ?? "", worktree_path ?? ""]) {
        if (value.includes("\n") || value.includes("\0")) {
            return err("Invalid issue-start input: title, slug, base_ref, and worktree_path must not contain newlines or NUL bytes");
        }
    }
    if (worktree_path && (0, fs_1.existsSync)(worktree_path)) {
        return err(`Dedicated worktree path already exists before issue creation: ${worktree_path}`);
    }
    try {
        (0, command_js_1.runFileWithInput)("python3", [(0, path_1.join)(repoDir(), "skills", "codex-gh-issue-start", "validate_body.py"), "-"], body, repoDir());
    }
    catch (e) {
        const detail = e.stderr?.toString().trim() ?? e.message;
        return err(`Issue body failed codex-gh-issue-start validation: ${detail}`);
    }
    const issueOutput = runGhWithRetry((0, gh_js_1.ghIssueCreateArgs)(title, body, { labels, assignees, milestone }));
    const issue = (0, issue_start_js_1.parseIssueNumber)(issueOutput);
    const slugSource = branch_slug ?? title;
    const branch = (0, issue_start_js_1.issueBranchName)(issue, slugSource);
    const worktreePath = worktree_path ?? (0, issue_start_js_1.defaultIssueWorktreePath)(repoDir(), issue, slugSource);
    const startPoint = base_ref ?? defaultBaseRef();
    if (gitRefExists(`refs/heads/${branch}`)) {
        return err(`Issue #${issue} was created, but branch already exists: ${branch}`);
    }
    if ((0, fs_1.existsSync)(worktreePath)) {
        return err(`Issue #${issue} was created, but dedicated worktree path already exists: ${worktreePath}`);
    }
    try {
        (0, command_js_1.runFile)("git", (0, issue_start_js_1.gitCreateBranchNoSwitchArgs)(branch, startPoint), repoDir());
    }
    catch (e) {
        const detail = e.stderr?.toString().trim() ?? e.message;
        return err(`Issue #${issue} was created, but branch creation failed for ${branch}: ${detail}`);
    }
    try {
        (0, command_js_1.runFile)("git", (0, issue_start_js_1.gitWorktreeAddArgs)(worktreePath, branch), repoDir());
    }
    catch (e) {
        const detail = e.stderr?.toString().trim() ?? e.message;
        return err(`Issue #${issue} and branch ${branch} were created, but worktree creation failed: ${detail}`);
    }
    const worktreeConfig = normalizeConfig({
        locked_branch: branch,
        locked_issue: issue,
    });
    (0, fs_1.writeFileSync)((0, path_1.join)(worktreePath, ".academic-git.json"), JSON.stringify(worktreeConfig, null, 2) + "\n");
    return text([
        `Issue #${issue}: ${title}`,
        `Branch: ${branch}`,
        `Worktree: ${worktreePath}`,
        `Start point: ${startPoint}`,
        issueOutput,
    ].join("\n"));
});
server.tool("refine_issue", "Add a refinement comment to an Issue. Body is NEVER modified — all changes via append-only comments.", {
    issue: zod_1.z.number().describe("Issue number"),
    action: zod_1.z.enum(["added", "removed", "scope-change", "context-update"]).describe("Type of change"),
    items_affected: zod_1.z.string().describe("Which items or sections affected (e.g., 'A, B, E' or 'scope')"),
    detail: zod_1.z.string().describe("Precise description of what changed"),
    reason: zod_1.z.string().describe("Why this change was made"),
    requested_by: zod_1.z.string().default("Adrian").describe("Who requested the change"),
}, async ({ issue, action, items_affected, detail, reason, requested_by }) => {
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const comment = `**Refinement (${timestamp})**

**Action:** ${action}
**Items affected:** ${items_affected}
**Detail:**
${detail}

**Reason:** ${reason}
**Requested by:** ${requested_by}`;
    const out = runGhWithRetry((0, gh_js_1.ghIssueCommentArgs)(issue, comment));
    return text(out);
});
server.tool("close_issue", "Close an Issue explicitly. Use this for completed, deferred, or duplicate issues when the body should remain immutable.", {
    issue: zod_1.z.number().describe("Issue number"),
    comment: zod_1.z.string().optional().describe("Optional closing comment"),
    reason: zod_1.z.enum(["completed", "not planned", "duplicate"]).optional().describe("Closure reason"),
    duplicate_of: zod_1.z.number().optional().describe("Issue number this issue duplicates"),
}, async ({ issue, comment, reason, duplicate_of }) => {
    if (duplicate_of !== undefined && reason && reason !== "duplicate") {
        return err("duplicate_of can only be used with reason = duplicate");
    }
    const opts = {};
    if (comment) {
        opts.comment = comment;
    }
    if (reason) {
        opts.reason = reason;
    }
    if (duplicate_of !== undefined) {
        opts.duplicateOf = duplicate_of;
        opts.reason = opts.reason ?? "duplicate";
    }
    const out = runGhWithRetry((0, gh_js_1.ghIssueCloseArgs)(issue, opts));
    return text(out);
});
server.tool("check_issue", "Check off a completed checklist item on an Issue. Only toggles the specific item — no other body changes allowed.", {
    issue: zod_1.z.number().describe("Issue number"),
    letter: zod_1.z.string().regex(/^[A-Z]$/).describe("Checklist item letter (A-Z)"),
}, async ({ issue, letter }) => {
    const body = readIssueBody(issue);
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
    runGhWithRetry((0, gh_js_1.ghIssueEditBodyArgs)(issue, updated));
    return text(`Checked off item ${letter} on Issue #${issue}`);
});
// ════════════════════════════════════════
//  COMMIT TOOLS
// ════════════════════════════════════════
server.tool("create_commit", "Create a formal commit tied to one or more Issue checklist items. Format: type(#N/A+C): description. Stages selected paths, commits, pushes, and records automation journal state.", {
    issue: zod_1.z.number().describe("Issue number"),
    items: zod_1.z.array(zod_1.z.string().regex(/^[A-Z]$/)).nonempty().describe("Checklist item letters (A-Z)"),
    type: zod_1.z.enum(["feat", "fix", "refactor", "docs", "test", "chore", "perf"]).describe("Commit type"),
    description: zod_1.z.string().describe("Commit description (imperative mood)"),
    paths: zod_1.z.array(zod_1.z.string()).optional().describe("Optional explicit file or directory paths to stage for this commit. Use this for grouped Auto-Commit cleanup; omit only when all dirty files belong in one commit."),
    idempotency_key: zod_1.z.string().optional().describe("Optional stable key from route-commit recovery context"),
}, async ({ issue, items, type, description, paths, idempotency_key }) => {
    // Ensure config exists
    ensureConfig();
    const normalizedItems = (0, workflow_js_1.normalizeChecklistItems)(items);
    // Verify issue exists and items are valid
    const body = readIssueBody(issue);
    const lines = body.split("\n");
    for (const item of normalizedItems) {
        const itemPattern = new RegExp(`^- \\[ \\] ${item}\\.`, "m");
        if (!itemPattern.test(body)) {
            const donePattern = new RegExp(`^- \\[x\\] ${item}\\.`, "m");
            if (donePattern.test(body)) {
                return err(`Item ${item} is already completed`);
            }
            return err(`Item ${item} not found in Issue #${issue}`);
        }
        // Check DAG: all predecessors must be [x]
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
    }
    const requestedPaths = (paths ?? []).map((p) => p.trim()).filter(Boolean);
    if (requestedPaths.some((p) => p.includes("\n") || p.includes("\0"))) {
        return err("Invalid path: paths must not contain newlines or NUL bytes");
    }
    const branch = currentBranch();
    const pendingHead = currentHeadSha();
    const pendingTree = currentTreeFingerprint();
    const msg = (0, workflow_js_1.formatCommitMessage)(type, issue, normalizedItems, description);
    const stableKey = idempotency_key?.trim() || buildIdempotencyKey({
        action: "create_commit",
        issue,
        branch,
        message: msg,
        paths: requestedPaths.join("\n"),
        head_sha: pendingHead,
        tree_fingerprint: pendingTree,
    });
    const existingJournal = readConfig().auto_workflow;
    if (existingJournal?.action === "create_commit" &&
        existingJournal.idempotency_key === stableKey &&
        existingJournal.status === "completed") {
        return text(existingJournal.last_result?.message ?? `Already committed: ${msg}`);
    }
    const currentSubject = runSafe("git log -1 --pretty=format:%s HEAD");
    const statusNow = runSafe("git status --porcelain --untracked-files=all --ignore-submodules=dirty").trim();
    if (!statusNow && currentSubject === msg) {
        run(`git push -u origin "${branch}"`);
        const commitSha = currentHeadSha();
        const alreadyMessage = `Already committed: ${msg}\nPushed to ${branch}`;
        setAutomationJournal({
            status: "completed",
            action: "create_commit",
            issue,
            branch,
            worktree_path: repoDir(),
            head_sha: commitSha,
            tree_fingerprint: currentTreeFingerprint(),
            idempotency_key: stableKey,
            last_result: { message: alreadyMessage, commit_sha: commitSha, branch },
        });
        return text(alreadyMessage);
    }
    setAutomationJournal({
        status: "pending",
        action: "create_commit",
        issue,
        branch,
        worktree_path: repoDir(),
        head_sha: pendingHead,
        tree_fingerprint: pendingTree,
        idempotency_key: stableKey,
    });
    setAutomationJournal({
        status: "running",
        action: "create_commit",
        issue,
        branch,
        worktree_path: repoDir(),
        head_sha: pendingHead,
        tree_fingerprint: pendingTree,
        idempotency_key: stableKey,
    });
    // --- Pipeline check (if configured) ---
    const config = ensureConfig();
    if (config.pipeline.run) {
        try {
            run(config.pipeline.run, repoDir());
        }
        catch (e) {
            return err(`Pipeline FAILED: ${e.message}. Fix before committing.`);
        }
    }
    // Stage only the selected group, unless the caller explicitly omits paths.
    const preStaged = splitNonEmptyLines(runSafe("git diff --cached --name-only"));
    if (preStaged.length > 0) {
        return err("Index already has staged changes. The commit tool expects a clean index so grouped commits stay auditable:\n" +
            preStaged.map((p) => `  ${p}`).join("\n"));
    }
    if (requestedPaths.length > 0) {
        run(`git add -- ${shellArgs(requestedPaths)}`);
    }
    else {
        run("git add -A");
    }
    const unstageRequested = () => {
        const pathspec = requestedPaths.length > 0 ? shellArgs(requestedPaths) : ".";
        runSafe(`git restore --staged -- ${pathspec}`);
    };
    const staged = runSafe("git diff --cached --stat");
    if (!staged) {
        return err("Nothing to commit for the requested paths");
    }
    // --- Gate check (block on CRITICAL) ---
    let gateWarning = "";
    try {
        const gateCtx = buildGateContext(issue, {
            includeStaged: true,
            pendingCommitMessage: msg,
        });
        const gateResult = (0, gates_js_1.runAllGates)(gateCtx, "commit");
        const critical = gateResult.violations.filter(v => v.severity === "CRITICAL");
        if (critical.length > 0) {
            unstageRequested();
            return err(`Gate BLOCKED — ${critical.length} CRITICAL violation(s):\n` +
                critical.map(v => `  ${v.ruleId}: ${v.message}`).join("\n") +
                `\nRequested paths were unstaged; working tree changes are preserved. Run run_gates(issue=${issue}) for full report.`);
        }
        // HIGH violations are advisory for commits
        const highViolations = gateResult.violations.filter(v => v.severity === "HIGH");
        if (highViolations.length > 0) {
            gateWarning = `\n\nAdvisory: ${highViolations.length} HIGH violation(s):\n` +
                highViolations.map(v => `  ${v.ruleId}: ${v.message}`).join("\n");
        }
    }
    catch {
        // Gate check fails open (network/auth issues shouldn't block commits)
    }
    // Commit
    run(`git commit -m ${shellQuote(msg)}`);
    // Push
    run(`git push -u origin "${branch}"`);
    const commitSha = currentHeadSha();
    const scope = requestedPaths.length > 0
        ? `\nPaths:\n${requestedPaths.map((p) => `  ${p}`).join("\n")}`
        : "\nPaths: all dirty files";
    const resultMessage = `Committed: ${msg}\nPushed to ${branch}${scope}${gateWarning}`;
    setAutomationJournal({
        status: "completed",
        action: "create_commit",
        issue,
        branch,
        worktree_path: repoDir(),
        head_sha: commitSha,
        tree_fingerprint: currentTreeFingerprint(),
        idempotency_key: stableKey,
        last_result: { message: resultMessage, commit_sha: commitSha, branch },
    });
    return text(resultMessage);
});
// ════════════════════════════════════════
//  PR TOOLS
// ════════════════════════════════════════
server.tool("prepare_pr", "Generate a PR body draft by mapping git diff changes to Issue checklist items. Returns a filled template for review before open_pr.", {
    issue: zod_1.z.number().describe("Issue number this PR will close"),
}, async ({ issue }) => {
    // Get issue details
    const issueJson = runWithRetry(`gh issue view ${issue} --json number,title,body`);
    const { number, title: issueTitle, body } = JSON.parse(issueJson);
    const issueBody = normalizeIssueBody(body);
    // Extract checklist items (all — checked and unchecked)
    const allItems = issueBody
        .split("\n")
        .filter((l) => /^- \[[x ]\] [A-Z]\./.test(l))
        .map((l) => {
        const done = /^- \[x\]/.test(l);
        const letter = l.match(/[A-Z]\./)?.[0]?.replace(".", "") ?? "?";
        const desc = l.replace(/^- \[[x ]\] [A-Z]\. /, "").replace(/→ after:.*$/, "").trim();
        return { letter, desc, done };
    });
    // Get diff stats against the configured default branch.
    const range = defaultBranchRange();
    const diffStat = runSafe(`git diff ${range} --stat`);
    const changedFiles = splitNonEmptyLines(runSafe(`git diff ${range} --name-only`));
    // Get commit log with messages (to infer which item each commit belongs to)
    const commitLog = runSafe(`git log ${range} --oneline`);
    // Map commits to items using commit message pattern type(#N/A+C):
    const commitsByItem = {};
    for (const line of commitLog.split("\n").filter(Boolean)) {
        const parsed = (0, workflow_js_1.parseChecklistItemsFromCommitMessage)(line);
        if (parsed.issue === issue) {
            for (const letter of parsed.items) {
                if (!commitsByItem[letter])
                    commitsByItem[letter] = [];
                commitsByItem[letter].push(line);
            }
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
    const filesSummary = changedFiles.length > 0
        ? changedFiles.map((f) => `- \`${f}\``).join("\n")
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
    return text(`**Issue #${number}: ${issueTitle}**\n\n` +
        `---\n\n` +
        `Suggested PR body (review before calling open_pr):\n\n` +
        prBodyDraft);
});
server.tool("open_pr", "Create a Pull Request. Validates all checklist items are [x], requires a pushed and coherent branch, and records automation journal state.", {
    issue: zod_1.z.number().describe("Issue number this PR closes"),
    title: zod_1.z.string().describe("PR title"),
    body: zod_1.z.string().describe("PR body (must include Closes #N)"),
    idempotency_key: zod_1.z.string().optional().describe("Optional stable key from route-pr recovery context"),
}, async ({ issue, title, body: prBody, idempotency_key }) => {
    // Ensure config exists
    ensureConfig();
    const branch = currentBranch();
    const pendingHead = currentHeadSha();
    const pendingTree = currentTreeFingerprint();
    const stableKey = idempotency_key?.trim() || buildIdempotencyKey({
        action: "open_pr",
        issue,
        branch,
        title,
        body: prBody,
        head_sha: pendingHead,
        tree_fingerprint: pendingTree,
    });
    const existingJournal = readConfig().auto_workflow;
    if (existingJournal?.action === "open_pr" &&
        existingJournal.idempotency_key === stableKey &&
        existingJournal.status === "completed") {
        return text(existingJournal.last_result?.message ?? `Pull request already open for ${branch}`);
    }
    const existingPr = listOpenPrForBranch(branch);
    if (existingPr?.number) {
        const existingMessage = `Pull request already open: #${existingPr.number}${existingPr.url ? ` ${existingPr.url}` : ""}`;
        setAutomationJournal({
            status: "completed",
            action: "open_pr",
            issue,
            branch,
            worktree_path: repoDir(),
            head_sha: pendingHead,
            tree_fingerprint: pendingTree,
            idempotency_key: stableKey,
            last_result: {
                message: existingMessage,
                pr_number: existingPr.number,
                pr_url: existingPr.url,
                branch,
            },
        });
        return text(existingMessage);
    }
    // Validate all checklist items are done
    const issueBody = readIssueBody(issue);
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
    const remoteHead = runSafe(`git rev-parse "refs/remotes/origin/${branch}^{commit}"`);
    if (!remoteHead || remoteHead.toLowerCase().includes("fatal")) {
        return err(`Cannot create PR: origin/${branch} is missing. Push the issue branch first.`);
    }
    if (remoteHead !== pendingHead) {
        return err(`Cannot create PR: origin/${branch} is stale. Push the current HEAD before opening a PR.`);
    }
    // --- Gate check (block on CRITICAL + HIGH) ---
    let advisoryNote = "";
    try {
        const gateCtx = buildGateContext(issue);
        const gateResult = (0, gates_js_1.runAllGates)(gateCtx, "pr");
        const blocking = gateResult.violations.filter(v => v.severity === "CRITICAL" || v.severity === "HIGH");
        if (blocking.length > 0) {
            return err(`Gate BLOCKED — ${blocking.length} blocking violation(s):\n` +
                blocking.map(v => `  [${v.severity}] ${v.ruleId}: ${v.message}`).join("\n") +
                `\nRun run_gates(issue=${issue}) for full report.`);
        }
        // MEDIUM/INFO are advisory for PRs
        const advisory = gateResult.violations.filter(v => v.severity === "MEDIUM" || v.severity === "INFO");
        if (advisory.length > 0) {
            advisoryNote = `\n\nAdvisory: ${advisory.length} MEDIUM/INFO violation(s) noted in gate report.`;
        }
    }
    catch (e) {
        const message = e?.message?.toString?.() ?? "unknown gate error";
        return err(`Cannot create PR: PR gate checks could not run. ` +
            `academic-git fails closed here so Auto-Pull-Request cannot bypass review gates. ` +
            `Details: ${message}`);
    }
    setAutomationJournal({
        status: "pending",
        action: "open_pr",
        issue,
        branch,
        worktree_path: repoDir(),
        head_sha: pendingHead,
        tree_fingerprint: pendingTree,
        idempotency_key: stableKey,
    });
    setAutomationJournal({
        status: "running",
        action: "open_pr",
        issue,
        branch,
        worktree_path: repoDir(),
        head_sha: pendingHead,
        tree_fingerprint: pendingTree,
        idempotency_key: stableKey,
    });
    const out = runGhWithRetry((0, gh_js_1.ghPrCreateArgs)(title, prBody));
    const createdPr = listOpenPrForBranch(branch);
    const resultMessage = `${out}${advisoryNote}`;
    setAutomationJournal({
        status: "completed",
        action: "open_pr",
        issue,
        branch,
        worktree_path: repoDir(),
        head_sha: pendingHead,
        tree_fingerprint: currentTreeFingerprint(),
        idempotency_key: stableKey,
        last_result: {
            message: resultMessage,
            pr_number: createdPr?.number,
            pr_url: createdPr?.url,
            branch,
        },
    });
    return text(resultMessage);
});
server.tool("merge_pr", "Squash-merge a PR, then run auditable worktree-safe cleanup for the PR worktree and matching branch refs.", { pr: zod_1.z.number().describe("PR number") }, async ({ pr }) => {
    try {
        const currentRepoDir = repoDir();
        const worktreeList = (0, merge_cleanup_js_1.parseWorktreeList)((0, command_js_1.runFile)("git", ["worktree", "list", "--porcelain"], currentRepoDir));
        const stableProjectDir = worktreeList[0]?.path ?? currentRepoDir;
        if (stableProjectDir !== currentRepoDir) {
            process.chdir(stableProjectDir);
            process.env.ACADEMIC_GIT_PROJECT_DIR = stableProjectDir;
        }
        const defaultBranchName = defaultBranch();
        const result = (0, merge_cleanup_js_1.mergePrWorktreeSafe)(pr, {
            cwd: stableProjectDir,
            defaultBranchName,
            runGit: (args, cwd) => (0, command_js_1.runFile)("git", args, cwd ?? stableProjectDir),
            runGh: (args, cwd) => runGhWithRetry(args, undefined, cwd ?? stableProjectDir),
        });
        const output = (0, merge_cleanup_js_1.formatMergePrResult)(result);
        return (0, merge_cleanup_js_1.hasCleanupFailures)(result) ? err(output) : text(output);
    }
    catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        return err(`merge_pr crashed before completing cleanup:\n${message}`);
    }
});
server.tool("close_pr", "Close a PR without merging. Use this for explicit abandonment or superseded work.", {
    pr: zod_1.z.number().describe("PR number"),
    comment: zod_1.z.string().optional().describe("Optional closing comment"),
    delete_branch: zod_1.z.boolean().optional().describe("Delete the branch after closing"),
}, async ({ pr, comment, delete_branch }) => {
    const out = runGhWithRetry((0, gh_js_1.ghPrCloseArgs)(pr, { comment, deleteBranch: delete_branch }));
    return text(out);
});
server.tool("view_pr", "View a Pull Request", { pr: zod_1.z.number().describe("PR number") }, async ({ pr }) => {
    const out = runWithRetry(`gh pr view ${pr} --json number,title,state,body,url`);
    return text(out);
});
// ════════════════════════════════════════
//  BRANCH TOOLS
// ════════════════════════════════════════
server.tool("create_branch", "Legacy/repair helper to create a non-issue branch and switch to it. For new implementation work, use start_issue so the Issue, branch, and worktree remain one SSOT unit.", {
    branch: zod_1.z.string().describe("New branch name"),
    start_point: zod_1.z.string().optional().describe("Optional start point; defaults to HEAD"),
}, async ({ branch, start_point }) => {
    const args = (0, git_js_1.gitCreateBranchArgs)(branch, start_point ?? "HEAD");
    (0, command_js_1.runFile)("git", args, repoDir());
    return text(`Created and switched to ${branch}`);
});
server.tool("switch_branch", "Switch to an existing branch", { branch: zod_1.z.string().describe("Branch name (e.g., codex/issue-12-revise-table-3)") }, async ({ branch }) => {
    (0, command_js_1.runFile)("git", (0, git_js_1.gitSwitchBranchArgs)(branch), repoDir());
    return text(`Switched to ${branch}`);
});
server.tool("list_branches", "List issue branches", {}, async () => {
    const out = runSafe("git branch --list 'codex/issue-*'");
    return text(out || "(no issue branches)");
});
// ════════════════════════════════════════
//  TAG TOOLS
// ════════════════════════════════════════
server.tool("create_tag", "Create a milestone tag on the current branch. Types: email-YYYY-MM-DD, meeting-YYYY-MM-DD, chat-YYYY-MM-DD, conference-YYYY-MM-DD", {
    name: zod_1.z.string().describe("Tag name (e.g., email-2026-04-21)"),
    message: zod_1.z.string().describe("Tag message describing the milestone"),
}, async ({ name, message }) => {
    // Validate tag format
    const valid = /^(email|meeting|chat|conference)-\d{4}-\d{2}-\d{2}$/.test(name);
    if (!valid) {
        return err("Tag must match format: (email|meeting|chat|conference)-YYYY-MM-DD");
    }
    run(`git tag -a ${shellQuote(name)} -m ${shellQuote(message)}`);
    runSafe(`git push origin "${name}"`);
    return text(`Tag ${name} created and pushed`);
});
// ════════════════════════════════════════
//  GATE TOOLS
// ════════════════════════════════════════
server.tool("run_gates", "Run all gate checks against the current branch state. Returns structured violation report. Hooks call this automatically; use manually to pre-check.", {
    issue: zod_1.z.number().describe("Issue number to check against"),
    mode: zod_1.z.enum(["commit", "pr"]).default("pr").describe("Gate mode: 'commit' checks code-level rules, 'pr' adds checklist/convergence checks"),
}, async ({ issue, mode }) => {
    // Ensure config exists
    ensureConfig();
    const ctx = buildGateContext(issue);
    const result = (0, gates_js_1.runAllGates)(ctx, mode);
    return text(JSON.stringify(result, null, 2));
});
// ════════════════════════════════════════
//  LINT TOOLS
// ════════════════════════════════════════
server.tool("lint", "Run configured local data-science lint checks. Academic Git intentionally supports only Python and R lint here.", {
    target: zod_1.z.enum(["all", "python", "r"]).default("all").describe("Which configured lint command to run"),
}, async ({ target }) => {
    const config = ensureConfig();
    const lintConfig = config.lint ?? {};
    const requested = target === "all" ? ["python", "r"] : [target];
    const results = [];
    let failed = false;
    for (const name of requested) {
        const cmd = lintConfig[name]?.trim();
        if (!cmd) {
            results.push(`[academic-git] lint.${name}: not configured`);
            continue;
        }
        const result = runLintCommand(cmd, repoDir());
        const output = result.output ? `\n${result.output}` : "";
        if (result.ok) {
            results.push(`[academic-git] lint.${name}: passed\n$ ${cmd}${output}`);
        }
        else {
            failed = true;
            results.push(`[academic-git] lint.${name}: FAILED\n$ ${cmd}${output}`);
        }
    }
    const body = results.join("\n\n");
    return failed ? err(body) : text(body || "[academic-git] No lint commands configured.");
});
// ════════════════════════════════════════
//  CONFIG TOOL
// ════════════════════════════════════════
server.tool("configure", "Set project configuration values (pipeline command, Python/R lint commands, branch locking). Creates .academic-git.json if missing.", {
    pipeline_run: zod_1.z.string().optional().describe("Command for pipeline on every commit (e.g., 'make test')"),
    pipeline_clean_run: zod_1.z.string().optional().describe("Command for a clean remote/PR verification run"),
    lint_python: zod_1.z.string().optional().describe("Local Python lint command, e.g. 'ruff check .'"),
    lint_r: zod_1.z.string().optional().describe("Local R lint command, e.g. 'Rscript -e \"lintr::lint_dir()\"'"),
    renv_working_directory: zod_1.z.string().optional().describe("Directory containing renv.lock, e.g. 'code'"),
    locked_branch: zod_1.z.string().optional().describe("Lock focus to this branch"),
    locked_issue: zod_1.z.number().optional().describe("Issue number for the locked branch"),
}, async ({ pipeline_run, pipeline_clean_run, lint_python, lint_r, renv_working_directory, locked_branch, locked_issue }) => {
    const config = readConfig();
    if (pipeline_run !== undefined)
        config.pipeline.run = pipeline_run;
    if (pipeline_clean_run !== undefined)
        config.pipeline.clean_run = pipeline_clean_run;
    if (lint_python !== undefined)
        config.lint.python = lint_python;
    if (lint_r !== undefined)
        config.lint.r = lint_r;
    if (renv_working_directory !== undefined) {
        config.renv = { ...(config.renv ?? {}), working_directory: renv_working_directory };
    }
    if (locked_branch !== undefined)
        config.locked_branch = locked_branch;
    if (locked_issue !== undefined)
        config.locked_issue = locked_issue;
    writeConfig(config);
    return text(`Configuration updated:\n${JSON.stringify(config, null, 2)}`);
});
// ── Start ──
async function main() {
    validateRoutingTable();
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
