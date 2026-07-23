#!/usr/bin/env python3
"""Fixture tests for JobKorea public fallback parsing."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("jobkorea_talent_search.py")
sys.path.insert(0, str(SCRIPT.parent))
spec = importlib.util.spec_from_file_location("jobkorea_talent_search", SCRIPT)
assert spec is not None
helper = importlib.util.module_from_spec(spec)
sys.modules["jobkorea_talent_search"] = helper
assert spec.loader is not None
spec.loader.exec_module(helper)


FALLBACK_FIXTURE = """
<section class="searchList">
  <table class="tblSearchList">
    <tbody>
      <tr class="dvResumeTr" data-rno="111">
        <td class="tdProfile">
          <dl class="nameAge"><dt><a class="dvResumeLink" href="/corp/person/find/resume/view?rNo=111" data-rno="111">김OO</a></dt><dd>(여, 만 29세)</dd></dl>
          <ul class="bullList"><li>25분전 공고 스크랩</li></ul>
        </td>
        <td class="tdSummary">
          <div class="userInfoBox">
            <span class="career">경력 4년</span>
            <p class="title"><a class="dvResumeLink" href="/corp/person/find/resume/view?rNo=111" data-rno="111">퍼포먼스 마케터</a></p>
            <div class="keywordSkill keywordBox">
              <button type="button" class="js-kwrdSearch">Google Analytics</button>
              <button type="button" class="js-kwrdSearch">GA4</button>
            </div>
          </div>
        </td>
        <td class="tdAction">
          <button>스크랩 1</button><button>이력서 확인</button><button>포지션 제안</button><button>메모하기</button><button>저장하기</button><button>닫기</button>
        </td>
      </tr>
      <tr class="dvResumeTr" data-rno="222">
        <td class="tdProfile">
          <dl class="nameAge"><dt><a class="dvResumeLink" href="/corp/person/find/resume/view?rNo=222" data-rno="222">박OO</a></dt><dd>(남, 만 31세)</dd></dl>
        </td>
        <td class="tdSummary">
          <span class="career">경력 6년</span>
          <p class="title"><a class="dvResumeLink" href="/corp/person/find/resume/view?rNo=222" data-rno="222">브랜드 마케터</a></p>
          <div class="keywordSkill keywordBox"><button type="button" class="js-kwrdSearch">브랜딩</button></div>
        </td>
      </tr>
    </tbody>
  </table>
</section>
"""


class JobKoreaFallbackParserTest(unittest.TestCase):
    def test_parser_keeps_each_candidate_inside_its_own_row(self) -> None:
        candidates = helper.parse_candidates(FALLBACK_FIXTURE, 10)

        self.assertEqual([c.rno for c in candidates], ["111", "222"])
        self.assertEqual(candidates[0].name, "김OO")
        self.assertIn("Google Analytics", candidates[0].raw_summary)
        self.assertIn("GA4", candidates[0].raw_summary)
        self.assertNotIn("박OO", candidates[0].raw_summary)
        self.assertNotIn("브랜딩", candidates[0].raw_summary)
        self.assertNotIn("저장하기", candidates[0].raw_summary)
        self.assertNotIn("닫기", candidates[0].raw_summary)
        self.assertNotIn("포지션 제안", candidates[0].raw_summary)
        self.assertNotIn("이력서 확인", candidates[0].raw_summary)


if __name__ == "__main__":
    unittest.main()
