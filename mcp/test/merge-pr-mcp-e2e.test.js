const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const repoRoot = path.join(__dirname, "..", "..");

function run(file, args, cwd, opts = {}) {
  return childProcess.execFileSync(file, args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...opts.env },
  }).trim();
}

function git(args, cwd) {
  return run("git", args, cwd);
}

function writeFile(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
  if (mode !== undefined) {
    fs.chmodSync(file, mode);
  }
}

function setupFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-mcp-e2e-"));
  const repo = path.join(tmp, "repo");
  const origin = path.join(tmp, "origin.git");
  const issueWorktree = path.join(tmp, "repo.issue-26-e2e");
  const upstreamClone = path.join(tmp, "upstream");
  const fakeBin = path.join(tmp, "bin");
  const ghLog = path.join(tmp, "gh-calls.jsonl");
  const branch = "codex/issue-26-e2e-cleanup";

  fs.mkdirSync(repo);
  git(["init", "--initial-branch=master"], repo);
  git(["config", "user.email", "test@example.com"], repo);
  git(["config", "user.name", "Academic Git E2E"], repo);
  writeFile(path.join(repo, "README.md"), "initial\n");
  fs.copyFileSync(
    path.join(repoRoot, ".academic-git-routing.json"),
    path.join(repo, ".academic-git-routing.json")
  );
  git(["add", "README.md"], repo);
  git(["add", ".academic-git-routing.json"], repo);
  git(["commit", "-m", "initial"], repo);

  git(["init", "--bare", "--initial-branch=master", origin], tmp);
  git(["remote", "add", "origin", origin], repo);
  git(["push", "-u", "origin", "master"], repo);

  git(["switch", "-c", branch], repo);
  writeFile(path.join(repo, "feature.txt"), "feature\n");
  git(["add", "feature.txt"], repo);
  git(["commit", "-m", "feature"], repo);
  git(["push", "-u", "origin", branch], repo);
  git(["switch", "master"], repo);
  git(["worktree", "add", issueWorktree, branch], repo);
  const headRefOid = git(["rev-parse", branch], repo);
  git(["clone", origin, upstreamClone], tmp);
  git(["config", "user.email", "upstream@example.com"], upstreamClone);
  git(["config", "user.name", "Academic Git Upstream"], upstreamClone);
  writeFile(path.join(upstreamClone, "upstream.txt"), "upstream\n");
  git(["add", "upstream.txt"], upstreamClone);
  git(["commit", "-m", "upstream"], upstreamClone);
  git(["push", "origin", "master"], upstreamClone);

  writeFile(
    path.join(fakeBin, "gh"),
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "const args = process.argv.slice(2);",
      "fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args) + '\\n');",
      "if (args[0] === 'pr' && args[1] === 'view' && args[2] === '26') {",
      "  console.log(JSON.stringify({",
      "    headRefName: process.env.PR_BRANCH,",
      "    headRefOid: process.env.PR_HEAD_OID,",
      "    baseRefName: 'master',",
      "    isCrossRepository: false",
      "  }));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'pr' && args[1] === 'merge' && args[2] === '26') {",
      "  console.log('merged');",
      "  process.exit(0);",
      "}",
      "console.error('unexpected gh call: ' + args.join(' '));",
      "process.exit(2);",
      "",
    ].join("\n"),
    0o755
  );

  return { tmp, repo, issueWorktree, fakeBin, ghLog, branch, headRefOid };
}

test("merge_pr MCP tool cleans up a dedicated issue worktree end-to-end", async () => {
  const fixture = setupFixture();
  const client = new Client({ name: "academic-git-e2e", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "src", "server.js")],
    cwd: fixture.issueWorktree,
    stderr: "pipe",
    env: {
      ...process.env,
      ACADEMIC_GIT_PROJECT_DIR: fixture.issueWorktree,
      GH_LOG: fixture.ghLog,
      PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH}`,
      PR_BRANCH: fixture.branch,
      PR_HEAD_OID: fixture.headRefOid,
    },
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "merge_pr", arguments: { pr: 26 } });
    const text = result.content.find((item) => item.type === "text")?.text ?? "";
    const ghCalls = fs.readFileSync(fixture.ghLog, "utf-8").trim().split("\n").map(JSON.parse);

    assert.match(text, /PR #26 merged on GitHub and post-merge cleanup completed/);
    assert.match(text, /Head branch: codex\/issue-26-e2e-cleanup/);
    assert.match(text, new RegExp(`Head OID: ${fixture.headRefOid}`));
    assert.match(text, /\[ok\] remote-merge/);
    assert.match(text, /\[ok\] primary-fast-forward/);
    assert.match(text, /\[ok\] remote-branch-delete/);
    assert.match(text, /\[ok\] local-worktree-remove/);
    assert.match(text, /\[ok\] local-branch-delete/);
    assert.deepEqual(ghCalls, [
      ["pr", "view", "26", "--json", "headRefName,headRefOid,baseRefName,isCrossRepository"],
      ["pr", "merge", "26", "--squash"],
    ]);
    assert.equal(ghCalls.some((args) => args.includes("--delete-branch")), false);
    assert.equal(git(["branch", "--show-current"], fixture.repo), "master");
    assert.equal(
      git(["rev-parse", "master"], fixture.repo),
      git(["rev-parse", "origin/master"], fixture.repo)
    );
    assert.equal(fs.existsSync(fixture.issueWorktree), false);
    assert.equal(git(["branch", "--list", fixture.branch], fixture.repo), "");
    assert.throws(() => git(["ls-remote", "--exit-code", "--heads", "origin", fixture.branch], fixture.repo));
  } finally {
    await transport.close();
  }
});

test("merge_pr MCP tool preserves branch refs when the issue worktree is dirty", async () => {
  const fixture = setupFixture();
  writeFile(path.join(fixture.issueWorktree, "uncommitted.txt"), "keep me\n");
  const client = new Client({ name: "academic-git-e2e", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "src", "server.js")],
    cwd: fixture.issueWorktree,
    stderr: "pipe",
    env: {
      ...process.env,
      ACADEMIC_GIT_PROJECT_DIR: fixture.issueWorktree,
      GH_LOG: fixture.ghLog,
      PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH}`,
      PR_BRANCH: fixture.branch,
      PR_HEAD_OID: fixture.headRefOid,
    },
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "merge_pr", arguments: { pr: 26 } });
    const text = result.content.find((item) => item.type === "text")?.text ?? "";
    const ghCalls = fs.readFileSync(fixture.ghLog, "utf-8").trim().split("\n").map(JSON.parse);

    assert.equal(result.isError, true);
    assert.match(text, /post-merge cleanup has 1 failed step/);
    assert.match(text, /\[failed\] local-worktree-remove/);
    assert.match(text, /\[skipped\] local-branch-delete/);
    assert.match(text, /\[skipped\] remote-branch-delete/);
    assert.deepEqual(ghCalls, [
      ["pr", "view", "26", "--json", "headRefName,headRefOid,baseRefName,isCrossRepository"],
      ["pr", "merge", "26", "--squash"],
    ]);
    assert.equal(ghCalls.some((args) => args.includes("--delete-branch")), false);
    assert.equal(fs.existsSync(fixture.issueWorktree), true);
    assert.notEqual(git(["branch", "--list", fixture.branch], fixture.repo), "");
    assert.match(git(["ls-remote", "--exit-code", "--heads", "origin", fixture.branch], fixture.repo), new RegExp(fixture.headRefOid));
  } finally {
    await transport.close();
  }
});
