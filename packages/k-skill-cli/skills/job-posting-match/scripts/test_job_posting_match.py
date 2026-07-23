import unittest

from job_posting_match import NEGATIVE_DEFAULTS, Posting, build_queries, parse_jobkorea, parse_saramin, score_posting


JOBKOREA_FIXTURE = '\n<div data-sentry-component="CardJob">\n  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/111?x=1">퍼포먼스 마케터 채용</a>\n  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/111?x=1">커머스A</a>\n  <p>서울 강남구 경력 3년 GA4 Google Ads Meta Ads 커머스</p>\n</div>\n<div data-sentry-component="CardJob">\n  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/222?x=1">보험영업 담당자</a>\n  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/222?x=1">보험B</a>\n  <p>대출영업 TM 신입</p>\n</div>\n'

SARANIM_FIXTURE = '\n<div class="item_recruit">\n  <div class="corp_name"><a>뷰티커머스</a></div>\n  <h2 class="job_tit"><a title="화장품 브랜드 퍼포먼스 마케터" href="/zf_user/jobs/relay/view?rec_idx=333&searchword=x"><span>화장품 브랜드 <b>퍼포먼스 마케터</b></span></a></h2>\n  <div class="job_condition"><span>서울</span><span>경력 5년</span></div>\n  <div class="job_sector">GA4 CRM Meta Ads 커머스</div>\n</div>\n<div class="item_recruit">\n  <div class="corp_name"><a>무관회사</a></div>\n  <h2 class="job_tit"><a title="총무 담당자" href="/zf_user/jobs/relay/view?rec_idx=444"><span>총무 담당자</span></a></h2>\n  <div class="job_condition"><span>부산</span><span>신입</span></div>\n</div>\n'


class JobPostingMatchTest(unittest.TestCase):
    def test_build_queries_from_resume(self):
        queries = build_queries("퍼포먼스 마케터 5년 GA4 Meta Ads SQL 커머스", [])
        self.assertTrue(any("퍼포먼스 마케터" in q for q in queries))
        self.assertLessEqual(len(queries), 3)

    def test_parse_jobkorea_cards_and_dedupe(self):
        postings = parse_jobkorea(JOBKOREA_FIXTURE, 10)
        self.assertEqual(len(postings), 2)
        self.assertEqual(postings[0].title, "퍼포먼스 마케터 채용")
        self.assertIn("GI_Read/111", postings[0].url)

    def test_parse_saramin_cards(self):
        postings = parse_saramin(SARANIM_FIXTURE, 10)
        self.assertEqual(len(postings), 2)
        self.assertEqual(postings[0].company, "뷰티커머스")
        self.assertIn("rec_idx=333", postings[0].url)

    def test_score_prefers_matching_posting_and_penalizes_negative(self):
        resume = "퍼포먼스 마케터 5년 GA4 Google Ads Meta Ads SQL 커머스 서울"
        good, bad = parse_jobkorea(JOBKOREA_FIXTURE, 10)
        good = score_posting(good, resume, ["서울"], ["보험영업", "대출영업"], 5)
        bad = score_posting(bad, resume, ["서울"], ["보험영업", "대출영업"], 5)
        self.assertGreater(good.score, bad.score)
        self.assertTrue(good.reasons)
        self.assertTrue(any("제외 조건" in c for c in bad.cautions))

    def test_score_does_not_match_short_latin_negative_inside_words(self):
        resume = "프론트엔드 개발자 5년 React TypeScript HTML CSS 서울"
        posting = Posting(
            source="fixture",
            title="프론트엔드 개발자",
            company="A",
            summary="React TypeScript HTML CSS 서울 경력 5년",
        )

        scored = score_posting(posting, resume, ["서울"], NEGATIVE_DEFAULTS, 5)

        self.assertEqual(scored.score, 84)
        self.assertFalse(any("TM" in caution for caution in scored.cautions))


if __name__ == "__main__":
    unittest.main()
