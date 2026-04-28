#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TABLE_PATH="$REPO_DIR/.scholaros-routing.json"

INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // .command // ""' 2>/dev/null || true)"

if [ -z "$COMMAND" ]; then
  jq -n '{decision:"allow", reason:"No Bash command to classify."}'
  exit 0
fi

ROUTE_COMMAND="$(python3 - "$COMMAND" <<'PY'
import shlex
import sys

separators = {";", "&&", "||", "|", "\n"}
wrappers = {"command", "builtin", "time", "sudo"}
shells = {"bash", "sh", "zsh"}


def tokenize(text):
    lexer = shlex.shlex(text, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    lexer.commenters = ""
    return list(lexer)


def first_routed_command(tokens, depth=0):
    if depth > 3:
        return []

    command_start = True
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token in separators:
            command_start = True
            i += 1
            continue
        if not command_start:
            i += 1
            continue

        while i < len(tokens) and "=" in tokens[i] and not tokens[i].startswith("-") and tokens[i].split("=", 1)[0].isidentifier():
            i += 1
        if i >= len(tokens):
            break

        token = tokens[i]
        base = token.rsplit("/", 1)[-1]
        while base in wrappers and i + 1 < len(tokens):
            i += 1
            token = tokens[i]
            base = token.rsplit("/", 1)[-1]

        if base in {"git", "gh"}:
            end = i + 1
            while end < len(tokens) and tokens[end] not in separators:
                end += 1
            return tokens[i:end]

        if base in shells:
            j = i + 1
            while j < len(tokens) and tokens[j] not in separators:
                if tokens[j] in {"-c", "-lc", "-cl"} and j + 1 < len(tokens):
                    nested = first_routed_command(tokenize(tokens[j + 1]), depth + 1)
                    if nested:
                        return nested
                j += 1

        command_start = False
        i += 1

    return []


try:
    routed = first_routed_command(tokenize(sys.argv[1]))
except ValueError:
    routed = []

print(" ".join(shlex.quote(part) for part in routed))
PY
)"

if [ -z "$ROUTE_COMMAND" ]; then
  jq -n '{decision:"allow", reason:"No routed git or gh command found."}'
  exit 0
fi

if [ ! -f "$TABLE_PATH" ]; then
  jq -n '{decision:"deny", reason:"Missing .scholaros-routing.json routing table."}'
  exit 0
fi

MATCHED="$(jq -c --arg cmd "$ROUTE_COMMAND" '
  [
    .entries
    | to_entries[]
    | select(.value.match as $match | $cmd | test($match))
    | {
        index: .key,
        decision: .value.decision,
        match: .value.match,
        reason: .value.reason,
        tool: .value.tool,
        policy: .value.policy,
        score: (if .value.decision == "deny" then 3 elif .value.decision == "route" then 2 else 1 end)
      }
  ]
  | if length == 0 then
      {decision:"allow", reason:"No routing rule matched."}
    else
      sort_by(-.score, .index)[0] | del(.index, .score)
    end
' "$TABLE_PATH")"

if [ -n "$MATCHED" ]; then
  printf '%s\n' "$MATCHED"
else
  jq -n '{decision:"allow", reason:"No routing rule matched."}'
fi
