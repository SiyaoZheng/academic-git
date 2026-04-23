const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runFile } = require("../src/command.js");
const { ghPrCreateArgs } = require("../src/gh.js");

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
  const title = "Fix `open_pr` body $(echo polluted)";
  const args = ghPrCreateArgs(title, body);

  const out = runFile(process.execPath, [fakeGh, capture, ...args], tmp);

  assert.equal(out, "created");
  assert.deepEqual(JSON.parse(fs.readFileSync(capture, "utf-8")), args);
  assert.equal(fs.existsSync(sentinel), false);
});
