#!/usr/bin/env python3
"""Stdlib verification for scripts/office_markdown_guard.py."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / "scripts" / "office_markdown_guard.py"


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=False)


def make_docx(path: Path, texts: list[str]) -> None:
    body = "".join(f"<w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p>" for text in texts)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "word/document.xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                f"<w:body>{body}</w:body></w:document>"
            ),
        )


def make_pptx(path: Path, texts: list[str]) -> None:
    body = "".join(f"<a:t>{escape(text)}</a:t>" for text in texts)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "ppt/slides/slide1.xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                f"{body}</p:sld>"
            ),
        )


def make_xlsx(path: Path, texts: list[str]) -> None:
    shared = "".join(f"<si><t>{escape(text)}</t></si>" for text in texts)
    cells = "".join(
        f'<c r="A{i + 1}" t="s"><v>{i}</v></c>'
        for i in range(len(texts))
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/sharedStrings.xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f"{shared}</sst>"
            ),
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f"<sheetData><row>{cells}</row></sheetData></worksheet>"
            ),
        )


class OfficeMarkdownGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        run(["git", "init", "-q"], self.tmp)
        run(["git", "config", "user.email", "guard@example.test"], self.tmp)
        run(["git", "config", "user.name", "Guard Test"], self.tmp)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp)

    def commit_all(self) -> None:
        self.assertEqual(run(["git", "add", "-A"], self.tmp).returncode, 0)
        self.assertEqual(run(["git", "commit", "-q", "-m", "baseline"], self.tmp).returncode, 0)

    def guard(self, command: str = "") -> subprocess.CompletedProcess[str]:
        payload = {"cwd": str(self.tmp), "tool_input": {"command": command}}
        return subprocess.run(
            ["python3", str(GUARD)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
        )

    def test_docx_text_change_creates_markdown_and_blocks(self) -> None:
        docx = self.tmp / "paper.docx"
        make_docx(docx, ["Original paragraph"])
        self.commit_all()

        make_docx(docx, ["Edited paragraph"])
        result = self.guard()

        self.assertNotEqual(result.returncode, 0)
        markdown = self.tmp / "paper.md"
        self.assertTrue(markdown.exists())
        self.assertIn("Original paragraph", markdown.read_text(encoding="utf-8"))

    def test_existing_markdown_is_reused_not_duplicated(self) -> None:
        docx = self.tmp / "paper.docx"
        markdown = self.tmp / "paper.md"
        make_docx(docx, ["Original paragraph"])
        markdown.write_text("# Existing\n", encoding="utf-8")
        self.commit_all()

        make_docx(docx, ["Edited paragraph"])
        result = self.guard()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(markdown.read_text(encoding="utf-8"), "# Existing\n")
        self.assertEqual(list(self.tmp.glob("paper*.md")), [markdown])

    def test_pptx_and_xlsx_text_changes_block(self) -> None:
        pptx = self.tmp / "slides.pptx"
        xlsx = self.tmp / "table.xlsx"
        make_pptx(pptx, ["Original slide"])
        make_xlsx(xlsx, ["Original cell"])
        self.commit_all()

        make_pptx(pptx, ["Edited slide"])
        make_xlsx(xlsx, ["Edited cell"])
        result = self.guard()

        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.tmp / "slides.md").exists())
        self.assertTrue((self.tmp / "table.md").exists())

    def test_style_only_docx_change_is_allowed_when_markdown_is_not_newer(self) -> None:
        docx = self.tmp / "paper.docx"
        make_docx(docx, ["Same paragraph"])
        (self.tmp / "paper.md").write_text("Same paragraph\n", encoding="utf-8")
        self.commit_all()

        with zipfile.ZipFile(docx, "a") as archive:
            archive.writestr("word/styles.xml", "<styles><style id='x'/></styles>")

        result = self.guard("python3 style.py paper.docx")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_word_style_command_blocks_when_markdown_is_newer_than_docx(self) -> None:
        docx = self.tmp / "paper.docx"
        markdown = self.tmp / "paper.md"
        make_docx(docx, ["Same paragraph"])
        markdown.write_text("Same paragraph\n", encoding="utf-8")
        self.commit_all()

        time.sleep(1.1)
        markdown.write_text("Newer paragraph\n", encoding="utf-8")
        command = "python3 -c \"from docx import Document; d=Document('paper.docx'); d.styles['Normal'].font.bold=True; d.save('paper.docx')\""
        result = self.guard(command)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Markdown source is newer", result.stdout)

    def test_direct_text_command_blocks_and_creates_missing_markdown(self) -> None:
        docx = self.tmp / "paper.docx"
        make_docx(docx, ["Original paragraph"])
        self.commit_all()

        command = "python3 -c \"from docx import Document; d=Document('paper.docx'); d.paragraphs[0].text='Edited'; d.save('paper.docx')\""
        result = self.guard(command)

        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.tmp / "paper.md").exists())

    def test_read_only_office_command_is_allowed(self) -> None:
        docx = self.tmp / "paper.docx"
        make_docx(docx, ["Original paragraph"])
        self.commit_all()

        command = "python3 -c \"from docx import Document; d=Document('paper.docx'); print(len(d.paragraphs))\""
        result = self.guard(command)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((self.tmp / "paper.md").exists())

    def test_synced_office_text_is_allowed_when_markdown_matches(self) -> None:
        docx = self.tmp / "paper.docx"
        markdown = self.tmp / "paper.md"
        make_docx(docx, ["Original paragraph"])
        markdown.write_text("Original paragraph\n", encoding="utf-8")
        self.commit_all()

        markdown.write_text("Edited paragraph\n", encoding="utf-8")
        make_docx(docx, ["Edited paragraph"])
        result = self.guard()

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_empty_office_text_requires_empty_markdown_body(self) -> None:
        docx = self.tmp / "paper.docx"
        markdown = self.tmp / "paper.md"
        make_docx(docx, ["Original paragraph"])
        markdown.write_text("Original paragraph\n", encoding="utf-8")
        self.commit_all()

        make_docx(docx, [])
        result = self.guard()
        self.assertNotEqual(result.returncode, 0)

        markdown.write_text(
            "# paper.docx\n\n<!-- academic-git: source is intentionally empty. -->\n",
            encoding="utf-8",
        )
        result = self.guard()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_text_sync_command_is_allowed_when_it_references_markdown(self) -> None:
        docx = self.tmp / "paper.docx"
        markdown = self.tmp / "paper.md"
        make_docx(docx, ["Original paragraph"])
        markdown.write_text("Edited paragraph\n", encoding="utf-8")
        self.commit_all()

        command = "python3 -c \"from docx import Document; d=Document('paper.docx'); d.paragraphs[0].text=open('paper.md').read(); d.save('paper.docx')\""
        result = self.guard(command)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
