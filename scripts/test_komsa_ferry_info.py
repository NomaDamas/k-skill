import importlib.util
import unittest
from pathlib import Path


path = Path(__file__).resolve().parents[1] / "komsa-ferry-info" / "scripts" / "komsa_ferry_info.py"
spec = importlib.util.spec_from_file_location("komsa_ferry_info", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KomsaFerryInfoTest(unittest.TestCase):
    def test_query_uses_proxy_route_and_preserves_filters(self):
        captured = {}

        def fake_read_json(request):
            captured["url"] = request.full_url
            captured["agent"] = request.headers["User-agent"]
            return {"items": [{"psnshp_nm": "섬사랑12호"}]}

        payload = module.query(
            "schedules",
            {"date": "20260824", "vessel": "섬사랑12호", "limit": "5"},
            base_url="https://proxy.example.com/",
            read_json=fake_read_json,
        )
        self.assertEqual(payload["items"][0]["psnshp_nm"], "섬사랑12호")
        self.assertIn("/v1/komsa/ferry/schedules?", captured["url"])
        self.assertIn("date=20260824", captured["url"])
        self.assertIn("vessel=%EC%84%AC%EC%82%AC%EB%9E%9112%ED%98%B8", captured["url"])
        self.assertIn("k-skill-komsa-ferry-info", captured["agent"])

    def test_proxy_base_defaults_and_rejects_disabled(self):
        self.assertEqual(module.proxy_base_url(None, {}), "https://k-skill-proxy.nomadamas.org")
        with self.assertRaises(ValueError):
            module.proxy_base_url(None, {"KSKILL_PROXY_BASE_URL": "off"})


if __name__ == "__main__":
    unittest.main()
