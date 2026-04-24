# Academic Git Installation Memo

Last updated: 2026-04-24

This memo records the installation and debugging path for making `academic-git`
active as a user-level global Codex plugin on Adrian's machine. It is written as
a reproducible operations note rather than a polished release guide.

## Scope

The target state is:

- Codex app and CLI can discover the `Academic Git` plugin.
- The plugin is installed and enabled through Codex's plugin system.
- `academic-git` skills appear in the Codex app UI.
- The MCP server starts and exposes the expected tools.
- The global Codex hooks are active and enforce the academic-git workflow.

This is a Codex user-level global installation. It is not an OS-wide
all-users macOS installation.

## Public Documentation Anchors

Use these public docs as the source of truth before relying on local behavior:

- OpenAI Codex plugin build docs:
  <https://developers.openai.com/codex/plugins/build>
- OpenAI Codex plugin overview:
  <https://developers.openai.com/codex/plugins>
- OpenAI Codex hooks docs:
  <https://developers.openai.com/codex/hooks>
- OpenAI Codex config reference:
  <https://developers.openai.com/codex/config-reference>

Important doc-derived constraints:

- A personal marketplace lives at `~/.agents/plugins/marketplace.json`.
- A common personal plugin location is `~/.codex/plugins/<plugin-name>`.
- Marketplace `source.path` must be a `./`-prefixed path relative to the
  marketplace root.
- Installed plugins are materialized into
  `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`.
- Per-plugin enabled state is stored in `~/.codex/config.toml`.
- Hooks are not automatically registered from the plugin manifest. Codex looks
  for `hooks.json` next to active config layers, especially
  `~/.codex/hooks.json` and `<repo>/.codex/hooks.json`.
- `PreToolUse` can block Bash by returning
  `hookSpecificOutput.permissionDecision = "deny"` with a non-empty
  `permissionDecisionReason`.
- `Stop` expects JSON on stdout when exiting `0`; plain text output is invalid.
  To continue the agent, return `{"decision":"block","reason":"..."}`.

## Final Local State

Current working model:

- Source repo:
  `$ACADEMIC_GIT_REPO`
- Personal plugin source symlink:
  `$HOME/plugins/academic-git -> $ACADEMIC_GIT_REPO`
- Personal marketplace:
  `~/.agents/plugins/marketplace.json`
- Marketplace plugin path:
  `./plugins/academic-git`
- Registered marketplace in Codex config:
  `[marketplaces.home-local] source = "<absolute-home-directory>"`
- Enabled plugin in Codex config:
  `[plugins."academic-git@home-local"] enabled = true`
- Stale copied plugin directory:
  `~/.codex/plugins/academic-git` removed
- Installed cache symlink bundle:
  `~/.codex/plugins/cache/home-local/academic-git/0.2.0-codex/` contains symlinks for
  `.codex-plugin`, `.mcp.codex.json`, `.academic-git-routing.json`, `hooks`,
  `skills`, `scripts`, and `mcp`
- Global hook registration:
  `~/.codex/hooks.json`

The Codex app UI shows `Academic Git:*` skills as `Personal`. The CLI MCP smoke
test returned `MCP_SERVER academic-git` and `MCP_TOOLS_COUNT 25`.

## Key Lesson

The correct architecture is:

```text
~/plugins/academic-git symlink supplies code, skills, hooks, and MCP server
~/.agents/plugins/marketplace.json points home-local to ./plugins/academic-git
~/.codex/hooks.json registers global hooks and sets ACADEMIC_GIT_PLUGIN_ROOT
```

Do not assume that putting hook files inside a plugin bundle makes them active.
The plugin can carry hook implementation files, but the active registration
surface is still `hooks.json`.

## Pitfalls and Fixes

### 1. "System-level plugin" is not an official plugin category

The OpenAI docs describe plugins, marketplaces, config, managed configuration,
and hooks. They do not define a formal plugin class named `system-level plugin`.

For this project, use precise language:

