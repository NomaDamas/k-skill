import json
import tempfile
import unittest
from pathlib import Path

from k_skill_cleaner import (
    AGENT_USAGE_SOURCES,
    collect_skill_usage,
    find_skill_dirs,
    rank_cleanup_candidates,
)


class KSkillCleanerTest(unittest.TestCase):
    def test_finds_root_skill_dirs_only_by_skill_md(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "keep-me").mkdir()
            (root / "keep-me" / "SKILL.md").write_text("---\nname: keep-me\n", encoding="utf-8")
            (root / "docs").mkdir()
            (root / "docs" / "SKILL.md").write_text("not a root skill", encoding="utf-8")
            (root / "no-skill").mkdir()

            self.assertEqual(find_skill_dirs(root), ["keep-me"])

    def test_collects_counts_from_jsonl_and_plain_agent_logs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "codex.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps({"event": "skill_triggered", "skill": "kbo-results"}),
                        json.dumps({"message": "Using $kbo-results for sports lookup"}),
                        "Claude loaded skill: korean-law-search",
                        json.dumps({"tool": {"name": "korean-law-search"}}),
                    ]
                ),
                encoding="utf-8",
            )

            counts = collect_skill_usage([root / "codex.jsonl"], ["kbo-results", "korean-law-search", "unused"])

            self.assertEqual(counts["kbo-results"], 2)
            self.assertEqual(counts["korean-law-search"], 2)
            self.assertEqual(counts["unused"], 0)

    def test_ranks_deletion_candidates_with_interview_and_usage_reasons(self):
        candidates = rank_cleanup_candidates(
            skill_names=["unused", "rare", "protected", "active"],
            usage_counts={"unused": 0, "rare": 1, "protected": 0, "active": 12},
            never_use={"unused"},
            keep={"protected"},
            low_usage_threshold=1,
        )

        self.assertEqual([candidate["skill"] for candidate in candidates], ["unused", "rare"])
        self.assertEqual(candidates[0]["action"], "remove")
        self.assertIn("interview_never_use", candidates[0]["reasons"])
        self.assertEqual(candidates[1]["action"], "review")
        self.assertIn("low_usage", candidates[1]["reasons"])

    def test_documents_agent_specific_usage_sources(self):
        agents = {source["agent"] for source in AGENT_USAGE_SOURCES}
        expected_agents = {"Claude Code", "Codex", "OpenCode", "OpenClaw/ClawHub", "Hermes Agent"}

        self.assertTrue(expected_agents.issubset(agents))
        for source in AGENT_USAGE_SOURCES:
            self.assertTrue(source["paths"] or source["fallback"])
            self.assertIn("confidence", source)


if __name__ == "__main__":
    unittest.main()
