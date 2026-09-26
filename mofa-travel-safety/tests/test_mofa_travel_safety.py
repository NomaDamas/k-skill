#!/usr/bin/env python3
"""Network-free tests for the MOFA travel-alert proxy helper.

The helper talks to k-skill-proxy over HTTP, so these tests never touch the
network. They load the helper by path, replace ``urllib.request.urlopen`` with a
fake response (or a raise), and assert on query normalization, output rendering
and the explicit failure modes documented in ``instruction.md``.
"""
from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

TESTS_DIR = Path(__file__).resolve().parent
SKILL_DIR = TESTS_DIR.parent
HELPER_PATH = SKILL_DIR / "scripts" / "run_mofa_travel_safety.py"
FIXTURES_DIR = TESTS_DIR / "fixtures"

DEFAULT_PROXY = "https://k-skill-proxy.nomadamas.org"


def load_helper():
    spec = importlib.util.spec_from_file_location("run_mofa_travel_safety", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["run_mofa_travel_safety"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()


def load_fixture(name):
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


class FakeResponse:
    """Minimal stand-in for the object returned by ``urlopen``."""

    def __init__(self, body: bytes):
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def http_error(*_args, **_kwargs):
    raise urllib.error.HTTPError(
        "https://apis.data.go.kr/1262000/TravelAlarmService0404/getTravelAlarm0404List",
        502,
        "Bad Gateway",
        {},
        None,
    )


class MainHarness(unittest.TestCase):
    def run_main(self, argv, *, response=None, side_effect=None):
        if side_effect is not None:
            patcher = mock.patch.object(helper.urllib.request, "urlopen", side_effect=side_effect)
        else:
            patcher = mock.patch.object(helper.urllib.request, "urlopen", return_value=response)
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patcher:
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = helper.main(argv)
        return code, stdout.getvalue(), stderr.getvalue()

    def run_dry(self, argv):
        return self.run_main(["--dry-run", *argv])


class DryRunQueryTest(MainHarness):
    """--dry-run exposes the normalized proxy query without any network call."""

    def test_defaults_page_and_per_page(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("KSKILL_PROXY_BASE_URL", None)
            code, out, err = self.run_dry([])
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        payload = json.loads(out)
        self.assertEqual(payload["query"], {"page": 1, "perPage": 10})
        self.assertTrue(payload["url"].startswith(DEFAULT_PROXY + "/v1/mofa-travel-safety/travel-alerts?"))

    def test_country_iso_is_uppercased(self):
        code, out, _ = self.run_dry(["--country-iso", "ru"])
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["query"]["country_iso_alp2"], "RU")
        self.assertIn("country_iso_alp2=RU", payload["url"])

    def test_country_name_is_url_encoded(self):
        code, out, _ = self.run_dry(["--country-name", "러시아"])
        self.assertEqual(code, 0)
        url = json.loads(out)["url"]
        self.assertIn("country_nm=%EB%9F%AC%EC%8B%9C%EC%95%84", url)

    def test_explicit_page_and_per_page(self):
        code, out, _ = self.run_dry(["--country-iso", "RU", "--page", "3", "--per-page", "50"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["query"], {"page": 3, "perPage": 50, "country_iso_alp2": "RU"})

    def test_proxy_base_url_override_strips_trailing_slash(self):
        code, out, _ = self.run_dry(["--proxy-base-url", "https://example.test/"])
        self.assertEqual(code, 0)
        url = json.loads(out)["url"]
        self.assertTrue(url.startswith("https://example.test/v1/mofa-travel-safety/travel-alerts?"))

    def test_proxy_base_url_env_default(self):
        with mock.patch.dict(os.environ, {"KSKILL_PROXY_BASE_URL": "https://env-proxy.test"}):
            code, out, _ = self.run_dry([])
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(out)["url"].startswith("https://env-proxy.test/"))


class ValidationFailureTest(MainHarness):
    """Bad input must fail fast with exit code 2 and never call the network."""

    def assertRejected(self, argv, needle):
        def explode(*_args, **_kwargs):
            raise AssertionError("urlopen must not be called for invalid input")

        code, out, err = self.run_main(argv, side_effect=explode)
        self.assertEqual(code, 2)
        self.assertEqual(out, "")
        self.assertIn(needle, err)

    def test_country_iso_and_name_are_mutually_exclusive(self):
        self.assertRejected(["--country-iso", "RU", "--country-name", "러시아"], "use either")

    def test_country_iso_must_be_two_letters(self):
        self.assertRejected(["--country-iso", "RUS"], "two letters")

    def test_country_iso_must_be_alphabetic(self):
        self.assertRejected(["--country-iso", "R1"], "two letters")

    def test_page_must_be_positive(self):
        self.assertRejected(["--page", "0"], "invalid page")

    def test_per_page_upper_bound(self):
        self.assertRejected(["--per-page", "101"], "invalid page")

    def test_per_page_must_be_positive(self):
        self.assertRejected(["--per-page", "0"], "invalid page")


class OutputTest(MainHarness):
    def test_json_output_round_trips_proxy_payload(self):
        body = json.dumps(load_fixture("russia_alert.json"), ensure_ascii=False).encode("utf-8")
        code, out, err = self.run_main(["--country-iso", "RU"], response=FakeResponse(body))
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        payload = json.loads(out)
        self.assertEqual(payload["source"], "mofa_travel_alarm_0404")
        self.assertEqual(payload["total_count"], 2)
        self.assertEqual(len(payload["items"]), 2)
        self.assertEqual(payload["items"][0]["country_nm"], "러시아")
        self.assertEqual(payload["items"][0]["alarm_lvl"], 4)

    def test_text_output_renders_each_item(self):
        body = json.dumps(load_fixture("russia_alert.json"), ensure_ascii=False).encode("utf-8")
        code, out, err = self.run_main(["--country-name", "러시아", "--text"], response=FakeResponse(body))
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        lines = out.strip().splitlines()
        self.assertEqual(
            lines,
            [
                "러시아 (RU): level=4 region=일부",
                "러시아 (RU): level=2 region=그 외",
            ],
        )

    def test_empty_items_text_prints_nothing(self):
        body = json.dumps(load_fixture("empty_result.json"), ensure_ascii=False).encode("utf-8")
        code, out, err = self.run_main(["--country-name", "존재하지않는국가", "--text"], response=FakeResponse(body))
        self.assertEqual(code, 0)
        self.assertEqual(out, "")
        self.assertEqual(err, "")

    def test_empty_items_json_is_still_valid(self):
        body = json.dumps(load_fixture("empty_result.json"), ensure_ascii=False).encode("utf-8")
        code, out, _ = self.run_main(["--country-name", "존재하지않는국가"], response=FakeResponse(body))
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["total_count"], 0)

    def test_missing_item_fields_render_as_none(self):
        body = json.dumps({"items": [{"country_nm": "러시아"}]}, ensure_ascii=False).encode("utf-8")
        code, out, _ = self.run_main(["--country-iso", "RU", "--text"], response=FakeResponse(body))
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), "러시아 (None): level=None region=None")


class UpstreamFailureTest(MainHarness):
    """Every network/parse failure collapses to exit code 3 with a stderr line."""

    def assertUpstreamFailure(self, **kwargs):
        code, out, err = self.run_main(["--country-iso", "RU"], **kwargs)
        self.assertEqual(code, 3)
        self.assertEqual(out, "")
        self.assertIn("MOFA request failed", err)

    def test_http_error_is_reported(self):
        self.assertUpstreamFailure(side_effect=http_error)

    def test_invalid_json_body_is_reported(self):
        self.assertUpstreamFailure(response=FakeResponse(b"<html>not json</html>"))

    def test_connection_error_is_reported(self):
        def timeout(*_args, **_kwargs):
            raise OSError("connection timed out")

        self.assertUpstreamFailure(side_effect=timeout)


if __name__ == "__main__":
    unittest.main()
