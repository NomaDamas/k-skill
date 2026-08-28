import importlib.util, unittest
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "traffic-accident-risk-search/scripts/traffic_accident_risk_search.py"
s = importlib.util.spec_from_file_location("traffic", p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
class TrafficTest(unittest.TestCase):
    def test_query_uses_proxy_route(self):
        seen = {}
        def fake(req):
            seen["url"] = req.full_url
            return {"items": []}
        args = m.parser().parse_args(["hotspots","--category","child","--year","2024","--sido","11","--gugun","680"])
        self.assertEqual(m.query(args, fake), {"items":[]})
        self.assertIn("/v1/koroad/traffic-accident/hotspots?", seen["url"])
        self.assertIn("category=child", seen["url"])
if __name__ == "__main__": unittest.main()
