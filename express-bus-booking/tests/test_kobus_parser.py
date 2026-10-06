#!/usr/bin/env python3
"""Regression test for https://github.com/NomaDamas/k-skill/issues/698.

KOBUS timetable responses keep spare row templates inside HTML comments as
`fnSatsChc(deprTime, ...)` calls with unquoted placeholders. The parser must
not surface them as schedules.
"""
import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import kobus_express_booking as kobus  # noqa: E402

REAL_ROW_1 = "fnSatsChc('20261010','0100','0100','021','500','3','07','0','Y','N','021','500','N','N','N','N')"
REAL_ROW_2 = "fnSatsChc('20261010','0730','0730','021','500','3','07','0','Y','N','021','500','N','N','N','N')"
COMMENTED_TEMPLATE = """<!--
<tr>
  <td><a href="#" onclick="fnSatsChc(deprTime, alcnDeprTime, alcnDeprTrmlNo, alcnArvlTrmlNo, indVBusClsCd, cacmCd, dcDvsCd, prvtBbizEmpAcmtRt, tissuFmicnt, busCnt, alcnDeprTrmlNo2, alcnArvlTrmlNo2, chldSftySatsYn, dsprSatsYn, etc1, etc2)"></a></td>
</tr>
-->
<!-- fnSatsChc('20261010','9999','9999','021','500','3','07','0','Y','N','021','500','N','N','N','N') -->
"""

FIXTURE = f"""<html><body>
<form id="alcnSrchFrm"></form>
<table>
  <tr><td>동양고속 심야우등 잔여 12석</td><td><a href="#" onclick="{REAL_ROW_1}">선택</a></td></tr>
  {COMMENTED_TEMPLATE}
  <tr><td>금호고속 우등 잔여 5석</td><td><a href="#" onclick="{REAL_ROW_2}">선택</a></td></tr>
</table>
</body></html>"""


class FakeOpener:
    def open(self, req, timeout=20):
        raise AssertionError("network must not be used in this test")


def fake_open_text(op, req, timeout):
    return FIXTURE


class ParseTest(unittest.TestCase):
    def test_commented_templates_are_not_schedules(self):
        original = kobus.open_text
        kobus.open_text = fake_open_text
        try:
            _, schedules = kobus.search(FakeOpener(), "021", "500", "20261010", 5)
        finally:
            kobus.open_text = original
        self.assertEqual(len(schedules), 2)
        self.assertEqual([s.departure_time for s in schedules], ["01:00", "07:30"])
        for s in schedules:
            self.assertEqual(len(s.raw_args), 16)

    def test_real_rows_survive_comment_stripping(self):
        # A full-args call inside a comment must also be ignored.
        _, schedules = _search()
        self.assertNotIn("99:99", [s.departure_time for s in schedules])


def _search():
    original = kobus.open_text
    kobus.open_text = fake_open_text
    try:
        return None, kobus.search(FakeOpener(), "021", "500", "20261010", 5)[1]
    finally:
        kobus.open_text = original


if __name__ == "__main__":
    unittest.main()
