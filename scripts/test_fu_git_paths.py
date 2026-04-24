#!/usr/bin/env python3
import os
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "fu-git-paths.sh"


def run_helper(function_name: str, target: str, env: dict[str, str] | None = None) -> str:
    command = f"source {shlex.quote(str(HELPER))}; {function_name} {shlex.quote(target)}"
    completed = subprocess.run(
        ["bash", "-lc", command],
        capture_output=True,
        text=True,
        check=True,
        env=env,
    )
    return completed.stdout.strip()


class FuGitPathsTests(unittest.TestCase):
    def test_project_dir_prefers_fu_git_env(self) -> None:
        env = os.environ.copy()
        env["FU_GIT_PROJECT_DIR"] = "/tmp/fu-git-project"
        env["ACADEMIC_GIT_PROJECT_DIR"] = "/tmp/legacy-project"
        value = run_helper("fu_git_project_dir", "", env=env)
        self.assertEqual(value, "/tmp/fu-git-project")

    def test_config_path_prefers_fu_git_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".academic-git.json").write_text("{}\n", encoding="utf-8")
            (tmp_path / ".fu_git.json").write_text("{}\n", encoding="utf-8")
            value = run_helper("fu_git_find_config_path", str(tmp_path))
            self.assertEqual(value, str(tmp_path / ".fu_git.json"))

    def test_config_path_falls_back_to_legacy_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".academic-git.json").write_text("{}\n", encoding="utf-8")
            value = run_helper("fu_git_find_config_path", str(tmp_path))
            self.assertEqual(value, str(tmp_path / ".academic-git.json"))

    def test_routing_path_prefers_fu_routing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".academic-git-routing.json").write_text("{}\n", encoding="utf-8")
            (tmp_path / ".fu-routing.json").write_text("{}\n", encoding="utf-8")
            value = run_helper("fu_git_find_routing_path", str(tmp_path))
            self.assertEqual(value, str(tmp_path / ".fu-routing.json"))


if __name__ == "__main__":
    unittest.main()
