import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).parent.parent / "railway-timetable" / "scripts" / "railway_timetable.py"
sys.path.insert(0, str(SCRIPT_PATH.parent))
SPEC = importlib.util.spec_from_file_location("railway_timetable", SCRIPT_PATH)
assert SPEC and SPEC.loader
railway_timetable = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = railway_timetable
SPEC.loader.exec_module(railway_timetable)


class RailwayTimetableTests(unittest.TestCase):
    def test_parser_uses_korail_as_the_only_operator(self) -> None:
        parser = railway_timetable.build_parser()

        args = parser.parse_args(["source"])

        self.assertFalse(hasattr(args, "operator"))

    def test_source_uses_integrated_korail_metadata(self) -> None:
        result = railway_timetable.source_info()

        self.assertEqual(result["operator"], "한국철도공사")
        self.assertEqual(result["transport"], "Korail integrated timetable")

    def test_search_delegates_to_integrated_korail_backend(self) -> None:
        korail = {
            "count": 1,
            "trains": [{"train_no": "601", "dep_time": "05:08"}],
            "source": {"operator": "한국철도공사"},
            "booking_url": "https://www.korail.com/ticket/search",
        }

        with mock.patch.object(railway_timetable.ktx_backend, "search_public_timetable", return_value=korail) as search:
            result = railway_timetable.search(
                dep="수서",
                arr="광주송정",
                date="20260905",
                earliest="0000",
                latest="1200",
                limit=5,
            )

        search.assert_called_once()
        self.assertEqual(result["count"], 1)


if __name__ == "__main__":
    unittest.main()
