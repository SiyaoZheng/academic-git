---
name: office-markdown-guard
description: Internal hook policy that keeps Office document text edits routed through corresponding Markdown source files while allowing style-only edits.
---

# Office Markdown Guard

## Purpose

Word, Excel, and PowerPoint files are review-hostile binary containers. This guard preserves research traceability by requiring text edits to happen in a corresponding Markdown file, while allowing style-only Office edits.

## Mapping

The corresponding Markdown file is finite and deterministic:

- `path/to/report.docx` -> `path/to/report.md`
- `path/to/table.xlsx` -> `path/to/table.md`
- `path/to/deck.pptx` -> `path/to/deck.md`

If the Markdown file already exists, the guard reuses it and never creates a duplicate.

## Rules

- Direct text-content edits to `.docx`, `.xlsx`, and `.pptx` are blocked.
- When a direct text edit is detected and the corresponding Markdown file is missing, the guard creates that Markdown file from the last committed Office text when available, otherwise from the current Office text.
- Users must edit the Markdown file directly, then reflect those Markdown edits back into the Office document through an explicit sync/conversion workflow.
- Sync/conversion commands that update Office text must explicitly reference the corresponding Markdown file, and the resulting Office text must appear in that Markdown source in order.
- Style-only Office edits are allowed.
- Before any Word style-only edit, if the corresponding Markdown file is newer than the `.docx`, the style edit is blocked until the Markdown content is reflected back into Word.

## Verification

Run:

```bash
python3 scripts/test_office_markdown_guard.py
```
