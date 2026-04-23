const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runFile } = require("../src/command.js");
const {
  ghIssueCloseArgs,
  ghIssueCreateArgs,
  ghPrCloseArgs,
  ghPrCreateArgs,
  ghPrMergeArgs,
} = require("../src/gh.js");
const { gitCreateBranchArgs, gitSwitchBranchArgs } = require("../src/git.js");

function renderRouting(command) {
  const script = path.join(__dirname, "..", "..", "scripts", "render-routing-table.sh");
  const result = childProcess.spawnSync("bash", [script], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "routing helper failed");
  }

  return JSON.parse(result.stdout);
}

test("gh pr create arguments preserve shell metacharacters literally", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-gh-argv-"));
  const capture = path.join(tmp, "argv.json");
  const sentinel = path.join(tmp, "sentinel");
  const fakeGh = path.join(tmp, "fake-gh.js");

  fs.writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "fs.writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));",
      'console.log("created");',
      "",
    ].join("\n"),
    "utf-8"
  );
  fs.chmodSync(fakeGh, 0o755);

  const body = [
    "Closes #18",
    "",
    `Inline code: \`touch ${sentinel}\``,
    `Command substitution: $(touch ${sentinel})`,
    "```sh",
    "echo `uname -a`",
    "```",
  ].join("\n");
  const title = "Fix `create_pr` body $(echo polluted)";
  const args = ghPrCreateArgs(title, body);

  const out = runFile(process.execPath, [fakeGh, capture, ...args], tmp);

  assert.equal(out, "created");
  assert.deepEqual(JSON.parse(fs.readFileSync(capture, "utf-8")), args);
  assert.equal(fs.existsSync(sentinel), false);
});

test("gh pr merge arguments preserve the merge flags literally", () => {
  assert.deepEqual(ghPrMergeArgs(17), ["pr", "merge", "17", "--squash"]);
});

test("gh issue create arguments preserve optional routing metadata literally", () => {
  assert.deepEqual(
    ghIssueCreateArgs("title", "body", {
      labels: ["analysis", "method"],
      assignees: ["me"],
      milestone: "v1",
    }),
    [
      "issue",
      "create",
      "--title",
      "title",
      "--body",
      "body",
      "--label",
      "analysis",
      "--label",
      "method",
      "--assignee",
      "me",
      "--milestone",
      "v1",
    ]
  );
});

test("gh issue close arguments preserve option order literally", () => {
  assert.deepEqual(
    ghIssueCloseArgs(12, {
      comment: "done",
      reason: "duplicate",
      duplicateOf: 7,
    }),
    [
      "issue",
      "close",
      "12",
      "--comment",
      "done",
      "--reason",
      "duplicate",
      "--duplicate-of",
      "7",
    ]
  );
});

test("gh pr close arguments preserve option order literally", () => {
  assert.deepEqual(ghPrCloseArgs(9, { comment: "superseded", deleteBranch: true }), [
    "pr",
    "close",
    "9",
    "--comment",
    "superseded",
    "--delete-branch",
  ]);
});

test("git branch creation arguments preserve branch names literally", () => {
  assert.deepEqual(gitCreateBranchArgs("feat/new", "origin/main"), ["switch", "-c", "feat/new", "origin/main"]);
});

test("git branch switching arguments preserve branch names literally", () => {
  assert.deepEqual(gitSwitchBranchArgs("codex/issue-12-test"), ["switch", "codex/issue-12-test"]);
});

test("routing helper prefers deny over allow fragments", () => {
  const result = renderRouting("git status --porcelain && git stash");
  assert.equal(result.decision, "deny");
  assert.equal(result.policy, "keep-worktree-dirty");
});

test("routing helper prefers route over allow fragments", () => {
  const result = renderRouting("git status --porcelain && git push");
  assert.equal(result.decision, "route");
  assert.equal(result.tool, "commit");
});

test("routing helper routes branch creation", () => {
  const result = renderRouting("git switch -c feature");
  assert.equal(result.decision, "route");
  assert.equal(result.tool, "create_branch");
});
