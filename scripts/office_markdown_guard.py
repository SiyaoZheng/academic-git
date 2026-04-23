#!/usr/bin/env python3
"""Guard Office document text edits behind corresponding Markdown sources."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


OFFICE_SUFFIXES = {".docx", ".xlsx", ".pptx"}
WORD_STYLE_MARKERS = (
    ".style",
    ".font",
    ".bold",
    ".italic",
    ".underline",
    ".alignment",
    ".paragraph_format",
    ".page_setup",
    ".styles",
    ".sections",
    ".margins",
    ".spacing",
    ".color",
    ".rgb",
)
STYLE_MARKERS = WORD_STYLE_MARKERS + (
    ".fill",
    ".line",
    ".border",
    ".width",
    ".height",
    ".number_format",
    ".column_dimensions",
    ".row_dimensions",
    ".slide_width",
    ".slide_height",
    ".theme",
)
TEXT_MUTATION_PATTERNS = (
    re.compile(r"\.text\s*="),
    re.compile(r"\.value\s*="),
    re.compile(r"\.add_paragraph\s*\("),
    re.compile(r"\.add_run\s*\("),
    re.compile(r"\.add_textbox\s*\("),
    re.compile(r"\.insert_text\s*\("),
    re.compile(r"\.append\s*\("),
    re.compile(r"\[[^\]]+\]\s*="),
    re.compile(r"\bsharedStrings\.xml\b"),
    re.compile(r"\bword/document\.xml\b"),
    re.compile(r"\bppt/slides/slide\d+\.xml\b"),
    re.compile(r"\bxl/worksheets/sheet\d+\.xml\b"),
)
OFFICE_PATH_RE = re.compile(
    r"""(?P<quoted>["'][^"']+\.(?:docx|xlsx|pptx)["'])|(?P<bare>[^\s"'<>|&;]+\.(?:docx|xlsx|pptx))""",
    re.IGNORECASE,
)


@dataclass
class Violation:
    office_path: Path
    markdown_path: Path
    reason: str
    created_markdown: bool = False


def run_git(args: list[str], cwd: Path, *, binary: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=not binary,
    )


def repo_root(cwd: Path) -> Path | None:
    completed = run_git(["rev-parse", "--show-toplevel"], cwd)
    if completed.returncode != 0:
        return None
    return Path(completed.stdout.strip()).resolve()


def rel_to_repo(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root).as_posix()


def markdown_for(path: Path) -> Path:
    return path.with_suffix(".md")


def parse_hook_input() -> tuple[str, Path]:
    raw = sys.stdin.read()
    if not raw.strip():
        return "", Path.cwd()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return "", Path.cwd()
    tool_input = data.get("tool_input", {})
    command = tool_input.get("command", "")
    cwd = data.get("cwd") or tool_input.get("cwd") or os.getcwd()
    return command, Path(cwd).expanduser().resolve()


def command_office_paths(command: str, cwd: Path) -> list[Path]:
    paths: list[Path] = []
    for match in OFFICE_PATH_RE.finditer(command):
        token = match.group("quoted") or match.group("bare") or ""
        token = token.strip("\"'")
        path = Path(token).expanduser()
        if not path.is_absolute():
            path = cwd / path
        paths.append(path.resolve())
    return dedupe_paths(paths)


def dedupe_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[Path] = set()
    result: list[Path] = []
    for path in paths:
        if path not in seen:
            seen.add(path)
            result.append(path)
    return result


def has_text_mutation_intent(command: str) -> bool:
    return any(pattern.search(command) for pattern in TEXT_MUTATION_PATTERNS)


def has_style_intent(command: str) -> bool:
    return any(marker in command for marker in STYLE_MARKERS)


def has_word_style_intent(command: str) -> bool:
    return any(marker in command for marker in WORD_STYLE_MARKERS)


def visible_text_from_xml(xml_bytes: bytes, tag_suffixes: tuple[str, ...]) -> list[str]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    texts: list[str] = []
    for elem in root.iter():
        if elem.text is None:
            continue
        tag = elem.tag.rsplit("}", 1)[-1]
        if tag in tag_suffixes:
            texts.append(elem.text)
    return texts


def extract_docx_text(path: Path) -> list[str]:
    parts = (
        "word/document.xml",
        "word/footnotes.xml",
        "word/endnotes.xml",
        "word/comments.xml",
    )
    texts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        wanted = [
            name for name in names
            if name in parts
            or re.match(r"word/(header|footer)\d+\.xml$", name)
        ]
        for name in sorted(wanted):
            texts.extend(visible_text_from_xml(archive.read(name), ("t",)))
    return texts


def extract_pptx_text(path: Path) -> list[str]:
    texts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        wanted = [
            name for name in archive.namelist()
            if re.match(r"ppt/(slides|notesSlides)/(slide|notesSlide)\d+\.xml$", name)
        ]
        for name in sorted(wanted):
            texts.extend(visible_text_from_xml(archive.read(name), ("t",)))
    return texts


def extract_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except ET.ParseError:
        return []

    strings: list[str] = []
    for item in root.iter():
        if item.tag.rsplit("}", 1)[-1] != "si":
            continue
        parts = [
            elem.text or ""
            for elem in item.iter()
            if elem.tag.rsplit("}", 1)[-1] == "t"
        ]
        strings.append("".join(parts))
    return strings


def extract_xlsx_text(path: Path) -> list[str]:
    texts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        shared = extract_shared_strings(archive)
        workbook_name = "xl/workbook.xml"
        if workbook_name in archive.namelist():
            try:
                workbook = ET.fromstring(archive.read(workbook_name))
            except ET.ParseError:
                workbook = None
            if workbook is not None:
                for elem in workbook.iter():
                    if elem.tag.rsplit("}", 1)[-1] == "sheet" and elem.attrib.get("name"):
                        texts.append(elem.attrib["name"])

        worksheets = [
            name for name in archive.namelist()
            if re.match(r"xl/worksheets/sheet\d+\.xml$", name)
        ]
        for name in sorted(worksheets):
            try:
                root = ET.fromstring(archive.read(name))
            except ET.ParseError:
                continue
            for cell in root.iter():
                if cell.tag.rsplit("}", 1)[-1] != "c":
                    continue
                cell_type = cell.attrib.get("t")
                if cell_type == "s":
                    value = first_child_text(cell, "v")
                    if value and value.isdigit() and int(value) < len(shared):
                        texts.append(shared[int(value)])
                elif cell_type == "inlineStr":
                    parts = [
                        elem.text or ""
                        for elem in cell.iter()
                        if elem.tag.rsplit("}", 1)[-1] == "t"
                    ]
                    value = "".join(parts)
                    if value != "":
                        texts.append(value)
                elif cell_type == "str":
                    value = first_child_text(cell, "v")
                    if value != "":
                        texts.append(value)
    return [text for text in texts if text != ""]


def first_child_text(elem: ET.Element, local_name: str) -> str:
    for child in elem:
        if child.tag.rsplit("}", 1)[-1] == local_name:
            return child.text or ""
    return ""


def extract_text(path: Path) -> list[str]:
    if not path.exists():
        return []
    suffix = path.suffix.lower()
    try:
        if suffix == ".docx":
            return extract_docx_text(path)
        if suffix == ".xlsx":
            return extract_xlsx_text(path)
        if suffix == ".pptx":
            return extract_pptx_text(path)
    except (OSError, zipfile.BadZipFile):
        return []
    return []


def extract_text_from_head(root: Path, rel_path: str) -> list[str] | None:
    completed = run_git(["show", f"HEAD:{rel_path}"], root, binary=True)
    if completed.returncode != 0:
        return None

    suffix = Path(rel_path).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(completed.stdout)
        temp_path = Path(handle.name)
    try:
        return extract_text(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)


def write_markdown_source(markdown_path: Path, office_path: Path, text: list[str]) -> bool:
    if markdown_path.exists():
        return False
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n\n".join(text).strip()
    if body:
        body = f"\n\n{body}\n"
    markdown_path.write_text(
        "\n".join(
            [
                f"# {office_path.name}",
                "",
                "<!-- academic-git: edit document text here, then sync it back to the Office file. -->",
            ]
        )
        + body,
        encoding="utf-8",
    )
    return True


def changed_office_files(root: Path) -> list[Path]:
    tracked = run_git(
        ["diff", "--name-only", "--diff-filter=ACMRT", "HEAD", "--", "*.docx", "*.xlsx", "*.pptx"],
        root,
    )
    untracked = run_git(
        ["ls-files", "--others", "--exclude-standard", "--", "*.docx", "*.xlsx", "*.pptx"],
        root,
    )
    names: list[str] = []
    if tracked.returncode == 0:
        names.extend(line for line in tracked.stdout.splitlines() if line.strip())
    if untracked.returncode == 0:
        names.extend(line for line in untracked.stdout.splitlines() if line.strip())
    return dedupe_paths(root / name for name in names)


def check_text_changes(root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for office_path in changed_office_files(root):
        if not office_path.exists() or office_path.suffix.lower() not in OFFICE_SUFFIXES:
            continue
        rel = rel_to_repo(office_path, root)
        before = extract_text_from_head(root, rel)
        after = extract_text(office_path)
        if before is None:
            text_changed = bool(after)
            source_text = after
        else:
            text_changed = before != after
            source_text = before
        if not text_changed:
            continue

        markdown_path = markdown_for(office_path)
        if markdown_matches_office_text(markdown_path, after):
            continue
        created = write_markdown_source(markdown_path, office_path, source_text)
        violations.append(
            Violation(
                office_path=office_path,
                markdown_path=markdown_path,
                created_markdown=created,
                reason="Office document text changed outside its Markdown source.",
            )
        )
    return violations


def check_command_intent(command: str, cwd: Path) -> list[Violation]:
    if not command:
        return []

    office_paths = command_office_paths(command, cwd)
    if not office_paths:
        return []

    text_intent = has_text_mutation_intent(command)
    style_intent = has_style_intent(command)
    sync_intent = has_markdown_sync_intent(command, office_paths)
    violations: list[Violation] = []

    if not sync_intent and (text_intent or (not style_intent and has_office_write_intent(command))):
        for office_path in office_paths:
            markdown_path = markdown_for(office_path)
            text = extract_text(office_path)
            created = write_markdown_source(markdown_path, office_path, text)
            violations.append(
                Violation(
                    office_path=office_path,
                    markdown_path=markdown_path,
                    created_markdown=created,
                    reason="Command appears to edit Office document text directly.",
                )
            )

    if not text_intent and has_word_style_intent(command) and has_office_write_intent(command):
        for office_path in office_paths:
            if office_path.suffix.lower() != ".docx":
                continue
            markdown_path = markdown_for(office_path)
            if (
                office_path.exists()
                and markdown_path.exists()
                and markdown_path.stat().st_mtime > office_path.stat().st_mtime
            ):
                violations.append(
                    Violation(
                        office_path=office_path,
                        markdown_path=markdown_path,
                        reason="Word style edit blocked because the Markdown source is newer than the Word file.",
                    )
                )
    return violations


def markdown_matches_office_text(markdown_path: Path, office_text: list[str]) -> bool:
    if not markdown_path.exists():
        return False
    try:
        content = markdown_path.read_text(encoding="utf-8")
    except OSError:
        return False

    if not [text for text in office_text if text]:
        return markdown_document_body(content) == ""

    cursor = 0
    for text in office_text:
        if text == "":
            continue
        position = content.find(text, cursor)
        if position < 0:
            return False
        cursor = position + len(text)
    return True


def markdown_document_body(content: str) -> str:
    body_lines: list[str] = []
    in_comment = False
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("<!--"):
            in_comment = "-->" not in stripped
            continue
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            continue
        body_lines.append(line)
    return "\n".join(body_lines).strip()


def has_markdown_sync_intent(command: str, office_paths: list[Path]) -> bool:
    if not office_paths:
        return False
    for office_path in office_paths:
        markdown_path = markdown_for(office_path)
        markers = {
            markdown_path.name,
            str(markdown_path),
            str(markdown_path.resolve()),
        }
        if not markdown_path.exists() or not any(marker in command for marker in markers):
            return False
    return True


def has_office_write_intent(command: str) -> bool:
    write_markers = (
        ".save(",
        ".save_as(",
        "save_workbook",
        "pandoc",
        "libreoffice",
    )
    return any(marker in command for marker in write_markers)


def format_violation_message(violations: list[Violation]) -> str:
    lines = [
        "[academic-git] Office text edits must go through Markdown sources.",
        "",
    ]
    for violation in violations:
        created = "created" if violation.created_markdown else "existing"
        lines.extend(
            [
                f"- Office file: {violation.office_path}",
                f"  Markdown source ({created}): {violation.markdown_path}",
                f"  Reason: {violation.reason}",
            ]
        )
    lines.extend(
        [
            "",
            "Edit the Markdown file directly, then reflect the Markdown content back into the Office document before making style-only Office changes.",
        ]
    )
    return "\n".join(lines)


def emit_block(message: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": message,
                }
            },
            ensure_ascii=False,
        )
    )


def main() -> int:
    command, cwd = parse_hook_input()
    root = repo_root(cwd)
    if root is None:
        return 0

    command_violations = check_command_intent(command, cwd)
    tree_violations = check_text_changes(root)
    violations = command_violations + [
        violation
        for violation in tree_violations
        if (violation.office_path, violation.reason)
        not in {(v.office_path, v.reason) for v in command_violations}
    ]

    if not violations:
        return 0

    emit_block(format_violation_message(violations))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
