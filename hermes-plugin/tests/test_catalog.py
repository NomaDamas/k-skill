import os
import subprocess
import unittest

from helpers import REPO_ROOT, real_cli_command, repo_cli_env, submodule


class CatalogTest(unittest.TestCase):
    def setUp(self):
        self.mod = submodule("catalog")
        self.entries = self.mod.load_catalog()

    def test_entries_have_required_fields(self):
        self.assertGreaterEqual(len(self.entries), 120)
        for e in self.entries:
            self.assertRegex(e["name"], r"^[a-z0-9][a-z0-9-]*$")
            self.assertTrue(e["description"].strip(), e["name"])
            self.assertIsInstance(e["profiles"], list)

    def test_catalog_names_equal_cli_bundled_skills(self):
        """Catalog must neither miss nor invent skills relative to the real CLI."""
        env = repo_cli_env()
        cmd = real_cli_command() + " list"
        out = subprocess.run(cmd, shell=True, env=env, capture_output=True, text=True, check=True)
        self.assertEqual(sorted(out.stdout.split()), sorted(e["name"] for e in self.entries))

    def test_catalog_is_fresh_against_skill_json_sources(self):
        proc = subprocess.run(
            ["node", str(REPO_ROOT / "scripts" / "generate-hermes-catalog.js"), "--check"],
            capture_output=True, text=True, env=repo_cli_env(),
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_korean_query_finds_gas_station_skill(self):
        names = [e["name"] for e in self.mod.search("주유소", limit=5)]
        self.assertIn("cheap-gas-nearby", names[:3])

    def test_exact_name_ranks_first(self):
        self.assertEqual(self.mod.search("fine-dust-location")[0]["name"], "fine-dust-location")

    def test_multi_token_query_requires_every_token(self):
        hits = self.mod.search("주유소 zzzz-no-such-token")
        self.assertEqual(hits, [])

    def test_limit_and_empty_query_lists_alphabetically(self):
        hits = self.mod.search("", limit=3)
        self.assertEqual(len(hits), 3)
        self.assertEqual([h["name"] for h in hits], sorted(h["name"] for h in hits))

    def test_category_filter_narrows_results(self):
        cats = {e["category"] for e in self.entries if e.get("category")}
        cat = sorted(cats)[0]
        hits = self.mod.search("", category=cat, limit=500)
        self.assertTrue(hits)
        self.assertTrue(all(h["category"] == cat for h in hits))

    def test_suggest_returns_close_names(self):
        self.assertIn("cheap-gas-nearby", self.mod.suggest("cheap-gas-nearbi"))
        self.assertEqual(self.mod.suggest("qqqqqqqqqqqq"), [])


if __name__ == "__main__":
    unittest.main()
