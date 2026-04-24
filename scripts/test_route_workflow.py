#!/usr/bin/env python3
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "hooks" / "codex" / "route-workflow.py"
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("route_workflow", MODULE_PATH)
assert SPEC and SPEC.loader
ROUTE_WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ROUTE_WORKFLOW)


class RouteWorkflowTests(unittest.TestCase):
    def test_resolve_config_path_prefers_scholaros_git_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".scholaros.json").write_text("{}\n", encoding="utf-8")
            (tmp_path / ".scholaros_git.json").write_text("{}\n", encoding="utf-8")
            resolved = ROUTE_WORKFLOW.resolve_config_path(str(tmp_path))
            self.assertEqual(resolved, tmp_path / ".scholaros_git.json")

    def test_resolve_config_path_falls_back_to_scholaros_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".scholaros.json").write_text("{}\n", encoding="utf-8")
            resolved = ROUTE_WORKFLOW.resolve_config_path(str(tmp_path))
            self.assertEqual(resolved, tmp_path / ".scholaros.json")

    def test_route_text_uses_scholaros_git_commands(self) -> None:
        payload = {
            "action": "handle-pr",
            "diagnostics": ["clean pushed issue branch is PR-ready"],
            "context": {
                "issue": 52,
                "branch": "codex/issue-52-replace-mcp-backend-with-cli-workflow-layer",
                "idempotency_key": "abc123",
            },
        }
        text = ROUTE_WORKFLOW.route_text(payload)
        self.assertIn("scholaros_git prepare_pr 52", text)
        self.assertIn("scholaros_git open_pr 52", text)


if __name__ == "__main__":
    unittest.main()