- `user-level global Codex plugin`: registered in the user's Codex config and
  visible across the user's Codex workspaces.
- `system-level managed configuration`: admin or machine-level config such as
  managed requirements, not this plugin.

### 2. Marketplace registration is not enough

Having `~/.agents/plugins/marketplace.json` does not by itself prove the plugin
is installed and enabled.

Verify all three:

```bash
rg -n '\[marketplaces\.home-local\]|\[plugins\."academic-git@home-local"\]|enabled = true' ~/.codex/config.toml
python3 -m json.tool ~/.agents/plugins/marketplace.json >/dev/null
test "$(python3 - <<'PY'
import json, pathlib
print(json.loads(pathlib.Path('~/.agents/plugins/marketplace.json').expanduser().read_text())['plugins'][0]['source']['path'])
PY
)" = "./plugins/academic-git"
test -L ~/plugins/academic-git
test "$(readlink ~/plugins/academic-git)" = "$ACADEMIC_GIT_REPO"
```

The app UI should also show `Academic Git:*` skills under `Personal`.

### 3. The symlink is the intended local source of truth

The correct local development shape is not a hand-copied runtime directory under
`~/.codex/plugins/academic-git`.

Use this source-of-truth link:

```bash
: "${ACADEMIC_GIT_REPO:?set ACADEMIC_GIT_REPO to the local academic-git checkout}"
ln -sfn "$ACADEMIC_GIT_REPO" "$HOME/plugins/academic-git"
```

The personal marketplace is rooted at the user's home directory, so
`~/.agents/plugins/marketplace.json` must use `"path": "./plugins/academic-git"`.
If it points at `"./.codex/plugins/academic-git"`, Codex will read a stale copied
directory instead of the repo.

### 4. Do not hardcode Adrian's home path

Account-specific absolute paths are acceptable only as local installation
records in `~/.codex/config.toml`, not inside public release artifacts.

Use portable defaults:

```bash
ACADEMIC_GIT_PLUGIN_ROOT="${ACADEMIC_GIT_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}}"
```

The local `~/.codex/hooks.json` may set:

```bash
ACADEMIC_GIT_PLUGIN_ROOT="$HOME/plugins/academic-git"
```

That is a host-level activation pointer, not public plugin code.

### 5. Plugin manifest prompts have limits

The plugin manifest previously triggered warnings because `defaultPrompt`
exceeded supported limits. Keep the default prompt list short and each prompt
within the current Codex UI limit.

Current fix: combine the lint and PR prompt into one entry so the manifest has
three default prompts.

### 6. Hooks inside the plugin bundle did not automatically run

The app and CLI can install the plugin while still ignoring
`hooks/codex/hooks.json` inside the plugin bundle.

Fix: install a global hook registration file at `~/.codex/hooks.json` that
points to the symlinked plugin root through `ACADEMIC_GIT_PLUGIN_ROOT`.

Expected active hook events:

```text
SessionStart
UserPromptSubmit
PreToolUse
PostToolUse
Stop
```

### 7. `git add` was not blocked

The first routing table blocked `git commit` and `git push`, but raw
`git add` still allowed direct staging. That undermined the commit workflow.

Fix: route these commands to the formal `create_commit` workflow:

```text
git add
git rm
git mv
git clean
```

The intended message for `git add` is:

```text
Direct git add is blocked. Use create_commit(issue, items, type, description, paths?) so staging, validation, commit, and push stay issue-linked and auditable.
```

### 8. Whole-command regex caused false positives

Matching the routing table against the entire Bash command caused false
positives. For example, searching for the string `"direct git add"` with `rg`
could be misclassified as a real `git add`.

Fix: `scripts/render-routing-table.sh` now parses shell tokens with Python
`shlex`, finds real top-level or nested `git`/`gh` commands, and matches only
those subcommands. It still handles wrappers such as:

```bash
bash -lc 'git add note.txt'
sudo git push
```

### 9. Missing routing helper caused bad deny behavior

The old copied install initially lacked:

