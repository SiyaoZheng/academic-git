const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..", "..");
const skillCheck = path.join(repoRoot, "skills", "codex-gh-issue-start", "check.sh");
const issueShellGuard = path.join(repoRoot, "hooks", "codex", "github-issue-shell-guard.py");
const {
  defaultIssueWorktreePath,
  gitCreateBranchNoSwitchArgs,
  gitWorktreeAddArgs,
  issueBranchName,
  parseIssueNumber,
  slugifyIssueTitle,
} = require("../src/issue-start.js");

function validIssueBody() {
  return [
    "## Context",
    "",
    "Need a traceable issue-start test fixture.",
    "",
    "## Task",
    "",
    "- [ ] A. Validate the skill boundary -> after: (none)",
    "- [ ] B. Validate the dependency graph -> after: A",
    "",
    "## Scope",
    "",
    "Only issue-start validation.",
    "",
    "## Affected Files",
    "",
    "- skills/codex-gh-issue-start/",
    "",
    "## Verification",
    "",
    "Run npm test.",
    "",
  ].join("\n");
}

function writeBody(body) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-issue-start-"));
  const bodyFile = path.join(tmp, "body.md");
  fs.writeFileSync(bodyFile, body, "utf-8");
  return { tmp, bodyFile };
}

test("codex-gh-issue-start skill check accepts a DAG issue body", () => {
  const { bodyFile } = writeBody(validIssueBody());
  const result = childProcess.spawnSync("bash", [skillCheck, "--body-file", bodyFile], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("codex-gh-issue-start skill check rejects missing dependencies", () => {
  const body = validIssueBody().replace(" -> after: A", "");
  const { bodyFile } = writeBody(body);
  const result = childProcess.spawnSync("bash", [skillCheck, "--body-file", bodyFile], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /after:/);
});

test("codex-gh-issue-start shell bootstrap adapter is absent", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "scripts", "codex-gh-issue-start")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "scripts", "codex-gh-issue-start.py")), false);
});

test("issue-start hook blocks attempts to call the removed shell adapter", () => {
  const result = childProcess.spawnSync(
    "python3",
    [issueShellGuard],
    {
      cwd: repoRoot,
      input: JSON.stringify({
        tool_input: {
          command: "scripts/codex-gh-issue-start --title Test",
        },
      }),
      encoding: "utf-8",
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /adapter has been removed/);
});

test("issue-start hook does not allow raw gh issue create through an env bypass", () => {
  const result = childProcess.spawnSync(
    "python3",
    [issueShellGuard],
    {
      cwd: repoRoot,
      input: JSON.stringify({
        tool_input: {
          command: "CODEX_ALLOW_RAW_GH_ISSUE_CREATE=1 gh issue create --title Test",
        },
      }),
      encoding: "utf-8",
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /Direct gh issue create is blocked/);
});

test("issue-start helpers derive auditable branch and worktree names", () => {
  const nonAsciiRepo = path.join(os.tmpdir(), "论文", "academic-git");
  assert.equal(slugifyIssueTitle("Make turn metadata headers ASCII-safe for non-ASCII workspace paths"), "make-turn-metadata-headers-ascii-safe");
  assert.equal(issueBranchName(41, "Make turn metadata headers ASCII-safe"), "codex/issue-41-make-turn-metadata-headers-ascii-safe");
  assert.equal(
    defaultIssueWorktreePath(nonAsciiRepo, 41, "Make turn metadata headers ASCII-safe"),
    path.join(os.tmpdir(), "论文", "academic-git.issue-41-make-turn-metadata-headers-ascii-safe")
  );
});

test("issue-start helpers preserve argv-safe git branch and worktree operations", () => {
  assert.deepEqual(gitCreateBranchNoSwitchArgs("codex/issue-41-start-issue", "origin/master"), [
    "branch",
    "codex/issue-41-start-issue",
    "origin/master",
  ]);
  assert.deepEqual(gitWorktreeAddArgs("/tmp/academic-git.issue-41-start-issue", "codex/issue-41-start-issue"), [
    "worktree",
    "add",
    "/tmp/academic-git.issue-41-start-issue",
    "codex/issue-41-start-issue",
  ]);
});

test("issue-start helper parses issue number from gh output", () => {
  assert.equal(parseIssueNumber("https://github.com/SiyaoZheng/academic-git/issues/41"), 41);
  assert.equal(parseIssueNumber("Created issue #42"), 42);
  assert.throws(() => parseIssueNumber("created but no issue number"), /Could not parse issue number/);
});
