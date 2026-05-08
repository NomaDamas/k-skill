const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDetailResponseBody,
  buildListResponseBody,
  buildSearchUrl,
  normalizeShNoticeDetailQuery,
  normalizeShNoticeSearchQuery,
  parseAttachments,
  parseDetail,
  parseListRows
} = require("../src/sh-notice");

const LIST_HTML = `
<p>총 <strong>1606</strong>건, 1/161페이지</p>
<table><tbody>
<tr>
  <td>1606</td>
  <td class="txtL"><a href="#" class="ellipsis icon" onclick="javascript:getDetailView('304022');return false;"><span class="icoNew">NEW</span> 전산작업에 따른 서비스(신한인증서) 이용 안내</a></td>
  <td>시스템운영부</td>
  <td class="num">2026-05-08</td>
  <td class="num">97</td>
</tr>
<tr>
  <td>1605</td>
  <td class="txtL"><a href="#" class="ellipsis" onclick="javascript:getDetailView('303994');return false;">행복주택 예비당첨자 게시</a></td>
  <td>공공주택공급부</td>
  <td class="num">2026-05-07</td>
  <td class="num">1,972</td>
</tr>
</tbody></table>`;

const DETAIL_HTML = `
<table>
  <caption>행복주택 예비당첨자 게시</caption>
  <tbody>
    <tr><td><strong>등록일 :</strong> 2026-05-07 <strong>조회수 :</strong> 1,972</td></tr>
    <tr><th scope="row">첨부</th><td>
      <a href="#" class="btnAttach v1">.pdf</a>
      <a href="#" class="btnAttach v2">.hwp</a>
      <a href="#" class="btnAttach v11">.etc</a>
      <a href="#" class="btnAttach v1" onclick="existFile('0'); return false;">2022년 2차 행복주택 예비 17차 당첨자명단.pdf</a>
      <a href="/app/com/util/htmlConverter.do?brd_id=GS0401&amp;seq=303994&amp;data_tp=A&amp;file_seq=1" class="btn btnWhite h32 icoView" target="_blank">미리보기</a>
      <a href="#" class="btnAttach v2" onclick="existFile('1'); return false;">추가 안내문.hwp</a>
      <a href="/app/com/util/htmlConverter.do?brd_id=GS0401&amp;seq=303994&amp;data_tp=A&amp;file_seq=2" class="btn btnWhite h32 icoView" target="_blank">미리보기</a>
    </td></tr>
    <tr><td colspan="2" class="cont"><p>2022년 2차 행복주택 예비17차 당첨자 발표</p><p>계약 안내를 확인하세요.</p></td></tr>
  </tbody>
</table>`;

test("normalizeShNoticeSearchQuery maps aliases and bounds page size", () => {
  const normalized = normalizeShNoticeSearchQuery({ q: "행복주택", searchType: "제목", page: "2", limit: "200" });
  assert.equal(normalized.srchWord, "행복주택");
  assert.equal(normalized.srchTp, "1");
  assert.equal(normalized.page, 2);
  assert.equal(normalized.pageSize, 10);
});

test("normalizeShNoticeSearchQuery defaults keyword search to title scope when srchTp is omitted", () => {
  const normalized = normalizeShNoticeSearchQuery({ q: "행복주택" });
  assert.equal(normalized.srchWord, "행복주택");
  assert.equal(normalized.srchTp, "1");
});

test("normalizeShNoticeSearchQuery keeps srchTp null when no keyword is provided", () => {
  const normalized = normalizeShNoticeSearchQuery({});
  assert.equal(normalized.srchWord, null);
  assert.equal(normalized.srchTp, null);
});

test("normalizeShNoticeSearchQuery preserves explicit content scope", () => {
  const normalized = normalizeShNoticeSearchQuery({ q: "행복주택", srchTp: "content" });
  assert.equal(normalized.srchTp, "2");
});

test("normalizeShNoticeSearchQuery rejects oversized keyword", () => {
  assert.throws(
    () => normalizeShNoticeSearchQuery({ q: "x".repeat(101) }),
    /100 characters/
  );
});

test("normalizeShNoticeSearchQuery rejects non-numeric multiItmSeq", () => {
  assert.throws(() => normalizeShNoticeSearchQuery({ multiItmSeq: "abc" }), /digits only/);
});

test("normalizeShNoticeDetailQuery requires numeric seq", () => {
  assert.equal(normalizeShNoticeDetailQuery({ id: "303994" }).seq, "303994");
  assert.throws(() => normalizeShNoticeDetailQuery({ seq: "abc" }), /digits only/);
});

test("normalizeShNoticeDetailQuery rejects non-numeric multiItmSeq", () => {
  assert.throws(
    () => normalizeShNoticeDetailQuery({ seq: "303994", multiItmSeq: "abc" }),
    /digits only/
  );
});

test("buildSearchUrl targets official SH list page", () => {
  const url = buildSearchUrl(normalizeShNoticeSearchQuery({ keyword: "원룸", srchTp: "content" }));
  assert.equal(url.hostname, "www.i-sh.co.kr");
  assert.equal(url.searchParams.get("srchTp"), "2");
  assert.equal(url.searchParams.get("srchWord"), "원룸");
});

test("parseListRows extracts SH notice list", () => {
  const rows = parseListRows(LIST_HTML, { multiItmSeq: "2" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    seq: "304022",
    number: "1606",
    title: "전산작업에 따른 서비스(신한인증서) 이용 안내",
    department: "시스템운영부",
    registered_date: "2026-05-08",
    views: 97,
    is_new: true,
    detail_url: "https://www.i-sh.co.kr/app/lay2/program/S48T1581C563/www/brd/m_247/view.do?multi_itm_seq=2&seq=304022"
  });
  assert.equal(rows[1].views, 1972);
});

test("buildListResponseBody limits returned items and includes total", () => {
  const body = buildListResponseBody(LIST_HTML, { page: 1, pageSize: 1, multiItmSeq: "2" });
  assert.equal(body.items.length, 1);
  assert.equal(body.summary.total_count, 1606);
  assert.equal(body.summary.returned_count, 1);
});

test("parseAttachments skips icon-template anchors and returns real attachments with previews", () => {
  const attachments = parseAttachments(DETAIL_HTML, "303994");
  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].filename, "2022년 2차 행복주택 예비 17차 당첨자명단.pdf");
  assert.equal(attachments[0].file_seq, "1");
  assert.equal(
    attachments[0].preview_url,
    "https://www.i-sh.co.kr/app/com/util/htmlConverter.do?brd_id=GS0401&seq=303994&data_tp=A&file_seq=1"
  );
  assert.equal(Object.hasOwn(attachments[0], "download_hint"), false);
  assert.equal(attachments[1].filename, "추가 안내문.hwp");
  assert.equal(attachments[1].file_seq, "2");
});

test("parseDetail extracts title, metadata, and content text", () => {
  const detail = parseDetail(DETAIL_HTML, { seq: "303994", multiItmSeq: "2" });
  assert.equal(detail.title, "행복주택 예비당첨자 게시");
  assert.equal(detail.registered_date, "2026-05-07");
  assert.equal(detail.views, 1972);
  assert.match(detail.content_text, /계약 안내/);
  assert.equal(detail.attachments.length, 2);
});

