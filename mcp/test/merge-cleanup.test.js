const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { mergePrWorktreeSafe } = require("../src/merge-cleanup.js");

function run(file, args, cwd) {
  return childProcess.execFileSync(file, args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function git(args, cwd) {
  return run("git", args, cwd);
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
}

test("merge cleanup removes a dedicated issue worktree and both branch refs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-merge-cleanup-"));
  const repo = path.join(tmp, "repo");
  const origin = path.join(tmp, "origin.git");
  const issueWorktree = path.join(tmp, "repo.issue-26-cleanup");
  const upstreamClone = path.join(tmp, "upstream");
  const branch = "codex/issue-26-cleanup-regression";
  const ghCalls = [];
  const gitCalls = [];

  fs.mkdirSync(repo);
  git(["init", "--initial-branch=master"], repo);
  git(["config", "user.email", "test@example.com"], repo);
  git(["config", "user.name", "Academic Git Test"], repo);
  writeFile(path.join(repo, "README.md"), "initial\n");
  git(["add", "README.md"], repo);
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

  const result = mergePrWorktreeSafe(26, {
    cwd: issueWorktree,
    defaultBranchName: "master",
    runGit: (args, cwd) => {
      gitCalls.push(args);
      return git(args, cwd);
    },
    runGh: (args) => {
      ghCalls.push(args);
      if (args[0] === "pr" && args[1] === "view" && args[2] === "26") {
        return JSON.stringify({
          headRefName: branch,
          headRefOid,
          baseRefName: "master",
          isCrossRepository: false,
        });
      }
      if (args[0] === "pr" && args[1] === "merge" && args[2] === "26") {
        return "merged";
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });

  assert.deepEqual(ghCalls, [
    ["pr", "view", "26", "--json", "headRefName,headRefOid,baseRefName,isCrossRepository"],
    ["pr", "merge", "26", "--squash"],
  ]);
  assert.equal(ghCalls.some((args) => args.includes("--delete-branch")), false);
  assert.equal(result.headRefName, branch);
  assert.equal(result.headRefOid, headRefOid);
  assert.equal(result.steps.some((step) => step.status === "failed"), false);
  assert.ok(
    gitCalls.findIndex((args) => args[0] === "worktree" && args[1] === "remove") <
      gitCalls.findIndex((args) => args[0] === "branch" && args[1] === "-D")
  );
  assert.ok(
    gitCalls.findIndex((args) => args[0] === "branch" && args[1] === "-D") <
      gitCalls.findIndex((args) => args[0] === "push" && args[1] === "origin" && args[2] === "--delete")
  );
  assert.equal(git(["branch", "--show-current"], repo), "master");
  assert.equal(git(["rev-parse", "master"], repo), git(["rev-parse", "origin/master"], repo));
  assert.equal(fs.existsSync(issueWorktree), false);
  assert.equal(git(["branch", "--list", branch], repo), "");
  assert.throws(() => git(["ls-remote", "--exit-code", "--heads", "origin", branch], repo));
});

test("merge cleanup refuses incomplete PR metadata before merging", () => {
  const calls = [];

  assert.throws(() =>
    mergePrWorktreeSafe(26, {
      cwd: "/repo.issue",
      defaultBranchName: "master",
      runGh: (args) => {
        calls.push(["gh", ...args]);
        if (args[0] === "pr" && args[1] === "view") {
          return JSON.stringify({
            headRefName: "codex/issue-26-missing-head-oid",
            baseRefName: "master",
            isCrossRepository: false,
          });
        }
        throw new Error(`unexpected gh call: ${args.join(" ")}`);
      },
      runGit: (args) => {
        calls.push(["git", ...args]);
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
    })
  );

  assert.deepEqual(calls, [
    ["gh", "pr", "view", "26", "--json", "headRefName,headRefOid,baseRefName,isCrossRepository"],
  ]);
});

test("merge cleanup does not run local cleanup when the GitHub merge fails", () => {
  const calls = [];

  assert.throws(() =>
    mergePrWorktreeSafe(26, {
      cwd: "/repo.issue",
      defaultBranchName: "master",
      runGh: (args) => {
        calls.push(["gh", ...args]);
        if (args[0] === "pr" && args[1] === "view") {
          return JSON.stringify({
            headRefName: "codex/issue-26-gh-merge-fails",
            headRefOid: "1111111111111111111111111111111111111111",
            baseRefName: "master",
            isCrossRepository: false,
          });
        }
        if (args[0] === "pr" && args[1] === "merge") {
          throw new Error("merge rejected");
        }
        throw new Error(`unexpected gh call: ${args.join(" ")}`);
      },
      runGit: (args) => {
        calls.push(["git", ...args]);
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
    })
  );

  assert.deepEqual(calls, [
    ["gh", "pr", "view", "26", "--json", "headRefName,headRefOid,baseRefName,isCrossRepository"],
    ["gh", "pr", "merge", "26", "--squash"],
  ]);
});

test("merge cleanup reports remote lookup errors instead of treating them as absent branches", () => {
  const calls = [];
  const result = mergePrWorktreeSafe(26, {
    cwd: "/repo.issue",
    defaultBranchName: "master",
    runGh: (args) => {
      calls.push(["gh", ...args]);
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          headRefName: "codex/issue-26-lookup-error",
          headRefOid: "1111111111111111111111111111111111111111",
          baseRefName: "master",
          isCrossRepository: false,
        });
      }
      if (args[0] === "pr" && args[1] === "merge") {
        return "merged";
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
    runGit: (args) => {
      calls.push(["git", ...args]);
      if (args.join(" ") === "worktree list --porcelain") {
        return [
          "worktree /repo",
          "HEAD abc",
          "branch refs/heads/master",
          "",
        ].join("\n");
      }
      if (args[0] === "switch" || args[0] === "pull") {
        return "";
      }
      if (args[0] === "ls-remote") {
        const error = new Error("network unavailable");
        error.status = 128;
        throw error;
      }
      if (args[0] === "show-ref") {
        const error = new Error("missing local branch");
        error.status = 1;
        throw error;
      }
      return "";
    },
  });

  const remoteDelete = result.steps.find((step) => step.name === "remote-branch-delete");
  assert.equal(remoteDelete.status, "failed");
  assert.match(remoteDelete.detail, /network unavailable/);
  assert.equal(result.steps.find((step) => step.name === "local-branch-delete").status, "skipped");
});

test("merge cleanup skips destructive cleanup when the primary worktree cannot fast-forward", () => {
  const calls = [];
  const branch = "codex/issue-26-primary-not-ready";
  const prHead = "1111111111111111111111111111111111111111";

  const result = mergePrWorktreeSafe(26, {
    cwd: "/repo.issue",
    defaultBranchName: "master",
    runGh: (args) => {
      calls.push(["gh", ...args]);
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          headRefName: branch,
          headRefOid: prHead,
          baseRefName: "master",
          isCrossRepository: false,
        });
      }
      if (args[0] === "pr" && args[1] === "merge") {
        return "merged";
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
    runGit: (args) => {
      calls.push(["git", ...args]);
      if (args.join(" ") === "worktree list --porcelain") {
        return [
          "worktree /repo",
          "HEAD abc",
          "branch refs/heads/master",
          "",
          "worktree /repo.issue",
          "HEAD def",
          `branch refs/heads/${branch}`,
          "",
        ].join("\n");
      }
      if (args[0] === "switch") {
        return "";
      }
      if (args[0] === "pull") {
        throw new Error("not fast-forward");
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    },
  });

  assert.equal(result.steps.find((step) => step.name === "primary-fast-forward").status, "failed");
  assert.equal(result.steps.find((step) => step.name === "local-worktree-remove").status, "skipped");
  assert.equal(result.steps.find((step) => step.name === "local-branch-delete").status, "skipped");
  assert.equal(result.steps.find((step) => step.name === "remote-branch-delete").status, "skipped");
  assert.equal(calls.some((call) => call.join(" ") === "git worktree remove /repo.issue"), false);
  assert.equal(calls.some((call) => call.join(" ") === `git branch -D ${branch}`), false);
  assert.equal(calls.some((call) => call.join(" ") === `git push origin --delete ${branch}`), false);
});

test("merge cleanup does not delete the remote branch after local branch safety fails", () => {
  const calls = [];
  const branch = "codex/issue-26-ref-race";
  const prHead = "1111111111111111111111111111111111111111";
  const movedLocalHead = "2222222222222222222222222222222222222222";

  const result = mergePrWorktreeSafe(26, {
    cwd: "/repo.issue",
    defaultBranchName: "master",
    runGh: (args) => {
      calls.push(["gh", ...args]);
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          headRefName: branch,
          headRefOid: prHead,
          baseRefName: "master",
          isCrossRepository: false,
        });
      }
      if (args[0] === "pr" && args[1] === "merge") {
        return "merged";
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
    runGit: (args) => {
      calls.push(["git", ...args]);
      if (args.join(" ") === "worktree list --porcelain") {
        return [
          "worktree /repo",
          "HEAD abc",
          "branch refs/heads/master",
          "",
          "worktree /repo.issue",
          "HEAD def",
          `branch refs/heads/${branch}`,
          "",
        ].join("\n");
      }
      if (args[0] === "switch" || args[0] === "pull") {
        return "";
      }
      if (args[0] === "ls-remote") {
        return `${prHead}\trefs/heads/${branch}`;
      }
      if (args[0] === "status") {
        return "";
      }
      if (args[0] === "worktree" && args[1] === "remove") {
        return "";
      }
      if (args[0] === "show-ref") {
        return `${movedLocalHead} refs/heads/${branch}`;
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    },
  });

  const remoteDelete = result.steps.find((step) => step.name === "remote-branch-delete");
  const localDelete = result.steps.find((step) => step.name === "local-branch-delete");

  assert.equal(localDelete.status, "failed");
  assert.match(localDelete.detail, /not PR head/);
  assert.equal(remoteDelete.status, "skipped");
  assert.match(remoteDelete.detail, /local branch cleanup did not complete/);
  assert.equal(calls.some((call) => call.join(" ") === `git push origin --delete ${branch}`), false);
  assert.equal(calls.some((call) => call.join(" ") === `git branch -D ${branch}`), false);
});

test("merge cleanup refuses remote branch deletion when the remote ref moved", () => {
  const calls = [];
  const branch = "codex/issue-26-remote-ref-race";
  const prHead = "1111111111111111111111111111111111111111";
  const movedRemoteHead = "2222222222222222222222222222222222222222";

  const result = mergePrWorktreeSafe(26, {
    cwd: "/repo.issue",
    defaultBranchName: "master",
    runGh: (args) => {
      calls.push(["gh", ...args]);
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          headRefName: branch,
          headRefOid: prHead,
          baseRefName: "master",
          isCrossRepository: false,
        });
      }
      if (args[0] === "pr" && args[1] === "merge") {
        return "merged";
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
    runGit: (args) => {
      calls.push(["git", ...args]);
      if (args.join(" ") === "worktree list --porcelain") {
        return [
          "worktree /repo",
          "HEAD abc",
          "branch refs/heads/master",
          "",
        ].join("\n");
      }
      if (args[0] === "switch" || args[0] === "pull") {
        return "";
      }
      if (args[0] === "show-ref") {
        const error = new Error("missing local branch");
        error.status = 1;
        throw error;
      }
      if (args[0] === "ls-remote") {
        return `${movedRemoteHead}\trefs/heads/${branch}`;
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    },
  });

  const remoteDelete = result.steps.find((step) => step.name === "remote-branch-delete");

  assert.equal(result.steps.find((step) => step.name === "local-branch-delete").status, "skipped");
  assert.equal(remoteDelete.status, "failed");
  assert.match(remoteDelete.detail, /not PR head/);
  assert.equal(calls.some((call) => call.join(" ") === `git push origin --delete ${branch}`), false);
});
