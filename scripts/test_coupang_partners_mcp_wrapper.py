import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WRAPPER_PATH = REPO_ROOT / "coupang-product-search" / "scripts" / "coupang_partners_mcp.py"


def load_wrapper_module():
    spec = importlib.util.spec_from_file_location("coupang_partners_mcp", WRAPPER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class CoupangPartnersMcpWrapperTests(unittest.TestCase):
    def test_defaults_to_retention_corp_repo_and_local_mcp_contract(self):
        wrapper = load_wrapper_module()

        self.assertEqual(wrapper.UPSTREAM_REPO_URL, "https://github.com/retention-corp/coupang_partners.git")
        self.assertEqual(wrapper.DEFAULT_MCP_ENDPOINT, "local://coupang-mcp")

    def test_passes_arguments_to_upstream_bin_without_network_when_repo_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_dir = pathlib.Path(tmp) / "coupang_partners"
            bin_dir = repo_dir / "bin"
            bin_dir.mkdir(parents=True)
            upstream = bin_dir / "coupang_mcp.py"
            upstream.write_text(
                "#!/usr/bin/env python3\n"
                "import json, sys\n"
                "print(json.dumps({'argv': sys.argv[1:]}))\n",
                encoding="utf-8",
            )
            upstream.chmod(0o755)

            completed = subprocess.run(
                [
                    sys.executable,
                    str(WRAPPER_PATH),
                    "--repo-dir",
                    str(repo_dir),
                    "--no-clone",
                    "tools",
                ],
                check=True,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            payload = json.loads(completed.stdout)
            self.assertEqual(payload["argv"], ["tools"])
            self.assertEqual(completed.stderr, "")

    def test_no_clone_reports_actionable_error_for_missing_upstream_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_dir = pathlib.Path(tmp) / "missing"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(WRAPPER_PATH),
                    "--repo-dir",
                    str(repo_dir),
                    "--no-clone",
                    "tools",
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("retention-corp/coupang_partners", completed.stderr)
            self.assertIn("git clone", completed.stderr)


if __name__ == "__main__":
    unittest.main()
