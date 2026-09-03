import importlib.util
import json
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
    def test_parser_accepts_each_operator_and_both(self) -> None:
        parser = railway_timetable.build_parser()

        for operator in ("ktx", "srt", "both"):
            args = parser.parse_args([
                "--operator",
                operator,
                "source",
            ])
            self.assertEqual(args.operator, operator)

    def test_source_combines_operator_metadata_without_mutation(self) -> None:
        with (
            mock.patch.object(
                railway_timetable,
                "source_for_operator",
                side_effect=[
                    {"mode": "plan", "operator": "한국철도공사"},
                    {"mode": "live", "operator": "주식회사 에스알"},
                ],
            ),
        ):
            result = railway_timetable.source_info("both")

        self.assertEqual(result["operators"], ["ktx", "srt"])
        self.assertEqual(
            [item["operator"] for item in result["sources"]],
            ["한국철도공사", "주식회사 에스알"],
        )

    def test_both_search_returns_explicit_operator_on_each_train(self) -> None:
        ktx = {
            "count": 1,
            "trains": [{"train_no": "1", "dep_time": "06:00"}],
            "source": {"operator": "한국철도공사"},
            "booking_url": "https://www.korail.com/ticket/search",
        }
        srt = {
            "count": 1,
            "trains": [{"train_no": "303", "dep_time": "06:10"}],
            "source": {"operator": "주식회사 에스알"},
            "booking_url": "https://etk.srail.kr/",
        }

        with mock.patch.object(
            railway_timetable,
            "search_operator",
            side_effect=[ktx, srt],
        ):
            result = railway_timetable.search(
                operator="both",
                dep="서울",
                arr="부산",
                date="20260904",
                earliest="0600",
                latest="1200",
                limit=5,
            )

        self.assertEqual(result["count"], 2)
        self.assertEqual(
            [(train["operator"], train["train_no"]) for train in result["trains"]],
            [("ktx", "1"), ("srt", "303")],
        )
        self.assertEqual(json.loads(json.dumps(result))["count"], 2)


if __name__ == "__main__":
    unittest.main()
