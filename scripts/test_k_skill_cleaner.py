import json
import shutil
import subprocess
import sys
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

    def test_collects_usage_with_since_window_and_mtime_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            recent_log = root / "recent.jsonl"
            recent_log.write_text(
                "\n".join(
                    [
                        json.dumps({"timestamp": "2026-04-20T12:00:00+09:00", "skill": "kbo-results"}),
                        json.dumps({"timestamp": "2026-01-10T12:00:00+09:00", "skill": "korean-law-search"}),
                        "loaded skill: fallback-skill",
                    ]
                ),
                encoding="utf-8",
            )
            old_log = root / "old.log"
            old_log.write_text("loaded skill: old-fallback", encoding="utf-8")

            # Lines without parseable timestamps use file mtime as the fallback signal.
            recent_mtime = 1_776_643_200  # 2026-04-24T00:00:00Z
            old_mtime = 1_766_275_200  # 2025-12-20T00:00:00Z
            recent_log.touch()
            old_log.touch()
            import os

            os.utime(recent_log, (recent_mtime, recent_mtime))
            os.utime(old_log, (old_mtime, old_mtime))

            counts = collect_skill_usage(
                [recent_log, old_log],
                ["kbo-results", "korean-law-search", "fallback-skill", "old-fallback"],
                since="2026-04-01T00:00:00+09:00",
            )

            self.assertEqual(counts["kbo-results"], 1)
            self.assertEqual(counts["korean-law-search"], 0)
            self.assertEqual(counts["fallback-skill"], 1)
            self.assertEqual(counts["old-fallback"], 0)

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

    def test_skill_local_helper_autodetects_parent_skills_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills_root = Path(tmp)
            cleaner_dir = skills_root / "k-skill-cleaner"
            cleaner_scripts = cleaner_dir / "scripts"
            cleaner_scripts.mkdir(parents=True)
            (cleaner_dir / "SKILL.md").write_text("---\nname: k-skill-cleaner\n", encoding="utf-8")
            shutil.copyfile(
                Path(__file__).resolve().parents[1] / "k-skill-cleaner" / "scripts" / "k_skill_cleaner.py",
                cleaner_scripts / "k_skill_cleaner.py",
            )

            for skill in ["kbo-results", "k-skill-setup"]:
                skill_dir = skills_root / skill
                skill_dir.mkdir()
                (skill_dir / "SKILL.md").write_text(f"---\nname: {skill}\n", encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/k_skill_cleaner.py",
                    "--skills-root",
                    ".",
                    "--never-use",
                    "kbo-results",
                    "--keep",
                    "k-skill-setup",
                ],
                cwd=cleaner_dir,
                check=True,
                text=True,
                capture_output=True,
            )
            report = json.loads(result.stdout)

            self.assertEqual(report["skill_count"], 3)
            self.assertEqual(report["candidates"][0]["skill"], "kbo-results")
            self.assertEqual(report["candidates"][0]["action"], "remove")


if __name__ == "__main__":
    unittest.main()
