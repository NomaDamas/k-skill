import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).parents[1] / "kamis-food-price" / "scripts" / "run_kamis.py"
SPEC = importlib.util.spec_from_file_location("run_kamis", SCRIPT)
assert SPEC is not None
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class RunKamisTests(unittest.TestCase):
    def test_direct_dry_run_redacts_secret_from_url_and_query(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = "live-kamis-secret"
            secrets_path = Path(directory) / "secrets.env"
            secrets_path.write_text(f"KSKILL_KAMIS_API_KEY={secret}\n", encoding="utf-8")
            stdout = io.StringIO()

            with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(stdout):
                exit_code = MODULE.main([
                    "--direct",
                    "--dry-run",
                    "--secrets-path",
                    str(secrets_path),
                ])

            self.assertEqual(exit_code, 0)
            output = stdout.getvalue()
            self.assertNotIn(secret, output)
            payload = json.loads(output)
            self.assertEqual(payload["url"].count("<redacted>"), 1)
            self.assertEqual(payload["query"]["p_cert_key"], "<redacted>")


if __name__ == "__main__":
    unittest.main()
