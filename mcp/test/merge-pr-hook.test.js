const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..", "..");
const conditionScript = path.join(repoRoot, "skills", "merge-pr", "condition.sh");
const checkScript = path.join(repoRoot, "skills", "merge-pr", "check.sh");

function runScript(script, input, opts = {}) {
  return childProcess.spawnSync("bash", [script], {
    cwd: opts.cwd ?? repoRoot,
    input: JSON.stringify(input),
    encoding: "utf-8",
    env: { ...process.env, ACADEMIC_GIT_PROJECT_DIR: opts.cwd ?? repoRoot, ...opts.env },
  });
}

function fakeGh(tmp, opts = {}) {
  const state = opts.state ?? "OPEN";
  const includeHead = opts.includeHead ?? true;
  const fail = opts.fail ?? false;
  const bin = path.join(tmp, "bin");
  const gh = path.join(bin, "gh");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    gh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      fail ? "process.exit(2);" : "",
      "if (args[0] === 'pr' && args[1] === 'view' && args[2] === '26') {",
      "  console.log(JSON.stringify({",
      "    number: 26,",
      `    state: '${state}',`,
      includeHead ? "    headRefName: 'codex/issue-26-safe-merge'," : "",
      includeHead ? "    headRefOid: '1111111111111111111111111111111111111111'," : "",
      "    baseRefName: 'master',",
      "    isCrossRepository: false",
      "  }));",
      "  process.exit(0);",
      "}",
      "process.exit(2);",
      "",
    ].join("\n"),
    "utf-8"
  );
  fs.chmodSync(gh, 0o755);
  return bin;
}

test("merge-pr condition recognizes MCP merge_pr tool payload variants", () => {
  assert.equal(runScript(conditionScript, { tool_name: "mcp__academic_git__merge_pr" }).status, 0);
  assert.equal(runScript(conditionScript, { tool: { name: "academic-git.merge_pr" } }).status, 0);
  assert.equal(runScript(conditionScript, { tool_name: "Bash", tool_input: { command: "git status" } }).status, 1);
});

test("merge-pr preflight emits context for an open PR", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-merge-pr-hook-"));
  const bin = fakeGh(tmp);
  const result = runScript(
    checkScript,
    {
      cwd: tmp,
      tool_name: "mcp__academic_git__merge_pr",
      tool_input: { arguments: { pr: 26 } },
    },
    { cwd: tmp, env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.hookSpecificOutput.additionalContext, /head=codex\/issue-26-safe-merge/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /1111111111111111111111111111111111111111/);
});

test("merge-pr preflight blocks non-open PRs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-merge-pr-hook-"));
  const bin = fakeGh(tmp, { state: "MERGED" });
  const result = runScript(
    checkScript,
    {
      cwd: tmp,
      tool_name: "mcp__academic_git__merge_pr",
      tool_input: { pr: 26 },
    },
    { cwd: tmp, env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } }
  );

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /not OPEN/);
});

test("merge-pr preflight blocks when PR metadata cannot be inspected", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-merge-pr-hook-"));
  const bin = fakeGh(tmp, { fail: true });
  const result = runScript(
    checkScript,
    {
      cwd: tmp,
      tool_name: "mcp__academic_git__merge_pr",
      tool_input: { pr: 26 },
    },
    { cwd: tmp, env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } }
  );

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /Cannot inspect PR #26/);
});

test("merge-pr preflight blocks when PR head metadata is missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-merge-pr-hook-"));
  const bin = fakeGh(tmp, { includeHead: false });
  const result = runScript(
    checkScript,
    {
      cwd: tmp,
      tool_name: "mcp__academic_git__merge_pr",
      tool_input: { pr: 26 },
    },
    { cwd: tmp, env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } }
  );

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /missing headRefName\/headRefOid/);
});

test("merge-pr preflight blocks when the project directory cannot be entered", () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-merge-pr-hook-")), "missing");
  const result = runScript(checkScript, {
    cwd: missing,
    tool_name: "mcp__academic_git__merge_pr",
    tool_input: { pr: 26 },
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /Cannot enter project directory/);
});
