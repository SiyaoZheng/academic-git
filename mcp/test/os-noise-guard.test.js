const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..", "..");
const checkScript = path.join(repoRoot, "skills", "os-noise-guard", "check.sh");
const hookRunner = path.join(repoRoot, "hooks", "hook-runner.sh");

function runGit(args, cwd, env = {}) {
  childProcess.execFileSync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

function makeFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "academic-git-os-noise-"));
  const home = path.join(tmp, "home");
  const repo = path.join(tmp, "repo");
  const nested = path.join(repo, "references", "linear-cli");
  const gitConfig = path.join(home, ".gitconfig");

  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  runGit(["init"], repo);
  runGit(["init"], nested);

  const env = {
    HOME: home,
    GIT_CONFIG_GLOBAL: gitConfig,
  };

  return { tmp, home, repo, nested, gitConfig, env };
}

function runGuard(fixture) {
  return childProcess.spawnSync("bash", [checkScript], {
    cwd: fixture.repo,
    env: { ...process.env, ...fixture.env },
    input: JSON.stringify({ cwd: fixture.repo }),
    encoding: "utf-8",
  });
}

test("os-noise guard cleans only OS metadata and preserves real nested changes", () => {
  const fixture = makeFixture();
  const rootNoise = path.join(fixture.repo, ".DS_Store");
  const appleDouble = path.join(fixture.repo, "references", "._linear-cli");
  const nestedNoise = path.join(fixture.nested, ".DS_Store");
  const realNestedChange = path.join(fixture.nested, "real-change.txt");

  fs.writeFileSync(rootNoise, "metadata", "utf-8");
  fs.writeFileSync(appleDouble, "metadata", "utf-8");
  fs.writeFileSync(nestedNoise, "metadata", "utf-8");
  fs.writeFileSync(realNestedChange, "research evidence", "utf-8");

  const result = runGuard(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(rootNoise), false);
  assert.equal(fs.existsSync(appleDouble), false);
  assert.equal(fs.existsSync(nestedNoise), false);
  assert.equal(fs.existsSync(realNestedChange), true);

  const payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /Removed 3 OS metadata item/);
  assert.match(payload.hookSpecificOutput.additionalContext, /nested Git repo\(s\) remain dirty/);
  assert.match(payload.hookSpecificOutput.additionalContext, /real-change\.txt/);
});

test("os-noise guard idempotently repairs global excludes without touching the real home config", () => {
  const fixture = makeFixture();
  const result = runGuard(fixture);

  assert.equal(result.status, 0, result.stderr);

  const excludesPath = path.join(fixture.home, ".gitignore_global");
  const gitConfig = fs.readFileSync(fixture.gitConfig, "utf-8");
  const excludes = fs.readFileSync(excludesPath, "utf-8");

  assert.match(gitConfig, /excludesfile/);
  assert.match(excludes, /^\.DS_Store$/m);
  assert.match(excludes, /^\._\*$/m);
  assert.match(excludes, /^Thumbs\.db$/m);
  assert.match(result.stdout, /Added OS metadata patterns/);

  const second = runGuard(fixture);

  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout.trim(), "");
});

test("os-noise guard blocks Stop when nested repos remain dirty after cleanup", () => {
  const fixture = makeFixture();
  fs.writeFileSync(path.join(fixture.nested, ".DS_Store"), "metadata", "utf-8");
  fs.writeFileSync(path.join(fixture.nested, "real-change.txt"), "research evidence", "utf-8");

  const result = childProcess.spawnSync(
    "bash",
    [hookRunner, path.join(repoRoot, "skills", "os-noise-guard"), "--block"],
    {
      cwd: fixture.repo,
      env: {
        ...process.env,
        ...fixture.env,
        ACADEMIC_GIT_OS_NOISE_STRICT: "true",
      },
      input: JSON.stringify({ cwd: fixture.repo }),
      encoding: "utf-8",
    }
  );

  assert.equal(result.status, 2, result.stderr);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /nested Git repo\(s\) still dirty/);
  assert.match(payload.hookSpecificOutput.additionalContext, /real-change\.txt/);
  assert.equal(fs.existsSync(path.join(fixture.nested, ".DS_Store")), false);
});
