#!/usr/bin/env python3
"""Validate issue-start bodies for the codex-gh-issue-start skill boundary."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


REQUIRED_SECTIONS = (
    "## Context",
    "## Task",
    "## Scope",
    "## Affected Files",
    "## Verification",
)
CHECKLIST_RE = re.compile(
    r"^- \[ \] (?P<letter>[A-Z])\. (?P<text>.+?)(?:\s*(?:→|->)\s*after:\s*(?P<after>.+))?$",
    re.MULTILINE,
)
DEPENDENCY_RE = re.compile(r"^[A-Z](?:\s*,\s*[A-Z])*$")


def read_body(path: str | None) -> str:
    if not path or path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def parse_dependencies(raw: str) -> list[str]:
    value = raw.strip()
    if value == "(none)":
        return []
    if not DEPENDENCY_RE.fullmatch(value):
        raise ValueError(f"Invalid dependency declaration: after: {raw}")
    return [part.strip() for part in value.split(",")]


def assert_acyclic(graph: dict[str, list[str]]) -> None:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str, path: list[str]) -> None:
        if node in visited:
            return
        if node in visiting:
            cycle = " -> ".join([*path, node])
            raise ValueError(f"Checklist dependencies must be acyclic; found cycle: {cycle}")
        visiting.add(node)
        for dep in graph[node]:
            visit(dep, [*path, node])
        visiting.remove(node)
        visited.add(node)

    for letter in graph:
        visit(letter, [])


def validate_body(body: str) -> None:
    missing = [section for section in REQUIRED_SECTIONS if section not in body]
    if missing:
        raise ValueError(f"Issue body missing required sections: {', '.join(missing)}")

    checklist = list(CHECKLIST_RE.finditer(body))
    if not checklist:
        raise ValueError("Issue body must contain at least one checklist item: - [ ] A. description -> after: (none)")

    letters: list[str] = []
    graph: dict[str, list[str]] = {}
    for match in checklist:
        letter = match.group("letter")
        raw_after = match.group("after")
        line = match.group(0)

        if letter in letters:
            raise ValueError(f"Checklist item letters must be unique; duplicate item: {letter}")
        if raw_after is None:
            raise ValueError(f"Every checklist item must declare DAG dependencies with 'after:': {line}")

        deps = parse_dependencies(raw_after)
        if letter in deps:
            raise ValueError(f"Checklist item {letter} cannot depend on itself.")
        letters.append(letter)
        graph[letter] = deps

    declared = set(letters)
    missing_deps = sorted({dep for deps in graph.values() for dep in deps if dep not in declared})
    if missing_deps:
        raise ValueError(f"Checklist dependencies reference undeclared item(s): {', '.join(missing_deps)}")

    assert_acyclic(graph)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate a codex-gh-issue-start issue body.")
    parser.add_argument("body_file", nargs="?", help="Issue body file, or '-' / omitted for stdin.")
    args = parser.parse_args(argv)

    try:
        validate_body(read_body(args.body_file))
    except (OSError, ValueError) as exc:
        print(f"codex-gh-issue-start skill check failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
