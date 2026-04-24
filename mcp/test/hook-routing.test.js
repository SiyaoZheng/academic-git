const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const routerScript = path.join(repoRoot, "hooks", "codex", "route-workflow.py");

function run(cmd, cwd, env = {}) {
  return execFileSync("bash", ["-lc", cmd], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(filePath, content, mode) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  if (mode) fs.chmodSync(filePath, mode);
}

function makeFakeGh(binDir, issueBody) {
  const ghPath = path.join(binDir, "gh");
  write(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "pr" && args[1] === "list") {
  process.stdout.write("[]");
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "view") {
  process.stdout.write(JSON.stringify({ title: "Issue 6", body: ${JSON.stringify(issueBody)} }));
  process.exit(0);
}
process.stderr.write("unsupported gh call: " + args.join(" "));
process.exit(1);
`,
    0o755
  );
}

function createIssueWorktree({ issueBody, withLocks, dirty }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-route-"));
  const origin = path.join(tmp, "origin.git");
  const mainRepo = path.join(tmp, "main");
  const issueWorktree = path.join(tmp, "issue-6");
  const binDir = path.join(tmp, "bin");

  fs.mkdirSync(binDir, { recursive: true });
  makeFakeGh(binDir, issueBody);

  run(`git init --bare ${JSON.stringify(origin)}`, tmp);
  fs.mkdirSync(mainRepo, { recursive: true });
  run("git init -b master", mainRepo);
  run('git config user.name "Codex"', mainRepo);
  run('git config user.email "codex@example.com"', mainRepo);
  write(path.join(mainRepo, "README.md"), "base\n");
  write(path.join(mainRepo, ".gitignore"), ".academic-git.json\n");
  run("git add README.md", mainRepo);
  run("git add .gitignore", mainRepo);
  run('git commit -m "base"', mainRepo);
  run(`git remote add origin ${JSON.stringify(origin)}`, mainRepo);
  run("git push -u origin master", mainRepo);
  run(`git worktree add ${JSON.stringify(issueWorktree)} -b codex/issue-6-auto-commit-auto-pr-hooks`, mainRepo);

  write(path.join(issueWorktree, "tracked.txt"), "issue branch change\n");
  run("git add tracked.txt", issueWorktree);
  run('git commit -m "feat(#6/A): issue branch setup"', issueWorktree);
  run("git push -u origin codex/issue-6-auto-commit-auto-pr-hooks", issueWorktree);

  if (withLocks) {
    write(
      path.join(issueWorktree, ".academic-git.json"),
      JSON.stringify(
        {
          pipeline: { run: "" },
          lint: {},
          locked_branch: "codex/issue-6-auto-commit-auto-pr-hooks",
          locked_issue: 6,
          checkpoint_count: 0,
          auto_workflow: null,
        },
        null,
        2
      ) + "\n"
    );
  }

  if (dirty) {
    write(path.join(issueWorktree, "dirty.txt"), "uncommitted\n");
  }

  return {
    issueWorktree,
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
    },
  };
}

function invokeRouter(eventName, cwd, env = {}) {
  const payload = JSON.stringify({ cwd });
  return execFileSync("python3", [routerScript, "--event", eventName], {
    input: payload,
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  }).trim();
}

function invokeHookWrapper(scriptName, eventCwd, env = {}) {
  const payload = JSON.stringify({ cwd: eventCwd });
  return execFileSync("bash", [path.join(repoRoot, "hooks", "codex", scriptName)], {
    input: payload,
    cwd: eventCwd,
    env: { ...process.env, ACADEMIC_GIT_PLUGIN_ROOT: repoRoot, ...env },
    encoding: "utf-8",
  }).trim();
}

test("UserPromptSubmit routes to handle-issue when locks are missing", () => {
  const { issueWorktree, env } = createIssueWorktree({
    issueBody: "- [ ] A. Resume work",
    withLocks: false,
    dirty: false,
  });
  const raw = invokeRouter("UserPromptSubmit", issueWorktree, env);
  const payload = JSON.parse(raw);
  assert.match(payload.systemMessage, /route\(handle-issue\)/);
  assert.match(payload.hookSpecificOutput.additionalContext, /locked_issue is missing/);
});

test("UserPromptSubmit wrapper uses plugin root while routing target worktree", () => {
  const { issueWorktree, env } = createIssueWorktree({
    issueBody: "- [ ] A. Resume work",
    withLocks: false,
    dirty: false,
  });
  const raw = invokeHookWrapper("user-prompt-submit.sh", issueWorktree, env);
  const payload = JSON.parse(raw);
  assert.match(payload.systemMessage, /route\(handle-issue\)/);
  assert.match(payload.hookSpecificOutput.additionalContext, /worktree_path":/);
  assert.match(payload.hookSpecificOutput.additionalContext, new RegExp(issueWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Stop routes to handle-commit for a dirty locked issue worktree", () => {
  const { issueWorktree, env } = createIssueWorktree({
    issueBody: "- [ ] A. Commit the current work",
    withLocks: true,
    dirty: true,
  });
  const raw = invokeRouter("Stop", issueWorktree, env);
  const payload = JSON.parse(raw);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /route\(handle-commit\)/);
  assert.match(payload.reason, /dirty issue worktree/);
});

test("Stop routes to handle-pr when branch is clean, pushed, and checklist-complete", () => {
  const { issueWorktree, env } = createIssueWorktree({
    issueBody: "- [x] A. Commit the current work\n- [x] C. Open the PR",
    withLocks: true,
    dirty: false,
  });
  const raw = invokeRouter("Stop", issueWorktree, env);
  const payload = JSON.parse(raw);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /route\(handle-pr\)/);
  assert.match(payload.reason, /prepare_pr/);
  assert.match(payload.reason, /open_pr/);
});
