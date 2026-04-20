import importlib.util
import json
import os
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

    def test_sets_local_mcp_endpoint_for_upstream_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_dir = pathlib.Path(tmp) / "coupang_partners"
            bin_dir = repo_dir / "bin"
            bin_dir.mkdir(parents=True)
            upstream = bin_dir / "coupang_mcp.py"
            upstream.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "print(json.dumps({'endpoint': os.environ.get('COUPANG_MCP_ENDPOINT')}))\n",
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
            self.assertEqual(payload["endpoint"], "local://coupang-mcp")

    def test_preserves_explicit_mcp_endpoint_override_for_compatibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_dir = pathlib.Path(tmp) / "coupang_partners"
            bin_dir = repo_dir / "bin"
            bin_dir.mkdir(parents=True)
            upstream = bin_dir / "coupang_mcp.py"
            upstream.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "print(json.dumps({'endpoint': os.environ.get('COUPANG_MCP_ENDPOINT')}))\n",
                encoding="utf-8",
            )
            upstream.chmod(0o755)
            env = {
                **os.environ,
                "COUPANG_MCP_ENDPOINT": "local://custom-coupang-mcp",
            }

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
                env=env,
            )

            payload = json.loads(completed.stdout)
            self.assertEqual(payload["endpoint"], "local://custom-coupang-mcp")

    def test_propagates_upstream_nonzero_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_dir = pathlib.Path(tmp) / "coupang_partners"
            bin_dir = repo_dir / "bin"
            bin_dir.mkdir(parents=True)
            upstream = bin_dir / "coupang_mcp.py"
            upstream.write_text(
                "#!/usr/bin/env python3\n"
                "import sys\n"
                "print('upstream failed', file=sys.stderr)\n"
                "raise SystemExit(7)\n",
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
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            self.assertEqual(completed.returncode, 7)
            self.assertIn("upstream failed", completed.stderr)

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

    def test_missing_command_guidance_includes_contract_init_command(self):
        completed = subprocess.run(
            [
                sys.executable,
                str(WRAPPER_PATH),
            ],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        self.assertEqual(completed.returncode, 2)
        self.assertIn("tools", completed.stderr)
        self.assertIn("init", completed.stderr)
        self.assertIn("search <keyword>", completed.stderr)

    def test_forwards_openclaw_shopping_env_vars_to_upstream(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_dir = pathlib.Path(tmp) / "coupang_partners"
            bin_dir = repo_dir / "bin"
            bin_dir.mkdir(parents=True)
            upstream = bin_dir / "coupang_mcp.py"
            upstream.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "keys = [\n"
                "    'OPENCLAW_SHOPPING_CLIENT_ID',\n"
                "    'OPENCLAW_SHOPPING_FORCE_HOSTED',\n"
                "    'OPENCLAW_SHOPPING_BASE_URL',\n"
                "]\n"
                "print(json.dumps({k: os.environ.get(k) for k in keys}))\n",
                encoding="utf-8",
            )
            upstream.chmod(0o755)
            env = {
                **os.environ,
                "OPENCLAW_SHOPPING_CLIENT_ID": "openclaw-skill",
                "OPENCLAW_SHOPPING_FORCE_HOSTED": "1",
                "OPENCLAW_SHOPPING_BASE_URL": "https://staging.example.com",
            }

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
                env=env,
            )

            payload = json.loads(completed.stdout)
            self.assertEqual(payload["OPENCLAW_SHOPPING_CLIENT_ID"], "openclaw-skill")
            self.assertEqual(payload["OPENCLAW_SHOPPING_FORCE_HOSTED"], "1")
            self.assertEqual(payload["OPENCLAW_SHOPPING_BASE_URL"], "https://staging.example.com")

    def test_help_epilog_documents_credentialless_hosted_fallback(self):
        completed = subprocess.run(
            [sys.executable, str(WRAPPER_PATH), "--help"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )

        help_text = completed.stdout
        self.assertIn("COUPANG_ACCESS_KEY", help_text)
        self.assertIn("OPENCLAW_SHOPPING", help_text)
        self.assertRegex(help_text, r"(hosted|호스티드|a\.retn\.kr)")

    def test_help_epilog_drops_non_allowlisted_coupang_mcp_fallback_recommendation(self):
        # Direct probes against https://a.retn.kr/v1/public/assist on 2026-04-21
        # confirmed that `X-OpenClaw-Client-Id: coupang-mcp-fallback` returns
        # HTTP 403 ("Client is not allowlisted"), while the upstream default
        # `openclaw-skill` returns HTTP 200. The wrapper's --help must not
        # recommend the dead value and must surface openclaw-skill so users
        # understand the allowlisted hosted-fallback client id in play.
        completed = subprocess.run(
            [sys.executable, str(WRAPPER_PATH), "--help"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )

        help_text = completed.stdout
        self.assertNotIn("coupang-mcp-fallback", help_text)
        self.assertIn("openclaw-skill", help_text)


@unittest.skipUnless(
    os.getenv("K_SKILL_COUPANG_SMOKE") == "1",
    "set K_SKILL_COUPANG_SMOKE=1 to run the live upstream smoke test",
)
class CoupangPartnersMcpHostedFallbackSmokeTests(unittest.TestCase):
    """Live upstream smoke test.

    Opt-in via `K_SKILL_COUPANG_SMOKE=1` because this hits the real
    `retention-corp/coupang_partners` checkout and the hosted backend at
    `https://a.retn.kr`, both of which are outside CI's control. Verifies that
    the credentialless hosted fallback path returns at least one result that
    includes a Retention Corp short deeplink so the wrapper contract stays wired.
    """

    def test_credentialless_search_returns_hosted_shortlink(self):
        repo_dir = os.getenv(
            "COUPANG_PARTNERS_REPO_DIR",
            str(pathlib.Path.home() / ".cache/k-skill/coupang_partners"),
        )
        env = {
            k: v
            for k, v in os.environ.items()
            if k not in {"COUPANG_ACCESS_KEY", "COUPANG_SECRET_KEY"}
        }

        completed = subprocess.run(
            [
                sys.executable,
                str(WRAPPER_PATH),
                "--repo-dir",
                repo_dir,
                "search",
                "무선청소기",
            ],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=60,
        )

        self.assertEqual(
            completed.returncode,
            0,
            msg=f"wrapper failed: stderr={completed.stderr}",
        )

        payload = json.loads(completed.stdout)
        self.assertTrue(payload.get("ok"), msg=f"envelope not ok: {payload}")
        # Accept either the hosted shortlink shape or a direct coupang affiliate
        # link, since hosted fallback and local HMAC path surface slightly
        # different URL shapes. At least one of them should be present.
        serialized = json.dumps(payload, ensure_ascii=False)
        self.assertRegex(
            serialized,
            r"(a\.retn\.kr/s/|link\.coupang\.com/)",
            msg="expected at least one Coupang deeplink in response",
        )


if __name__ == "__main__":
    unittest.main()