```text
scripts/render-routing-table.sh
.academic-git-routing.json
```

That made the git firewall produce bad or empty routing decisions. Codex then
saw errors such as a deny without a non-empty reason.

Fix: keep both the routing helper and the routing table in the symlink source.
If the helper is missing, the current firewall should fail open with an explicit
allow reason rather than deny ambiguously.

### 10. Stop hook JSON must be exact

`Stop` is stricter than casual shell testing. Plain text stdout is invalid, and
older nested JSON shapes can be rejected.

Use this minimal shape when continuing the agent:

```json
{
  "decision": "block",
  "reason": "Explain exactly what must happen before the session can end."
}
```

The dirty-tree guard now blocks with a message that routes the agent into the
academic-git commit workflow instead of raw `git add/commit/push`.

### 11. Skill files need YAML frontmatter

`skills/os-noise-guard/SKILL.md` originally lacked YAML frontmatter, causing
Codex skill loading errors.

Fix:

```yaml
---
name: os-noise-guard
description: Prevent macOS and Windows metadata files from polluting academic-git worktrees and blocking session cleanup.
---
```

### 12. MCP server must resolve through the symlink source

The plugin was visible and hooks worked, but the old copied install lacked
`mcp/src/server.js`.

Current symlink source includes:

```text
mcp/src/server.js
mcp/src/gates.js
mcp/src/git.js
mcp/src/gh.js
mcp/src/issue-start.js
mcp/src/merge-cleanup.js
mcp/src/workflow.js
mcp/src/command.js
mcp/package.json
mcp/package-lock.json
```

Do not manually copy MCP files into `~/.codex/plugins/academic-git` or the cache.
For public release, use a repeatable packaging step that includes compiled MCP
JavaScript and installs or vendors runtime dependencies deterministically.

### 13. MCP stdio framing is newline JSON, not Content-Length

The local MCP SDK transport used here reads one JSON-RPC message per newline.
A `Content-Length` framed smoke test hung.

Use newline-delimited JSON for direct local smoke testing of this server.

### 14. Delete stale copied system payloads

Old copied payloads can shadow the intended symlink source and make the UI show
historical skills such as `begin`, `commit`, `git-firewall`, or
`office-markdown-guard`.

Delete these copied payloads when switching back to the symlink mechanism:

```text
~/.codex/plugins/academic-git
~/.codex/plugins/cache/home-local/academic-git/0.2.0-codex
```

Then recreate the installed cache plugin root as a symlink bundle:

```bash
CACHE="$HOME/.codex/plugins/cache/home-local/academic-git/0.2.0-codex"
SRC="$HOME/plugins/academic-git"
rm -rf "$HOME/.codex/plugins/cache/home-local/academic-git"
mkdir -p "$CACHE"
for item in .codex-plugin .mcp.codex.json .academic-git-routing.json hooks skills scripts mcp; do
  ln -s "$SRC/$item" "$CACHE/$item"
done
```

Do not manually copy these directories; keep them as symlinks to the source repo.
Then restart Codex or rerun the relevant CLI smoke tests.

## Smoke Tests

### Plugin config

```bash
rg -n '\[marketplaces\.home-local\]|\[plugins\."academic-git@home-local"\]|enabled = true' ~/.codex/config.toml
test -L ~/plugins/academic-git
test -L ~/.codex/plugins/cache/home-local/academic-git/0.2.0-codex/skills
test -f ~/.codex/plugins/cache/home-local/academic-git/0.2.0-codex/.codex-plugin/plugin.json
python3 - <<'PY'
import json, pathlib
print(json.loads(pathlib.Path("~/.agents/plugins/marketplace.json").expanduser().read_text())["plugins"][0]["source"]["path"])
PY
```

### Hook config

```bash
jq '.hooks | keys' ~/.codex/hooks.json
```

Expected:

```json
[
  "PostToolUse",
  "PreToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "Stop"
]
```

### PreToolUse blocks raw staging

