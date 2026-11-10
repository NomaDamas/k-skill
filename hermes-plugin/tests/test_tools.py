import json
import os
import unittest

from helpers import repo_cli_env, submodule


class ToolsTest(unittest.TestCase):
    def setUp(self):
        self.tools = submodule("tools")
        self._old = dict(os.environ)
        os.environ.update(repo_cli_env())

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._old)

    def call(self, fn, args):
        raw = fn(args)
        self.assertIsInstance(raw, str)
        return json.loads(raw)

    # --- kskill_search -------------------------------------------------
    def test_search_returns_ranked_matches(self):
        out = self.call(self.tools.kskill_search, {"query": "미세먼지"})
        self.assertTrue(out["ok"])
        self.assertIn("fine-dust-location", [r["name"] for r in out["results"]])
        self.assertIn("instructions", out["next_step"])

    def test_search_without_query_lists_and_respects_limit(self):
        out = self.call(self.tools.kskill_search, {"limit": 4})
        self.assertEqual(len(out["results"]), 4)
        self.assertGreater(out["total_skills"], 100)

    def test_search_clamps_bad_limit(self):
        out = self.call(self.tools.kskill_search, {"query": "a", "limit": "abc"})
        self.assertTrue(out["ok"])
        out = self.call(self.tools.kskill_search, {"limit": 100000})
        self.assertLessEqual(len(out["results"]), 50)

    # --- kskill_instructions -------------------------------------------
    def test_instructions_returns_real_cli_output(self):
        out = self.call(self.tools.kskill_instructions, {"skill": "korean-character-count"})
        self.assertTrue(out["ok"], out)
        self.assertIn("korean-character-count — assembled instructions", out["instructions"])
        self.assertIn("Runtime mode:", out["instructions"])

    def test_instructions_unknown_skill_suggests_names(self):
        out = self.call(self.tools.kskill_instructions, {"skill": "cheap-gas-nearbi"})
        self.assertFalse(out["ok"])
        self.assertIn("cheap-gas-nearby", out["suggestions"])

    def test_instructions_rejects_malicious_skill_name_without_spawning(self):
        os.environ["KSKILL_CLI"] = "/nonexistent/should-not-run"
        for bad in ["../etc", "a b", "x;rm -rf /", "", None, 5, "-h"]:
            out = self.call(self.tools.kskill_instructions, {"skill": bad})
            self.assertFalse(out["ok"], bad)
            self.assertIn("skill", out["error"].lower())

    # --- kskill_exec ---------------------------------------------------
    def test_exec_runs_bundled_script_and_returns_stdout(self):
        out = self.call(self.tools.kskill_exec, {
            "skill": "korean-character-count",
            "script": "scripts/korean_character_count.js",
            "args": ["--text", "안녕하세요", "--format", "json"],
        })
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["exit_code"], 0)
        payload = json.loads(out["stdout"])  # script was asked for --format json
        self.assertIsInstance(payload, dict)
        self.assertIn("5", json.dumps(payload))  # 5 graphemes in 안녕하세요

    def test_exec_args_are_passed_verbatim_not_through_a_shell(self):
        out = self.call(self.tools.kskill_exec, {
            "skill": "korean-character-count",
            "script": "scripts/korean_character_count.js",
            "args": ["--text", "$(echo pwned); `id` && x", "--format", "text"],
        })
        self.assertTrue(out["ok"], out)
        self.assertNotIn("uid=", out["stdout"])
        # the literal 24-char string was counted => no shell expansion happened
        self.assertIn("characters: 24\n", out["stdout"])

    def test_exec_rejects_path_escape_and_non_scripts_root(self):
        for bad in ["../package.json", "/etc/passwd", "scripts/../skill.json",
                    "references/x.md", "scripts\\x.js", "", "scripts/"]:
            out = self.call(self.tools.kskill_exec, {
                "skill": "korean-character-count", "script": bad, "args": []})
            self.assertFalse(out["ok"], bad)
            self.assertIn("script", out["error"].lower())

    def test_exec_rejects_non_list_args(self):
        out = self.call(self.tools.kskill_exec, {
            "skill": "korean-character-count",
            "script": "scripts/korean_character_count.js", "args": "--text hi"})
        self.assertFalse(out["ok"])
        self.assertIn("args", out["error"])

    def test_exec_reports_nonzero_exit_with_stderr(self):
        out = self.call(self.tools.kskill_exec, {
            "skill": "korean-character-count",
            "script": "scripts/nope.js", "args": []})
        self.assertFalse(out["ok"])
        self.assertEqual(out["exit_code"], 1)
        self.assertIn("not bundled", out["stderr"])

    def test_exec_timeout_is_capped(self):
        self.assertEqual(self.tools.clamp_timeout(None), self.tools.DEFAULT_TIMEOUT_S)
        self.assertEqual(self.tools.clamp_timeout(10**6), self.tools.MAX_TIMEOUT_S)
        self.assertEqual(self.tools.clamp_timeout(-5), 1)
        self.assertEqual(self.tools.clamp_timeout("junk"), self.tools.DEFAULT_TIMEOUT_S)

    # --- kskill_read ---------------------------------------------------
    def test_read_returns_reference_text(self):
        # pick any skill that really ships a references/ file
        from helpers import REPO_ROOT
        found = next(REPO_ROOT.glob("*/references/*.md"), None)
        self.assertIsNotNone(found, "repo has no references asset to exercise")
        skill = found.parent.parent.name
        out = self.call(self.tools.kskill_read, {"skill": skill, "file": f"references/{found.name}"})
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["content"], found.read_text(encoding="utf-8"))

    def test_read_rejects_escape(self):
        out = self.call(self.tools.kskill_read, {"skill": "cheap-gas-nearby", "file": "../skill.json"})
        self.assertFalse(out["ok"])

    # --- never raises --------------------------------------------------
    def test_handlers_never_raise_on_garbage_input(self):
        for fn in (self.tools.kskill_search, self.tools.kskill_instructions,
                   self.tools.kskill_exec, self.tools.kskill_read):
            for garbage in (None, [], "str", 3, {"skill": {"a": 1}}):
                raw = fn(garbage)
                json.loads(raw)


if __name__ == "__main__":
    unittest.main()
