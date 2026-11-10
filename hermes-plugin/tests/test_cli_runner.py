import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

from helpers import real_cli_command, repo_cli_env, submodule


class ResolveCliTest(unittest.TestCase):
    def setUp(self):
        self.mod = submodule("cli_runner")

    def test_env_override_wins_and_is_shell_split(self):
        cmd = self.mod.resolve_cli({"KSKILL_CLI": "node /opt/my cli/k-skill.js", "PATH": ""})
        self.assertEqual(cmd, ["node", "/opt/my", "cli/k-skill.js"])

    def test_quoted_env_override_keeps_spaces(self):
        cmd = self.mod.resolve_cli({"KSKILL_CLI": "node '/opt/my cli/k-skill.js'", "PATH": ""})
        self.assertEqual(cmd, ["node", "/opt/my cli/k-skill.js"])

    def test_prefers_installed_k_skill_binary_over_npx(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ("k-skill", "npx"):
                p = Path(d, name)
                p.write_text("#!/bin/sh\n")
                p.chmod(p.stat().st_mode | stat.S_IXUSR)
            cmd = self.mod.resolve_cli({"PATH": d})
        self.assertEqual(cmd, [str(Path(d, "k-skill"))])

    def test_falls_back_to_pinned_major_via_npx(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "npx")
            p.write_text("#!/bin/sh\n")
            p.chmod(p.stat().st_mode | stat.S_IXUSR)
            cmd = self.mod.resolve_cli({"PATH": d})
        self.assertEqual(cmd, [str(p), "-y", "@nomadamas/k-skill@0"])

    def test_returns_none_when_nothing_available(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(self.mod.resolve_cli({"PATH": d}))

    def test_blank_env_override_is_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(self.mod.resolve_cli({"KSKILL_CLI": "   ", "PATH": d}))


def _script(path: Path, body: str) -> None:
    path.write_text("#!/bin/sh\n" + body + "\n")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


class StaleCliFallbackTest(unittest.TestCase):
    """An old global `k-skill` that lacks a newer skill must fall through to npx @0."""

    def setUp(self):
        self.mod = submodule("cli_runner")
        self._old = dict(os.environ)
        self.dir = tempfile.mkdtemp()
        os.environ.pop("KSKILL_CLI", None)
        os.environ["PATH"] = self.dir + os.pathsep + "/usr/bin:/bin"

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._old)

    def test_candidates_list_installed_binary_before_npx(self):
        _script(Path(self.dir, "k-skill"), "exit 0")
        _script(Path(self.dir, "npx"), "exit 0")
        cands = self.mod.resolve_cli_candidates(os.environ)
        self.assertEqual(cands, [[str(Path(self.dir, "k-skill"))],
                                 [str(Path(self.dir, "npx")), "-y", "@nomadamas/k-skill@0"]])

    def test_unknown_skill_on_installed_cli_retries_with_npx(self):
        _script(Path(self.dir, "k-skill"), 'echo "error: unknown skill \"$2\"." >&2; exit 1')
        _script(Path(self.dir, "npx"), 'echo "via-npx $*"')
        out = self.mod.run_cli(["instruct", "newer-skill"])
        self.assertTrue(out["ok"], out)
        self.assertIn("via-npx -y @nomadamas/k-skill@0 instruct newer-skill", out["stdout"])

    def test_other_failures_do_not_retry(self):
        _script(Path(self.dir, "k-skill"), 'echo "boom" >&2; exit 3')
        _script(Path(self.dir, "npx"), 'echo "should-not-run"')
        out = self.mod.run_cli(["exec", "x", "scripts/a.py", "--"])
        self.assertEqual(out["exit_code"], 3)
        self.assertNotIn("should-not-run", out["stdout"])

    def test_env_override_never_falls_back(self):
        os.environ["KSKILL_CLI"] = f"{Path(self.dir, 'k-skill')}"
        _script(Path(self.dir, "k-skill"), 'echo "error: unknown skill" >&2; exit 1')
        _script(Path(self.dir, "npx"), 'echo "should-not-run"')
        out = self.mod.run_cli(["instruct", "x"])
        self.assertFalse(out["ok"])
        self.assertNotIn("should-not-run", out["stdout"])


class RunCliTest(unittest.TestCase):
    def setUp(self):
        self.mod = submodule("cli_runner")
        self._old = dict(os.environ)
        os.environ.update(repo_cli_env())

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._old)

    def test_real_cli_list_succeeds(self):
        out = self.mod.run_cli(["list"])
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["exit_code"], 0)
        self.assertIn("cheap-gas-nearby", out["stdout"].split())

    def test_nonzero_exit_is_reported_not_raised(self):
        out = self.mod.run_cli(["instruct", "definitely-not-a-skill"])
        self.assertFalse(out["ok"])
        self.assertEqual(out["exit_code"], 1)
        self.assertIn("unknown skill", out["stderr"])

    def test_timeout_kills_child_and_flags_it(self):
        os.environ["KSKILL_CLI"] = f"{sys.executable} -c 'import time; time.sleep(30)'"
        out = self.mod.run_cli(["list"], timeout=1)
        self.assertFalse(out["ok"])
        self.assertTrue(out["timed_out"])
        self.assertIsNone(out["exit_code"])

    def test_output_is_truncated_with_flag(self):
        os.environ["KSKILL_CLI"] = f"{sys.executable} -c 'print(\"x\" * 500000)'"
        out = self.mod.run_cli(["list"])
        self.assertTrue(out["ok"])
        self.assertTrue(out["truncated"])
        self.assertLessEqual(len(out["stdout"]), self.mod.MAX_OUTPUT_CHARS + 200)

    def test_child_stdin_is_closed(self):
        os.environ["KSKILL_CLI"] = f"{sys.executable} -c 'import sys; print(repr(sys.stdin.read()))'"
        out = self.mod.run_cli(["x"], timeout=10)
        self.assertEqual(out["stdout"].strip(), "''")

    def test_missing_cli_gives_actionable_error(self):
        os.environ["KSKILL_CLI"] = ""
        os.environ["PATH"] = ""
        out = self.mod.run_cli(["list"])
        self.assertFalse(out["ok"])
        self.assertIn("Node.js", out["error"])


if __name__ == "__main__":
    unittest.main()
