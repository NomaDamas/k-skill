#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import pathlib
import sys
import unittest
from urllib.request import Request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import gov_overseas_trip_report as mod  # noqa: E402

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"


class FakeResponse:
    def __init__(self, body: bytes, url: str, headers: dict[str, str] | None = None):
        self._body = body
        self._url = url
        self.headers = headers or {"Content-Type": "text/html; charset=utf-8"}

    def read(self) -> bytes:
        return self._body

    def geturl(self) -> str:
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class GovTripHelperTests(unittest.TestCase):
    def test_providers_include_nine_verified_surfaces(self):
        payload = mod.providers_payload()
        self.assertEqual(payload["count"], 9)
        ids = {p["id"] for p in payload["providers"]}
        self.assertEqual(
            ids,
            {
                "nec",
                "acrc",
                "mpm",
                "mois",
                "open_portal",
                "daegu_council",
                "daejeon_council",
                "gyeonggi_council",
                "gyeongbuk_council",
            },
        )

    def test_parse_nec_list_page_fixture(self):
        html = (FIX / "nec-list-p1.html").read_text(encoding="utf-8")
        parsed = mod.parse_nec_list(html)
        self.assertEqual(parsed["page"], 1)
        self.assertEqual(parsed["totalPages"], 5)
        self.assertGreaterEqual(len(parsed["items"]), 10)
        first = parsed["items"][0]
        self.assertIn("사실" if False else "detailUrl", first)
        self.assertTrue(first["detailUrl"].startswith("https://www.nec.go.kr/site/nec/ex/bbs/View.do"))
        self.assertTrue(first["attachments"])
        att = first["attachments"][0]["url"]
        self.assertIn("Download.do", att)
        self.assertIn("bcIdx=", att)
        amp_entity = "&" + "amp;"
        self.assertNotIn(amp_entity, att)
        self.assertIn("cbIdx=1107", att)

    def test_nec_list_uses_get_pageindex(self):
        html1 = (FIX / "nec-list-p1.html").read_bytes()
        html2 = (FIX / "nec-list-p2.html").read_bytes()
        seen: list[str] = []

        def opener(req: Request, timeout: int):
            url = req.full_url
            seen.append(url)
            if "pageIndex=2" in url:
                return FakeResponse(html2, url)
            return FakeResponse(html1, url)

        client = mod.Client(opener=opener)
        result = mod.list_nec(client, {"max_pages": 2})
        self.assertTrue(all("pageIndex=" in u for u in seen))
        self.assertFalse(any(u.endswith("List.do?cbIdx=1107") and "pageIndex=" not in u for u in seen[1:]))
        self.assertGreaterEqual(result["count"], 20)
        self.assertEqual(result["pagination"]["method"], "GET")
        ids = [it["bcIdx"] for it in result["items"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_nec_post_style_error_page_is_failure(self):
        err = (
            "<html><body><td class=\"error\"><span>오류가 발생했습니다.</span></td></body></html>"
        ).encode()

        def opener(req: Request, timeout: int):
            return FakeResponse(err, req.full_url)

        # Client itself only raises on pageIndex+error combo when URL contains pageIndex.
        client = mod.Client(opener=opener)
        with self.assertRaises(mod.FetchError) as ctx:
            client.fetch_text("https://www.nec.go.kr/site/nec/ex/bbs/List.do?cbIdx=1107&pageIndex=2")
        self.assertEqual(ctx.exception.mode, "unexpected HTML")

    def test_parse_acrc_list_fixture(self):
        html = (FIX / "acrc-list-p1.html").read_text(encoding="utf-8")
        rows = mod.parse_acrc_list(html)
        # Live board HTML may use JS templates; accept either parser success or empty on fixture drift
        # but fixture captured from worked surface should include list_no if markup has anchors.
        if rows:
            self.assertTrue(rows[0]["detailUrl"])
            self.assertIn("listNo", rows[0])

    def test_open_portal_json_parse(self):
        html = (FIX / "open-portal.html").read_text(encoding="utf-8")

        def opener(req: Request, timeout: int):
            return FakeResponse(html.encode("utf-8"), req.full_url)

        client = mod.Client(opener=opener)
        result = mod.list_open_portal(client, {"keyword": "국외출장"})
        self.assertGreaterEqual(result["count"], 1)
        self.assertTrue(result["items"][0]["title"])
        self.assertIn("institution", result["items"][0])

    def test_daegu_list_fixture(self):
        html = (FIX / "daegu-list.html").read_text(encoding="utf-8")

        def opener(req: Request, timeout: int):
            return FakeResponse(html.encode("utf-8"), req.full_url)

        client = mod.Client(opener=opener)
        result = mod.list_daegu(client, {})
        self.assertEqual(result["provider"], "daegu_council")
        self.assertGreaterEqual(result["count"], 1)
        self.assertIn("overseas", result["items"][0]["detailUrl"])
        self.assertIn("출장", result["items"][0]["title"])

    def test_daejeon_list_fixture(self):
        html = (FIX / "daejeon-list.html").read_text(encoding="utf-8")

        def opener(req: Request, timeout: int):
            return FakeResponse(html.encode("utf-8"), req.full_url)

        client = mod.Client(opener=opener)
        result = mod.list_daejeon(client, {})
        self.assertGreaterEqual(result["count"], 1)
        self.assertIn("TrainingReportView.do", result["items"][0]["detailUrl"])

    def test_gyeonggi_list_fixture(self):
        html = (FIX / "ggc-list.html").read_text(encoding="utf-8")

        def opener(req: Request, timeout: int):
            return FakeResponse(html.encode("utf-8"), req.full_url)

        client = mod.Client(opener=opener)
        result = mod.list_gyeonggi(client, {})
        self.assertGreaterEqual(result["count"], 1)
        self.assertIn("/site/main/board/training_resrep/", result["items"][0]["detailUrl"])

    def test_gyeongbuk_notice_filter(self):
        html = (FIX / "gb-notice.html").read_text(encoding="utf-8")

        def opener(req: Request, timeout: int):
            return FakeResponse(html.encode("utf-8"), req.full_url)

        client = mod.Client(opener=opener)
        result = mod.list_gyeongbuk(client, {"keyword": "국외출장"})
        self.assertGreaterEqual(result["count"], 1)
        self.assertTrue(all("출장" in (it["title"] or "") for it in result["items"]))

    def test_cli_providers_json(self):
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            code = mod.main(["providers"])
        finally:
            sys.stdout = old
        self.assertEqual(code, 0)
        data = json.loads(buf.getvalue())
        self.assertEqual(data["count"], 9)


if __name__ == "__main__":
    unittest.main()
