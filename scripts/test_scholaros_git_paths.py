#!/usr/bin/env python3
import os
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "scholaros-git-paths.sh"


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


class ScholarOSGitPathsTests(unittest.TestCase):
    def test_project_dir_prefers_scholaros_git_env(self) -> None:
        env = os.environ.copy()
        env["SCHOLAROS_GIT_PROJECT_DIR"] = "/tmp/scholaros-git-project"
        env["SCHOLAROS_PROJECT_DIR"] = "/tmp/scholaros-project"
        value = run_helper("scholaros_git_project_dir", "", env=env)
        self.assertEqual(value, "/tmp/scholaros-git-project")

    def test_config_path_prefers_scholaros_git_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".scholaros.json").write_text("{}\n", encoding="utf-8")
            (tmp_path / ".scholaros_git.json").write_text("{}\n", encoding="utf-8")
            value = run_helper("scholaros_git_find_config_path", str(tmp_path))
            self.assertEqual(value, str(tmp_path / ".scholaros_git.json"))

    def test_config_path_falls_back_to_scholaros_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".scholaros.json").write_text("{}\n", encoding="utf-8")
            value = run_helper("scholaros_git_find_config_path", str(tmp_path))
            self.assertEqual(value, str(tmp_path / ".scholaros.json"))

    def test_routing_path_prefers_scholaros_routing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / ".scholaros-routing.json").write_text("{}\n", encoding="utf-8")
            value = run_helper("scholaros_git_find_routing_path", str(tmp_path))
            self.assertEqual(value, str(tmp_path / ".scholaros-routing.json"))


if __name__ == "__main__":
    unittest.main()