```bash
tmpdir=$(mktemp -d /tmp/academic-git-hook-contract.XXXXXX)
cd "$tmpdir"
git init -q
git config user.email test@example.com
git config user.name Test
printf 'base\n' > note.txt
git add note.txt
git commit -q -m init
printf 'changed\n' > note.txt

printf '%s\n' '{"cwd":"'"$tmpdir"'","tool_input":{"command":"git add note.txt"}}' \
  | ACADEMIC_GIT_PLUGIN_ROOT="$HOME/plugins/academic-git" \
    bash "$HOME/plugins/academic-git/hooks/codex/pretool-bash.sh"
```

Expected:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Direct git add is blocked. Use create_commit(issue, items, type, description, paths?) so staging, validation, commit, and push stay issue-linked and auditable."
  }
}
```

### Avoid false positive on quoted text

```bash
printf '%s\n' '{"cwd":"'"$tmpdir"'","tool_input":{"command":"rg -n \"direct git add\" note.txt"}}' \
  | ACADEMIC_GIT_PLUGIN_ROOT="$HOME/plugins/academic-git" \
    bash "$HOME/plugins/academic-git/hooks/codex/pretool-bash.sh"
```

Expected: no output and exit `0`.

### Stop hook dirty-tree contract

```bash
printf '%s\n' '{"cwd":"'"$tmpdir"'"}' \
  | ACADEMIC_GIT_PLUGIN_ROOT="$HOME/plugins/academic-git" \
    bash "$HOME/plugins/academic-git/hooks/codex/stop.sh"
```

Expected:

```json
{
  "decision": "block",
  "reason": "Auto-Commit detected ..."
}
```

### Real Codex CLI hook path

```bash
codex exec -C "$tmpdir" --sandbox danger-full-access --json \
  'Use the shell to run exactly: git add note.txt. Then tell me whether the command executed or was blocked by a hook.'
```

Expected output includes:

```text
Command blocked by PreToolUse hook: Direct git add is blocked...
```

### MCP stdio smoke test

Use newline-delimited JSON-RPC, not `Content-Length` framing.

```bash
python3 - <<'PY'
import json
import select
import subprocess

proc = subprocess.Popen(
    ["~/plugins/academic-git/scripts/start-mcp.sh"],
    cwd=".",
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1,
)

def send(obj):
    proc.stdin.write(json.dumps(obj, separators=(",", ":")) + "\n")
    proc.stdin.flush()

def read_line(timeout=5):
    ready, _, _ = select.select([proc.stdout.fileno()], [], [], timeout)
    if not ready:
        raise TimeoutError("timeout waiting for MCP line")
    return json.loads(proc.stdout.readline())

send({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "academic-git-smoke", "version": "0.0.0"},
    },
})
print(read_line())

send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
tools = read_line()
print([tool["name"] for tool in tools["result"]["tools"]])

proc.terminate()
PY
```

Expected:

```text
serverInfo.name == academic-git
tools/list returns 25 tools
```

## Public Release Notes

Before publishing, replace local host activation steps with a repeatable package
or install process:

- Build compiled MCP JavaScript into the plugin source or release artifact.
- Decide whether to vendor `node_modules` or install dependencies during the
  plugin packaging process.
- Keep `source.path` relative and portable.
- Do not rely on account-specific home paths except in private local
  verification notes.
- Ensure every `SKILL.md` has valid YAML frontmatter.
- Run hook contract tests and MCP smoke tests after packaging.
- Keep `~/.codex/hooks.json` generation or installation explicit, because
  hooks are not auto-registered by the plugin manifest.

## Current Verified Status

```text
Codex CLI plugin: installed and enabled
Codex app UI: Academic Git skills visible
Global hooks: active through ~/.codex/hooks.json
UserPromptSubmit: routes target worktree through symlink plugin root
PreToolUse: blocks raw git add
PreToolUse: does not false-positive on quoted "direct git add" text
MCP: initialize succeeds; tools/list returns 25 tools
```
