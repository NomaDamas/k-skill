import contextlib
import io
import unittest

from scripts.korean_spell_check import (
    SpellCheckIssue,
    apply_page_corrections,
    check_text,
    extract_result_payload,
    parse_args,
    split_text_into_chunks,
)


SAMPLE_RESULTS_HTML = """<!DOCTYPE html>
<html>
<head></head>
<body>
<script type="text/javascript">
$(document).ready(function(){
    data = [{"str":"아버지가방에들어가신다.","errInfo":[{"help":"철자 검사를 해 보니 이 어절은 분석할 수 없으므로 틀린 말로 판단하였습니다.<br/><br/>후보 어절은 이 철자 검사/교정기에서 띄어쓰기, 붙여쓰기, 음절 대치와 같은 교정 방법에 따라 수정한 결과입니다.","errorIdx":0,"correctMethod":3,"start":0,"errMsg":"","end":11,"orgStr":"아버지가방에들어가신다","candWord":"아버지가 방에 들어가신다"}],"idx":0}];
    pageIdx = 0;
    if(1){
        totalPageCnt = 1;
    }
    data = eval(data);
});
</script>
</body>
</html>
"""


class SplitTextIntoChunksTest(unittest.TestCase):
    def test_prefers_paragraph_boundaries_before_falling_back(self):
        text = "첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다."

        chunks = split_text_into_chunks(text, max_chars=15)

        self.assertEqual(chunks, ["첫 문단입니다.", "둘째 문단입니다.", "셋째 문단입니다."])


class ExtractResultPayloadTest(unittest.TestCase):
    def test_extracts_issue_rows_from_official_results_html(self):
        pages = extract_result_payload(SAMPLE_RESULTS_HTML)

        self.assertEqual(len(pages), 1)
        self.assertEqual(pages[0]["str"], "아버지가방에들어가신다.")
        self.assertEqual(pages[0]["errInfo"][0]["candWord"], "아버지가 방에 들어가신다")

    def test_apply_page_corrections_uses_the_first_candidate(self):
        pages = extract_result_payload(SAMPLE_RESULTS_HTML)
        corrected = apply_page_corrections(pages[0])

        self.assertEqual(corrected, "아버지가 방에 들어가신다.")


class CheckTextTest(unittest.TestCase):
    def test_check_text_builds_chunked_issue_reports(self):
        requested_texts = []

        def fake_requester(chunk, *, strong_rules, timeout):
            requested_texts.append((chunk, strong_rules, timeout))
            return SAMPLE_RESULTS_HTML.replace("아버지가방에들어가신다.", chunk)

        report = check_text(
            "아버지가방에들어가신다.\n\n아버지가방에들어가신다.",
            max_chars=15,
            requester=fake_requester,
            throttle_seconds=0,
        )

        self.assertEqual(len(report["chunks"]), 2)
        self.assertEqual(report["corrected_text"], "아버지가 방에 들어가신다.\n\n아버지가 방에 들어가신다.")
        self.assertEqual(len(report["issues"]), 2)
        self.assertIsInstance(report["issues"][0], SpellCheckIssue)
        self.assertEqual(report["issues"][0].original, "아버지가방에들어가신다")
        self.assertEqual(report["issues"][0].suggestions[0], "아버지가 방에 들어가신다")
        self.assertEqual(requested_texts[0][0], "아버지가방에들어가신다.")
        self.assertTrue(all(call[1] for call in requested_texts))

    def test_check_text_preserves_blank_lines_when_payload_collapses_them(self):
        html = """<!DOCTYPE html>
<html>
<body>
<script>
data = [{"str":"아버지가방에들어가신다.왠지 않되요.","errInfo":[
  {"help":"띄어쓰기 교정","errorIdx":0,"correctMethod":3,"start":0,"errMsg":"","end":11,"orgStr":"아버지가방에들어가신다","candWord":"아버지가 방에 들어가신다"},
  {"help":"활용형 교정","errorIdx":1,"correctMethod":3,"start":15,"errMsg":"","end":17,"orgStr":"않되요","candWord":"안 돼요"}
]}];
pageIdx = 0;
</script>
</body>
</html>
"""

        report = check_text(
            "아버지가방에들어가신다.\n\n왠지 않되요.",
            max_chars=50,
            requester=lambda chunk, *, strong_rules, timeout: html,
            throttle_seconds=0,
        )

        self.assertEqual(report["corrected_text"], "아버지가 방에 들어가신다.\n\n왠지 안 돼요.")
        self.assertEqual(report["chunks"][0]["corrected_text"], "아버지가 방에 들어가신다.\n\n왠지 안 돼요.")

    def test_check_text_preserves_blank_lines_when_service_suggests_sentence_spacing(self):
        html = """<!DOCTYPE html>
<html>
<body>
<script>
data = [{"str":"아버지가방에들어가신다.왠지 않되요.","errInfo":[
  {"help":"띄어쓰기 교정","errorIdx":0,"correctMethod":3,"start":0,"errMsg":"","end":11,"orgStr":"아버지가방에들어가신다","candWord":"아버지가 방에 들어가신다"},
  {"help":"문장 부호 뒤 띄어쓰기","errorIdx":1,"correctMethod":3,"start":11,"errMsg":"","end":14,"orgStr":".왠지","candWord":". 왠지"},
  {"help":"활용형 교정","errorIdx":2,"correctMethod":1,"start":15,"errMsg":"","end":18,"orgStr":"않되요","candWord":"안 돼요"}
]}];
pageIdx = 0;
</script>
</body>
</html>
"""

        report = check_text(
            "아버지가방에들어가신다.\n\n왠지 않되요.",
            max_chars=50,
            requester=lambda chunk, *, strong_rules, timeout: html,
            throttle_seconds=0,
        )

        self.assertEqual(report["corrected_text"], "아버지가 방에 들어가신다.\n\n왠지 안 돼요.")


class ParseArgsTest(unittest.TestCase):
    def test_rejects_non_positive_max_chars(self):
        for value in ("0", "-1"):
            with self.subTest(value=value):
                with contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as ctx:
                        parse_args(["--text", "테스트", "--max-chars", value])

                self.assertNotEqual(ctx.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
