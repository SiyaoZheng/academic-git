const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..", "..");
const conditionScript = path.join(repoRoot, "skills", "post-merge", "condition.sh");
const checkScript = path.join(repoRoot, "skills", "post-merge", "check.sh");

function runScript(script, input, cwd = repoRoot) {
  return childProcess.execFileSync("bash", [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf-8",
    env: { ...process.env, ACADEMIC_GIT_PROJECT_DIR: cwd },
  });
}

test("post-merge condition runs only for merge_pr tool calls", () => {
  assert.doesNotThrow(() => {
    runScript(conditionScript, { tool_name: "mcp__academic_git__merge_pr" });
  });
  assert.doesNotThrow(() => {
    runScript(conditionScript, { tool: { name: "academic-git.merge_pr" } });
  });

  assert.throws(
    () => runScript(conditionScript, { tool_name: "Bash", tool_input: { command: "git status" } }),
    (error) => error.status === 1
  );
});

test("post-merge check emits valid JSON and retains lock after failed cleanup", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-post-merge-hook-"));
  fs.writeFileSync(
    path.join(tmp, ".academic-git.json"),
    JSON.stringify({ locked_issue: 26, locked_branch: "codex/issue-26" }),
    "utf-8"
  );

  const output = runScript(
    checkScript,
    {
      cwd: tmp,
      tool_name: "mcp__academic_git__merge_pr",
      tool_input: { arguments: { pr: 26 } },
      tool_response: {
        content: [
          {
            type: "text",
            text: "PR #26 merged on GitHub, but post-merge cleanup has 1 failed step(s).\n- [failed] local-worktree-remove: dirty",
          },
        ],
      },
    },
    tmp
  );
  const parsed = JSON.parse(output);
  const state = JSON.parse(fs.readFileSync(path.join(tmp, ".academic-git.json"), "utf-8"));

  assert.match(parsed.supplementary_output, /merge_pr #26/);
  assert.match(parsed.supplementary_output, /failed cleanup step/);
  assert.match(parsed.supplementary_output, /Branch lock retained/);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.equal(state.locked_issue, 26);
  assert.equal(state.locked_branch, "codex/issue-26");
});

test("post-merge check clears lock only after completed cleanup", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-post-merge-hook-"));
  fs.writeFileSync(
    path.join(tmp, ".academic-git.json"),
    JSON.stringify({ locked_issue: 26, locked_branch: "codex/issue-26" }),
    "utf-8"
  );

  const output = runScript(
    checkScript,
    {
      cwd: tmp,
      tool: { name: "academic-git.merge_pr" },
      arguments: { pr: 26 },
      tool_response: {
        content: [
          {
            type: "text",
            text: "PR #26 merged on GitHub and post-merge cleanup completed.\nPost-merge cleanup:\n- [ok] local-worktree-remove: removed",
          },
        ],
      },
    },
    tmp
  );
  const parsed = JSON.parse(output);
  const state = JSON.parse(fs.readFileSync(path.join(tmp, ".academic-git.json"), "utf-8"));

  assert.match(parsed.supplementary_output, /explicit cleanup statuses/);
  assert.match(parsed.supplementary_output, /Branch lock cleared/);
  assert.equal(Object.hasOwn(state, "locked_issue"), false);
  assert.equal(Object.hasOwn(state, "locked_branch"), false);
});

test("post-merge check reports an unresolved project directory", () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-post-merge-hook-")), "missing");
  const output = runScript(checkScript, {
    cwd: missing,
    tool_name: "mcp__academic_git__merge_pr",
    tool_input: { pr: 26 },
  });
  const parsed = JSON.parse(output);

  assert.match(parsed.supplementary_output, /Cannot enter project directory/);
});
