"""K-SKILL CI entry point for the offline Node evidence tests."""

import pathlib
import subprocess
import unittest


ROOT = pathlib.Path(__file__).resolve().parent.parent


class EvidenceTests(unittest.TestCase):
    def test_offline_evidence_gate(self):
        result = subprocess.run(
            ["node", "--test", str(ROOT / "tests" / "evidence.test.js")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=60,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
