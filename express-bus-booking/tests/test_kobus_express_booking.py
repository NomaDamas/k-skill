"""Regression tests for the KOBUS timetable parser (issue #698).

The upstream KOBUS search response embeds an HTML-commented `fnSatsChc(...)`
prototype next to each real `onclick="fnSatsChc('...')"` call. Parsing the
comment template produced phantom schedules with an empty `raw_args`, which
doubled the reported count and later crashed the seat-hold stage with
`IndexError: list index out of range`.
"""

import importlib.util
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parent
HELPER_PATH = SCRIPT_DIR.parent / "scripts" / "kobus_express_booking.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("kobus_express_booking", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["kobus_express_booking"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()

REAL_ARGS = ("'010000'", "'0100'", "'021'", "'500'", "'1'", "'0'", "'0'", "'0'",
             "'0'", "'0'", "'Y'", "'N'", "'Y'", "'N'", "'0'", "'0'")
REAL_CALL = "onclick=\"fnSatsChc(" + ",".join(REAL_ARGS) + ")\""
SECOND_ARGS = ("'023000'", "'0230'", "'021'", "'500'", "'1'", "'0'", "'0'", "'0'",
               "'0'", "'0'", "'Y'", "'N'", "'Y'", "'N'", "'0'", "'0'")
SECOND_CALL = "onclick=\"fnSatsChc(" + ",".join(SECOND_ARGS) + ")\""

BODY = f"""<html><body>
<script type="text/javascript">
function fnSatsChc(deprTime,alcnDeprTime,alcnDeprTrmlNo,alcnArvlTrmlNo,indVBusClsCd,cacmCd,dcDvsCd,prvtBbizEmpAcmtRt,chldSftySatsYn,dsprSatsYn){{ return true; }}
</script>
<!-- fnSatsChc(deprTime,alcnDeprTime,alcnDeprTrmlNo,alcnArvlTrmlNo,indVBusClsCd,cacmCd) -->
<tr><td>(주)금호고속</td><td>우등</td><td><a href="#" {REAL_CALL}>01:00</a></td></tr>
<tr><td>동부고속</td><td>고속</td><td><a href="#" {SECOND_CALL}>02:30</a></td></tr>
</body></html>
"""

COMMENTED_REAL_CALL = ("<!-- <a href=\"#\" onclick=\"fnSatsChc('030000','0300','021','500',"
                       "'1','0','0','0','0','0','Y','N','Y','N','0','0')\">03:00</a> -->")

INCOMPLETE_BODY = """<html><body>
<a href="#" onclick="fnSatsChc('030000','0300','021')">03:00</a>
</body></html>
"""


def run_main(argv, *, schedules_body):
    buffer = io.StringIO()
    with mock.patch.object(sys, "argv", ["kobus_express_booking.py", *argv]):
        with mock.patch.object(helper, "opener", return_value=object()):
            with mock.patch.object(
                helper,
                "search",
                return_value=(schedules_body, helper.parse_schedules(schedules_body)),
            ):
                with redirect_stdout(buffer):
                    exit_code = helper.main()
    return exit_code, buffer.getvalue()


class ParseSchedulesTest(unittest.TestCase):
    def test_counts_only_real_quoted_calls(self):
        schedules = helper.parse_schedules(BODY)
        self.assertEqual(len(schedules), 2)

    def test_comment_template_is_not_parsed(self):
        schedules = helper.parse_schedules(BODY)
        self.assertTrue(all(schedule.raw_args for schedule in schedules))
        self.assertTrue(all(schedule.departure_time for schedule in schedules))

    def test_commented_real_looking_call_is_ignored(self):
        schedules = helper.parse_schedules(BODY + COMMENTED_REAL_CALL)
        self.assertEqual(len(schedules), 2)
        self.assertNotIn("03:00", [schedule.departure_time for schedule in schedules])

    def test_incomplete_argument_list_is_dropped(self):
        self.assertEqual(helper.parse_schedules(INCOMPLETE_BODY), [])

    def test_indices_are_contiguous_after_drops(self):
        schedules = helper.parse_schedules(BODY + INCOMPLETE_BODY)
        self.assertEqual([schedule.index for schedule in schedules], [1, 2])

    def test_departure_time_and_context_are_resolved(self):
        first, second = helper.parse_schedules(BODY)
        self.assertEqual(first.departure_time, "01:00")
        self.assertEqual(second.departure_time, "02:30")
        self.assertIn("금호", first.company)
        for schedule in (first, second):
            self.assertIn(schedule.bus_class, {"심야우등", "우등", "프리미엄", "고속"})

    def test_schedules_have_full_argument_payload(self):
        for schedule in helper.parse_schedules(BODY):
            self.assertGreaterEqual(len(schedule.raw_args), helper.MIN_SATS_ARGS)


class SelectIndexTest(unittest.TestCase):
    def test_no_schedules_hold_raises_system_exit(self):
        with self.assertRaises(SystemExit) as ctx:
            run_main(
                ["--depart-code", "021", "--arrive-code", "500", "--date", "20261010",
                 "--hold-first-seat", "--select-index", "1"],
                schedules_body="<html><body></body></html>",
            )
        self.assertIn("no KOBUS schedules", str(ctx.exception))

    def test_out_of_range_select_index_raises_system_exit(self):
        with self.assertRaises(SystemExit) as ctx:
            run_main(
                ["--depart-code", "021", "--arrive-code", "500", "--date", "20261010",
                 "--hold-first-seat", "--select-index", "3"],
                schedules_body=BODY,
            )
        message = str(ctx.exception)
        self.assertIn("out of range", message)
        self.assertIn("1-2", message)

    def test_zero_select_index_raises_system_exit(self):
        with self.assertRaises(SystemExit):
            run_main(
                ["--depart-code", "021", "--arrive-code", "500", "--date", "20261010",
                 "--hold-seat", "1", "--select-index", "0"],
                schedules_body=BODY,
            )

    def test_lookup_without_hold_does_not_validate_index(self):
        exit_code, output = run_main(
            ["--depart-code", "021", "--arrive-code", "500", "--date", "20261010"],
            schedules_body=BODY,
        )
        self.assertEqual(exit_code, 0)
        payload = json.loads(output)
        self.assertEqual(payload["count"], 2)


if __name__ == "__main__":
    unittest.main()
