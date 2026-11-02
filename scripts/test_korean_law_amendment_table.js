"use strict";

// 신･구조문대비표 엔진 테스트. 기대값의 ‹›는 밑줄 구간이고, 표기 규칙은 법제처 신구법비교
// 원문(실제 개정 대비표)을 정답으로 둔다. 엔진은 chrisryugj/korean-law-mcp(MIT)에서 이식했다.

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..", "korean-law-search", "scripts");
const amd = (name) => require(path.join(root, "amendment", name));
const { parseArticle } = amd("units.js");
const { renderArticle } = amd("render.js");
const { lineToPlain } = amd("format.js");
const { dashify } = amd("marks.js");
const { diffInline } = amd("diff.js");

const show = (rows) => (rows ?? []).map(r => ({
  old: r.old.map(lineToPlain).join("\n"),
  new: r.new.map(lineToPlain).join("\n"),
}))

const table = (oldText, newText) =>
  show(renderArticle(oldText === null ? null : parseArticle(oldText), parseArticle(newText)))

describe("parseArticle", () => {
  it("조 머리 뒤에 같은 줄로 붙은 ①을 떼고, 호는 항 아래로 넣는다", () => {
    const t = parseArticle("제22조(건축물의 사용승인) ① 건축주는 신청한다. <개정 2013.3.23>\n② 허가권자는 검사한다.\n1. 설계도서\n6의2. 기계설비\n12. 삭제<2009.6.9>")
    assert.equal(t.num, "제22조")
    assert.equal(t.title, "(건축물의 사용승인)")
    assert.deepEqual(t.children.map(c => c.label), ["①", "②"])
    assert.equal(t.children[0].body, "건축주는 신청한다.")
    assert.deepEqual(t.children[1].children.map(c => `${c.label}${c.body}`), ["1.설계도서", "6의2.기계설비", "12.삭제"])
  })

  it("항 없는 조는 본문이 lead, 괄호 안 괄호 제목도 읽는다", () => {
    const t = parseArticle("제4조(국가ㆍ지방자치단체(시ㆍ도) 및 국민의 책무) 국가는 노력하여야 한다.\n[전문개정 2008.3.21]")
    assert.equal(t.title, "(국가ㆍ지방자치단체(시ㆍ도) 및 국민의 책무)")
    assert.equal(t.lead, "국가는 노력하여야 한다.")
  })
})

describe("자리표시 (현행과 같음)", () => {
  it("범위·가운뎃점·조 본문 자리표시를 현행으로 채운다", () => {
    const old = "제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.\n1. 가란 가이다.\n2. 나란 나이다.\n3. 다란 다이다.\n4. 라란 라이다."
    const neu = "제2조(정의) (현행과 같음)\n1.·2. (현행과 같음)\n3. 다란 새 다이다.\n4. (생  략)\n5. 마란 마이다."
    const notes = []
    const rows = renderArticle(parseArticle(old), parseArticle(neu), notes)
    assert.deepEqual(show(rows), [
      { old: "제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.", new: "제2조(정의) ------------------------." },
      { old: "1.·2. (생  략)", new: "1.·2. (현행과 같음)" },
      { old: "3. ‹다란› 다이다.", new: "3. ‹다란 새› ---." },
      { old: "4. (생  략)", new: "4. (현행과 같음)" },
      { old: "‹<신  설>›", new: "‹5. 마란 마이다.›" },
    ])
    assert.deepEqual(notes, [])
  })

  it("현행에 없는 번호를 가리키면 빼고 알린다", () => {
    const notes = []
    renderArticle(parseArticle("제3조(가) ① 가는 한다.\n② 나는 한다."), parseArticle("제3조(가) ① ∼ ⑤ (현행과 같음)"), notes)
    assert.ok(notes[0].includes("① ∼ ⑤이(가) 현행에 없어 뺐습니다"), "① ∼ ⑤이(가) 현행에 없어 뺐습니다")
  })
})

describe("diffInline — 법제처 밑줄 단위", () => {
  const u = (o, n) => {
    const d = diffInline(o, n)
    return [lineToPlain(d.old), lineToPlain(d.new)]
  }
  it("어절 단위 + 끝 조사는 밑줄 밖 (건축법 제22조 2025 개정)", () => {
    assert.deepEqual(u("국토교통부령으로 정하는 공사완료도서를 첨부하여", "국토교통부령으로 정하는 서류를 첨부하여"), ["국토교통부령으로 정하는 ‹공사완료도서›를 첨부하여", "국토교통부령으로 정하는 ‹서류›를 첨부하여"])
  })
  it("끼워 넣기는 앞 어절을 붙잡아 양쪽에 긋는다 (동물보호법 제2조)", () => {
    assert.deepEqual(u("도로ㆍ공원 등의 공공장소에서 배회하거나", "도로ㆍ공원 등의 공공장소, 동물병원 또는 업체에서 배회하거나"), ["도로ㆍ공원 등의 ‹공공장소›에서 배회하거나", "도로ㆍ공원 등의 ‹공공장소, 동물병원 또는 업체›에서 배회하거나"])
  })
  it("빼기도 앞 어절을 붙잡는다 (동물보호법 제9조)", () => {
    assert.deepEqual(u("수면이 보장되도록 노력하여야 한다.", "수면이 보장되도록 한다."), ["수면이 ‹보장되도록 노력하여야› 한다.", "수면이 ‹보장되도록› 한다."])
  })
})

describe("renderArticle", () => {
  it("뒤에 항을 신설하면 앞 항은 묶어 (생  략), 새 항은 <신  설> (건축법 제11조)", () => {
    const old = "제11조(건축허가) ① 가는 한다.\n② 나는 한다.\n③ 다는 한다."
    assert.deepEqual(table(old, `${old}\n④ 라는 알려야 한다.`), [
      { old: "제11조(건축허가) ① ∼ ③ (생  략)", new: "제11조(건축허가) ① ∼ ③ (현행과 같음)" },
      { old: "‹<신  설>›", new: "‹④ 라는 알려야 한다.›" },
    ])
  })

  it("바뀐 항: 개정안 칸은 같은 부분을 줄표로, 호 신설은 머리글 줄을 줄표로 이어 준다", () => {
    const old = "제22조(사용승인) ① 건축주는 공사완료도서를 첨부한다.\n② 허가권자는 검사한다.\n1. 가 여부\n2. 나 여부\n③ 다는 한다."
    const neu = "제22조(사용승인) ① 건축주는 서류를 첨부한다.\n② 허가권자는 검사한다.\n1. 가 여부\n2. 나 여부\n3. 숙박시설 여부\n③ 다는 한다."
    assert.deepEqual(table(old, neu), [
      { old: "제22조(사용승인) ① 건축주는 ‹공사완료도서›를 첨부한다.", new: "제22조(사용승인) ① ---- ‹서류›------." },
      { old: "② 허가권자는 검사한다.", new: "② ----------." },
      { old: "1.·2. (생  략)", new: "1.·2. (현행과 같음)" },
      { old: "‹<신  설>›", new: "‹3. 숙박시설 여부›" },
      { old: "③ (생  략)", new: "③ (현행과 같음)" },
    ])
  })

  it("가운데 항을 끼워 번호가 밀려도 번호끼리 짝 — 공식 대비표처럼 밀린 항은 바뀐 항, 끝 번호는 <신  설>", () => {
    const old = "제5조(신고) ① 가는 한다.\n② 나는 한다.\n③ 다는 한다."
    const neu = "제5조(신고) ① 가는 한다.\n② 새로 생긴 항은 이렇게 한다.\n③ 나는 한다.\n④ 다는 한다."
    assert.deepEqual(table(old, neu), [
      { old: "제5조(신고) ① (생  략)", new: "제5조(신고) ① (현행과 같음)" },
      { old: "‹② 나는 한다.›", new: "‹② 새로 생긴 항은 이렇게 한다.›" },
      { old: "③ ‹다›는 한다.", new: "③ ‹나›----." },
      { old: "‹<신  설>›", new: "‹④ 다는 한다.›" },
    ])
  })

  it("본문만 있던 조를 항으로 나누면 조 전체를 통째로 (저작권법 제106조의2)", () => {
    assert.deepEqual(table("제106조의2(거부금지) 정당한 이유가 없으면 거부해서는 아니 된다.", "제106조의2(거부금지 등) ① 정당한 이유가 없으면 거부해서는 아니 된다.\n② 원칙에 따라 이용허락을 하여야 한다."), [{ old: "‹제106조의2(거부금지) 정당한 이유가 없으면 거부해서는 아니 된다.›", new: "‹제106조의2(거부금지 등) ① 정당한 이유가 없으면 거부해서는 아니 된다.›\n‹② 원칙에 따라 이용허락을 하여야 한다.›" }])
  })

  it("옛 법령의 붙여 쓴 라벨(①문화…)과 곧은 따옴표는 원문 모양대로·“ ”로", () => {
    assert.deepEqual(table('제108조(감독) ①장관은 보고를 하게 할 수 있다.\n②장관은 "명령"을 할 수 있다.', '제108조(감독) ①장관은 보고를 하게 할 수 있다.\n②장관은 "시정명령"을 할 수 있다.'), [
        { old: "제108조(감독) ① (생  략)", new: "제108조(감독) ① (현행과 같음)" },
        { old: "②장관은 ‹“명령”›을 할 수 있다.", new: "②--- ‹“시정명령”›--------." },
      ])
  })

  it("'3. 삭제'로 지운 호는 <삭  제>, 통째로 바뀐 호는 라벨까지 밑줄", () => {
    const old = "제9조(금지) 다음 행위를 하여서는 아니 된다.\n1. 유기하는 행위\n2. 도박에 이용하는 행위\n3. 판매하는 행위"
    const neu = "제9조(금지) 다음 행위를 하여서는 아니 된다.\n1. 유기하는 행위\n2. 봉사동물을 학대하는 일\n3. 삭제"
    assert.deepEqual(table(old, neu), [
      { old: "제9조(금지) 다음 행위를 하여서는 아니 된다.", new: "제9조(금지) -----------------." },
      { old: "1. (생  략)", new: "1. (현행과 같음)" },
      { old: "‹2. 도박에 이용하는 행위›", new: "‹2. 봉사동물을 학대하는 일›" },
      { old: "‹3. 판매하는 행위›", new: "‹<삭  제>›" },
    ])
  })

  it("끝에 단서를 붙이면 현행 칸에 <단서 신설> (동물보호법 제18조)", () => {
    assert.deepEqual(table("제18조(허가) ③ 시ㆍ도지사는 기질평가를 거쳐야 한다.", "제18조(허가) ③ 시장ㆍ군수는 기질평가를 거쳐야 한다. 다만, 어려운 경우에는 그러하지 아니하다."), [{
        old: "제18조(허가) ③ ‹시ㆍ도지사›는 기질평가를 거쳐야 한다. ‹<단서 신설>›",
        new: "제18조(허가) ③ ‹시장ㆍ군수›--------------. ‹다만, 어려운 경우에는 그러하지 아니하다.›",
      }])
  })

  it("제목만 바뀌면 (제목) 밑줄 + 나머지 (현행과 같음)", () => {
    assert.deepEqual(table("제65조(승무정원) ① 가는 한다.\n② 나는 한다.", "제65조(최소승무정원) ① 가는 한다.\n② 나는 한다."), [{ old: "제65조‹(승무정원)› ①·② (생  략)", new: "제65조‹(최소승무정원)› ①·② (현행과 같음)" }])
  })

  it("조 신설·삭제와 변경 없음", () => {
    assert.deepEqual(table(null, "제5조의2(갱신) ① 3년마다 갱신한다.\n② 절차는 대통령령으로 정한다."), [{ old: "‹<신  설>›", new: "‹제5조의2(갱신) ① 3년마다 갱신한다.›\n‹② 절차는 대통령령으로 정한다.›" }])
    assert.deepEqual(table("제7조(위원회) 위원회를 둔다.", "제7조 삭제"), [{ old: "‹제7조(위원회) 위원회를 둔다.›", new: "‹제7조 삭제›" }])
    assert.equal(renderArticle(parseArticle("제7조(위원회) 위원회를 둔다."), parseArticle("제7조(위원회) 위원회를  둔다.")), null)
  })
})

describe("큰 입력", () => {
  it("5만 자 한 줄·호 900개도 빠르게 끝난다(메모리·시간 보호)", () => {
    const words = (seed) => Array.from({ length: 12_000 }, (_, i) => `${seed}${i}`).join(" ")
    const t0 = Date.now()
    const d = diffInline(words("가"), words("나"))
    assert.ok(d.old.length > 0)
    const items = (w) => Array.from({ length: 900 }, (_, i) => `${i + 1}. ${w}${i}`).join("\n")
    assert.equal(table(`제1조(목적) 다음과 같다.\n${items("가")}`, `제1조(목적) 다음과 같다.\n${items("나")}`).length, 901)
    assert.ok(Date.now() - t0 < 5_000)
  })
})

describe("리뷰 재현 (2026-10-31)", () => {
  it("A: 같은 층 단위 8천 개 × 8천 개도 n×m 표 없이 끝난다", () => {
    const many = "제1조(가) " + Array.from({ length: 8_000 }, () => "① 가").join("\n")
    const t0 = Date.now()
    renderArticle(parseArticle(many), parseArticle(many.replace(/가$/, "나")))
    assert.ok(Date.now() - t0 < 5_000)
  })

  it("B: 줄 안의 긴 전각 공백·\\r 도 선형으로 처리한다", () => {
    const t0 = Date.now()
    table("제1조(가) ① 가" + "\u3000".repeat(30_000) + "나", "제1조(가) ① 다" + "\u3000".repeat(30_000) + "라")
    table("제1조(가) ① 가" + "\u3000".repeat(30_000) + "나\n② 바", "제1조(가) ① 가" + "\u3000".repeat(30_000) + "나\n② 사")
    assert.ok(Date.now() - t0 < 1_000)
  })

  it("F: 제목의 가운뎃점 표기 차이는 제목 변경이 아니다", () => {
    assert.equal(renderArticle(parseArticle("제4조(국가ㆍ지방자치단체의 책무) 노력한다."), parseArticle("제4조(국가·지방자치단체의 책무) 노력한다.")), null)
  })

  it("G: '제3조에 따른 …'으로 시작하는 본문을 조 머리로 읽지 않는다", () => {
    const t = parseArticle("제3조에 따른 신고는 서면으로 한다.")
    assert.equal(t.num, "")
    assert.equal(t.lead, "제3조에 따른 신고는 서면으로 한다.")
  })

  it("I: 제목만 바뀐 조의 본문(호 머리글)은 표에서 사라지지 않는다", () => {
    assert.deepEqual(table("제2조(정의) 용어의 뜻은 다음과 같다.\n1. 가\n2. 나", "제2조(용어의 정의) 용어의 뜻은 다음과 같다.\n1. 가\n2. 나"), [
      { old: "제2조‹(정의)› 용어의 뜻은 다음과 같다.", new: "제2조‹(용어의 정의)› -------------." },
      { old: "1.·2. (생  략)", new: "1.·2. (현행과 같음)" },
    ])
  })
})

describe("표기 원자", () => {
  it("줄표: 글자 수만큼, 문장 끝 마침표와 그 뒤 공백은 남긴다", () => {
    assert.equal(dashify("가는 한다. 나는 한다."), "-----. -----.")
    assert.equal(dashify(" 제1항에 따라 "), " ------- ")
  })

  it("개정 부분이 마침표 바로 앞에서 끝나고 단서가 신설돼도 마침표를 남긴다 (#180)", () => {
    // 건축법 제79조⑤ — 현행 "조사를 할 수 있다." → "조사를 연 1회 이상 정기적으로 실시하여야 한다. 다만, …"
    const [row] = table(
      "제79조(위반 건축물 등에 대한 조치 등) 허가권자는 실태를 파악하기 위하여 조사를 할 수 있다. <신설 2019.4.23>",
      "제79조(위반 건축물 등에 대한 조치 등) 허가권자는 실태를 파악하기 위하여 조사를 연 1회 이상 정기적으로 실시하여야 한다. 다만, 허가권자는 수시조사를 실시할 수 있다.",
    )
    assert.ok(row.new.includes("실시하여야 한다›. ‹다만"), "실시하여야 한다›. ‹다만")
    assert.equal(dashify(".", "다"), ".")
    assert.equal(dashify(".", ""), "-")
  })
})

// ---------------------------------------------------------------------------
// 조회·직접 입력·신설 판정·HWPX 저장 (법제처는 stub — 조문 JSON은 DRF 조문단위 모양)
// ---------------------------------------------------------------------------

const { amendmentTable, draftTitle } = amd("table.js");

const lawJson = (unit) => ({ 법령: { 기본정보: { 법령명_한글: "건축법" }, 조문: unit ? { 조문단위: unit } : undefined } });
const ARTICLE_22 = lawJson({
  조문여부: "조문", 조문번호: "22", 조문제목: "건축물의 사용승인", 조문내용: "제22조(건축물의 사용승인)",
  항: [
    { 항내용: "① 건축주는 공사완료도서를 첨부하여 신청하여야 한다. <개정 2013.3.23>" },
    { 항내용: "② 허가권자는 검사한다." },
  ],
});
// 업스트림이 JO 를 무시하고 다른 조를 돌려준 경우
const WRONG_ARTICLE = lawJson({ 조문여부: "조문", 조문번호: "1", 조문내용: "제1조(목적) 이 법은 목적이 있다." });
const SEARCH_HITS = [
  { lawName: "건축법 시행령", lawId: "002118", mst: "290833", status: "현행" },
  { lawName: "건축법", lawId: "001823", mst: "273437", status: "현행" },
];

function stub() {
  const calls = [];
  return {
    calls,
    async searchLaws(query) { calls.push(`search:${query}`); return SEARCH_HITS; },
    async getLawJson({ mst, lawId, jo }) {
      calls.push(`law:${mst ?? lawId}:${jo}`);
      return jo === "002200" ? ARTICLE_22 : jo === "009900" ? WRONG_ARTICLE : lawJson(null);
    },
  };
}

const NEW_22 = "제22조(건축물의 사용승인) ① 건축주는 서류를 첨부하여 신청하여야 한다.\n② 허가권자는 검사한다.\n③ 숙박시설은 알려야 한다.";

describe("amendmentTable", () => {
  it("법령명으로 현행을 조회해 대조하고, 연혁 표기는 빼고, 바뀐 곳만 밑줄", async () => {
    const api = stub();
    const r = await amendmentTable(api, { lawName: "건축법", amendments: [{ text: NEW_22 }] });
    assert.equal(r.isError, false);
    assert.deepEqual(api.calls, ["search:건축법", "law:273437:002200"]);
    assert.ok(r.text.includes("### 건축법 일부개정법률안 신･구조문대비표"));
    assert.ok(r.text.includes("| 제22조(건축물의 사용승인) ① 건축주는 **공사완료도서**를 첨부하여 신청하여야 한다. | 제22조(건축물의 사용승인) ① ---- **서류**---------------. |"));
    assert.ok(r.text.includes("| ② (생  략) | ② (현행과 같음) |"));
    assert.ok(r.text.includes("| **<신  설>** | **③ 숙박시설은 알려야 한다.** |"));
    assert.ok(!r.text.includes("개정 2013"));
  });

  it("법령명이 정확히 같은 현행 법령만 고른다 — 부분 일치(건축법 시행령, 난민법)로 넘어가지 않는다", async () => {
    const api = stub();
    api.searchLaws = async () => [{ lawName: "난민법", lawId: "1", mst: "9", status: "현행" }];
    const r = await amendmentTable(api, { lawName: "민법", amendments: [{ text: NEW_22 }] });
    assert.equal(r.isError, true);
    assert.ok(r.text.includes("난민법"), "후보를 알려 준다");
    assert.deepEqual(api.calls, [], "엉뚱한 법령의 조문을 가져오지 않는다");
  });

  it("현행에 없는 조는 신설로 처리하고 번호 확인을 알린다", async () => {
    const r = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ text: "제22조의2(숙박시설 안내) 허가권자는 안내하여야 한다." }] });
    assert.ok(r.text.includes("| **<신  설>** | **제22조의2(숙박시설 안내) 허가권자는 안내하여야 한다.** |"));
    assert.ok(r.text.includes("현행에 없는 조라 신설로 처리했습니다"));
  });

  it("currentText 를 주면 법제처를 부르지 않는다 (조례·행정규칙)", async () => {
    const api = stub();
    const r = await amendmentTable(api, {
      title: "서울특별시 광진구 복무 조례 일부개정조례안",
      amendments: [{ currentText: "제3조(근무시간) 근무시간은 9시부터 18시까지로 한다.", text: "제3조(근무시간) 근무시간은 8시부터 17시까지로 한다." }],
    });
    assert.deepEqual(api.calls, []);
    assert.ok(r.text.includes("**9시부터 18시까지**로"));
    assert.ok(r.text.includes("제3조(근무시간) ----- **8시부터 17시까지**----."));
  });

  it("조문 순서대로 정렬하고, 현행과 같은 조는 빼며 알린다", async () => {
    const r = await amendmentTable(stub(), {
      amendments: [
        { currentText: "제9조(나) 나는 한다.", text: "제9조(나) 나는 하지 아니한다." },
        { currentText: "제3조(가) 가는 한다.", text: "제3조(가) 가는 한다." },
        { currentText: "제2조(다) 다는 한다.", text: "제2조(다) 다를 한다." },
      ],
    });
    assert.ok(r.text.indexOf("제2조(다)") < r.text.indexOf("제9조(나)"));
    assert.ok(r.text.includes("제3조: 현행과 같아 표에서 뺐습니다"));
  });

  it("바뀐 항만 적으면 빠진 항을 <삭  제>로 적되 알리고, '(현행과 같음)' 자리표시는 현행으로 채운다", async () => {
    const partial = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ text: "제22조(건축물의 사용승인) ① 건축주는 서류를 첨부하여 신청하여야 한다." }] });
    assert.ok(partial.text.includes("| **② 허가권자는 검사한다.** | **<삭  제>** |"));
    assert.ok(partial.text.includes("제22조: 개정안에 없는 ②을(를) <삭  제>로 적었습니다"));

    const marked = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ text: "제22조(건축물의 사용승인) ① 건축주는 서류를 첨부하여 신청하여야 한다.\n② (현행과 같음)\n③ 숙박시설은 알려야 한다." }] });
    assert.ok(marked.text.includes("| ② (생  략) | ② (현행과 같음) |"));
    assert.ok(!marked.text.includes("확인할 점"));
  });

  it("C: 업스트림이 다른 조를 주면 그 조와 대조하지 않는다", async () => {
    const r = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ text: "제99조(새 조) 새로 정한다." }] });
    assert.ok(!r.text.includes("제1조"));
    assert.ok(r.text.includes("| **<신  설>** |"));
  });

  it("H: 빈 jo 는 머리 번호로, jo 와 머리 번호가 다르면 알리고, 같은 조를 두 번 주면 막는다", async () => {
    const empty = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ jo: "", text: NEW_22 }] });
    assert.equal(empty.isError, false);
    const differ = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ jo: "제22조", text: NEW_22.replace("제22조", "제23조") }] });
    assert.ok(differ.text.includes("jo(제22조)와 개정안 머리(제23조)가 다릅니다"));
    const dup = await amendmentTable(stub(), { mst: "273437", lawName: "건축법", amendments: [{ text: NEW_22 }, { jo: "제22조", text: NEW_22 }] });
    assert.equal(dup.isError, true);
  });

  it("굵은 글씨 경계에 붙은 괄호는 밖으로 빼서 채팅 화면에서 깨지지 않는다", async () => {
    const r = await amendmentTable(stub(), { amendments: [{ currentText: "제65조(승무정원) 정원을 정한다.", text: "제65조(최소승무정원) 정원을 정한다." }] });
    assert.ok(r.text.includes("| 제65조(**승무정원**) (생  략) | 제65조(**최소승무정원**) (현행과 같음) |"));
  });

  it("입력이 잘못되면 호출 전에 막는다: 법령 지정·currentText 둘 다 없음, 빈 목록, 31조문, 빈 text", async () => {
    for (const input of [
      { amendments: [{ text: NEW_22 }] },
      { lawName: "건축법", amendments: [] },
      { lawName: "건축법", amendments: Array.from({ length: 31 }, (_, i) => ({ jo: `제${i + 1}조`, text: `제${i + 1}조(가) 가.` })) },
      { lawName: "건축법", amendments: [{ text: "" }] },
      { lawName: "건축법" },
    ]) {
      const api = stub();
      const r = await amendmentTable(api, input);
      assert.equal(r.isError, true);
      assert.deepEqual(api.calls, []);
    }
  });

  it("개정안 이름: 법률·영·부령·조례", () => {
    assert.equal(draftTitle("건축법"), "건축법 일부개정법률안");
    assert.equal(draftTitle("건축법 시행령"), "건축법 시행령 일부개정령안");
    assert.equal(draftTitle("건축법 시행규칙"), "건축법 시행규칙 일부개정령안");
    assert.equal(draftTitle("서울특별시 광진구 주차장 설치 및 관리 조례"), "서울특별시 광진구 주차장 설치 및 관리 조례 일부개정조례안");
  });
});

// ---------------------------------------------------------------------------
// ZIP / HWPX
// ---------------------------------------------------------------------------

/** 독립 검증용 최소 ZIP 리더: 중앙 디렉터리를 읽고 CRC-32까지 대조한다 */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "EOCD");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    const data = method === 0 ? raw : zlib.inflateRawSync(raw);
    assert.equal(data.length, usize, `${name} size`);
    assert.equal(amd("zip.js").crc32(data), crc, `${name} crc`);
    entries.push({ name, method, data, offset: local });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

describe("zip writer", () => {
  const { createZip, crc32 } = amd("zip.js");

  it("CRC-32 는 표준 값이다", () => {
    assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
    assert.equal(crc32(Buffer.alloc(0)), 0);
  });

  it("항목을 그대로 다시 읽을 수 있고, store 항목은 압축하지 않는다 (한글·빈 파일·디렉터리 없는 이름)", () => {
    const buf = createZip([
      { name: "mimetype", data: "application/hwp+zip", store: true },
      { name: "Contents/한글.xml", data: "<a>".repeat(5000) + "한글" },
      { name: "empty.txt", data: "" },
    ]);
    const got = readZip(buf);
    assert.deepEqual(got.map((e) => e.name), ["mimetype", "Contents/한글.xml", "empty.txt"]);
    assert.equal(got[0].method, 0);
    assert.equal(got[0].offset, 0, "mimetype 이 첫 항목");
    assert.equal(got[1].method, 8);
    assert.equal(got[0].data.toString(), "application/hwp+zip");
    assert.equal(got[1].data.toString(), "<a>".repeat(5000) + "한글");
    assert.equal(got[2].data.length, 0);
    assert.ok(buf.length < 5000 * 3, "deflate 로 줄었다");
  });

  it("외부 unzip 도 CRC 오류 없이 연다", { skip: spawnOk("unzip", ["-v"]) ? false : "unzip 없음" }, () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zip-")), "t.zip");
    fs.writeFileSync(file, createZip([{ name: "mimetype", data: "x", store: true }, { name: "a/b.txt", data: "한글" }]));
    const r = childProcess.spawnSync("unzip", ["-t", file], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});

function spawnOk(cmd, args) {
  return childProcess.spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}

describe("buildAmendmentHwpx", () => {
  const { buildAmendmentHwpx } = amd("hwpx.js");
  const { parseArticle: parse } = amd("units.js");
  const rowsFor = (oldText, newText) => renderArticle(oldText === null ? null : parse(oldText), parse(newText));

  it("OPC 패키지 구성: mimetype 이 맨 앞·무압축, 필수 파일이 모두 있다", () => {
    const entries = readZip(buildAmendmentHwpx(["건축법 일부개정법률안", "신･구조문대비표"], [rowsFor("제1조(가) ① 가는 한다.", "제1조(가) ① 나는 한다.")]));
    assert.equal(entries[0].name, "mimetype");
    assert.equal(entries[0].method, 0);
    assert.equal(entries[0].data.toString(), "application/hwp+zip");
    assert.deepEqual(entries.map((e) => e.name).sort(), [
      "Contents/content.hpf", "Contents/header.xml", "Contents/section0.xml", "META-INF/container.xml", "Preview/PrvText.txt", "mimetype",
    ]);
  });

  it("개정 부분은 밑줄 글자모양, 같은 부분 줄표·머리행 반복, 제어문자는 제거·XML 특수문자는 이스케이프", () => {
    const rows = rowsFor("제1조(가) ① 가는 <한다>.", "제1조(가) ① 서\u0001류는 &한다>.");
    const sec = readZip(buildAmendmentHwpx(["제목", "신･구조문대비표"], [rows])).find((e) => e.name === "Contents/section0.xml").data.toString("utf8");
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(sec), "XML 1.0 금지 제어문자");
    assert.ok(sec.includes("&amp;"), "& 이스케이프");
    assert.ok(sec.includes("&lt;"), "< 이스케이프");
    assert.ok(sec.includes('repeatHeader="1"'), "머리행 반복");
    assert.ok(sec.includes("현      행") && sec.includes("개   정   안"));
    assert.match(sec, /<hp:run charPrIDRef="(\d+)"><hp:t>서류는 &amp;/, "개정 부분 run");
    const header = readZip(buildAmendmentHwpx(["제목"], [rows])).find((e) => e.name === "Contents/header.xml").data.toString("utf8");
    assert.match(header, /underline type="BOTTOM"/, "밑줄 글자모양 정의");
  });
});

// ---------------------------------------------------------------------------
// proxy client + CLI (로컬 http 서버가 k-skill-proxy 응답을 흉내낸다)
// ---------------------------------------------------------------------------

function fakeProxy(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
    const out = handler(url);
    res.writeHead(out.status ?? 200, { "content-type": out.type ?? "application/json" });
    res.end(typeof out.body === "string" ? out.body : JSON.stringify(out.body));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    base: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)),
  })));
}

const drfSearch = { LawSearch: { law: [
  { 현행연혁코드: "현행", 법령일련번호: "290833", 법령명한글: "건축법 시행령", 법령ID: "002118" },
  { 현행연혁코드: "현행", 법령일련번호: "273437", 법령명한글: "건축법", 법령ID: "001823" },
] } };
const drfSearchOne = { LawSearch: { law: { 현행연혁코드: "현행", 법령일련번호: "273437", 법령명한글: "건축법", 법령ID: "001823" } } };

const proxyHandler = (url) => {
  if (url.pathname === "/v1/korean-law/search") return { body: drfSearch };
  if (url.pathname === "/v1/korean-law/detail") return { body: url.searchParams.get("JO") === "002200" ? ARTICLE_22 : lawJson(null) };
  return { status: 404, body: { error: "nf" } };
};

describe("proxy client", () => {
  const { createProxyClient } = amd("current.js");

  it("search 는 target=law, detail 은 target=law+MST+JO+type=JSON 으로 부르고 DRF 응답을 정규화한다", async () => {
    const proxy = await fakeProxy(proxyHandler);
    try {
      const client = createProxyClient({ baseUrl: `${proxy.base}/` });
      assert.deepEqual(await client.searchLaws("건축법"), [
        { lawName: "건축법 시행령", lawId: "002118", mst: "290833", status: "현행" },
        { lawName: "건축법", lawId: "001823", mst: "273437", status: "현행" },
      ]);
      const json = await client.getLawJson({ mst: "273437", jo: "002200" });
      assert.equal(json.법령.조문.조문단위.조문번호, "22");
      assert.deepEqual(proxy.requests.map((r) => r.path), ["/v1/korean-law/search", "/v1/korean-law/detail"]);
      assert.deepEqual(proxy.requests[0].query, { target: "law", query: "건축법", type: "JSON", display: "20" });
      assert.deepEqual(proxy.requests[1].query, { target: "law", MST: "273437", JO: "002200", type: "JSON" });
    } finally { await proxy.close(); }
  });

  it("결과가 1건이면 DRF 가 배열 대신 객체로 준다 — 배열로 맞춘다", async () => {
    const proxy = await fakeProxy(() => ({ body: drfSearchOne }));
    try {
      const laws = await createProxyClient({ baseUrl: proxy.base }).searchLaws("건축법");
      assert.deepEqual(laws.map((l) => l.mst), ["273437"]);
    } finally { await proxy.close(); }
  });

  it("lawId 만 있으면 ID 로 부른다", async () => {
    const proxy = await fakeProxy(proxyHandler);
    try {
      await createProxyClient({ baseUrl: proxy.base }).getLawJson({ lawId: "001823", jo: "002200" });
      assert.deepEqual(proxy.requests[0].query, { target: "law", ID: "001823", JO: "002200", type: "JSON" });
    } finally { await proxy.close(); }
  });

  it("proxy 오류(502 코드·HTML 본문·접속 실패)는 원인이 드러나는 오류로 던진다", async () => {
    const bad = await fakeProxy(() => ({ status: 502, body: { error: "upstream_unstable", message: "법제처 불안정" } }));
    const html = await fakeProxy(() => ({ type: "text/html", body: "<html>점검</html>" }));
    try {
      await assert.rejects(createProxyClient({ baseUrl: bad.base }).searchLaws("건축법"), /upstream_unstable|502/);
      await assert.rejects(createProxyClient({ baseUrl: html.base }).getLawJson({ mst: "1", jo: "000100" }), /JSON/);
      await assert.rejects(createProxyClient({ baseUrl: "http://127.0.0.1:9" }).searchLaws("건축법"), /proxy|fetch|ECONN/i);
    } finally { await bad.close(); await html.close(); }
  });

  it("amendmentTable 이 proxy 오류를 isError 로 돌려준다", async () => {
    const bad = await fakeProxy(() => ({ status: 503, body: { error: "law_oc_missing" } }));
    try {
      const r = await amendmentTable(createProxyClient({ baseUrl: bad.base }), { lawName: "건축법", amendments: [{ text: NEW_22 }] });
      assert.equal(r.isError, true);
      assert.match(r.text, /law_oc_missing|503/);
    } finally { await bad.close(); }
  });
});

describe("CLI amendment_table.js", () => {
  const cli = path.join(root, "amendment_table.js");
  const run = (args, { input, env } = {}) => childProcess.spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8", input, env: { ...process.env, ...env },
  });
  // 같은 프로세스의 가짜 proxy 가 응답하려면 이벤트 루프를 막지 않는 spawn 이어야 한다
  const runAsync = (args, { input, env } = {}) => new Promise((resolve) => {
    const child = childProcess.spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "amd-cli-"));

  it("stdin JSON → proxy 로 현행 조회 → 대비표를 stdout 에, --output 이면 .hwpx 도 저장", async () => {
    const proxy = await fakeProxy(proxyHandler);
    try {
      const out = path.join(tmp(), "sub", "대비표.hwpx");
      const r = await runAsync(["--output", out], { input: JSON.stringify({ lawName: "건축법", amendments: [{ text: NEW_22 }] }), env: { KSKILL_PROXY_BASE_URL: proxy.base } });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.includes("| ② (생  략) | ② (현행과 같음) |"));
      assert.ok(r.stdout.includes(`HWPX 저장: ${out}`));
      const entries = readZip(fs.readFileSync(out));
      assert.equal(entries[0].name, "mimetype");
      assert.match(entries.find((e) => e.name === "Contents/section0.xml").data.toString(), /공사완료도서/);
      assert.deepEqual(proxy.requests.map((q) => q.path), ["/v1/korean-law/search", "/v1/korean-law/detail"]);
    } finally { await proxy.close(); }
  });

  it("--input 파일과 currentText 만 쓰면 네트워크 없이 동작하고, '~/' 경로는 HOME 으로 푼다", () => {
    const dir = tmp();
    const input = path.join(dir, "in.json");
    fs.writeFileSync(input, JSON.stringify({ title: "복무 조례 일부개정조례안", amendments: [{ currentText: "제3조(근무시간) 근무시간은 9시부터 18시까지로 한다.", text: "제3조(근무시간) 근무시간은 8시부터 17시까지로 한다." }] }));
    const r = run(["--input", input, "--output", "~/바탕/대비표.hwpx"], { env: { HOME: dir, KSKILL_PROXY_BASE_URL: "http://127.0.0.1:9" } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes("**9시부터 18시까지**로"));
    assert.ok(fs.existsSync(path.join(dir, "바탕", "대비표.hwpx")));
  });

  it("출력 경로가 .hwpx 가 아니면 파일을 만들지 않고 실패한다", () => {
    const dir = tmp();
    const r = run(["--output", path.join(dir, "x.docx")], { input: JSON.stringify({ amendments: [{ currentText: "제1조(가) 가.", text: "제1조(가) 나." }] }) });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /\.hwpx/);
    assert.equal(fs.existsSync(path.join(dir, "x.docx")), false);
  });

  it("깨진 JSON·검증 실패는 비0 종료와 한국어 안내", () => {
    const bad = run([], { input: "{not json" });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /JSON/);
    const invalid = run([], { input: JSON.stringify({ amendments: [{ text: NEW_22 }] }) });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /lawName|currentText/);
  });

  it("개정 후 모양이 현행과 모두 같으면 NO_CHANGE 로 알리고 .hwpx 를 만들지 않는다", () => {
    const dir = tmp();
    const out = path.join(dir, "n.hwpx");
    const r = run(["--output", out], { input: JSON.stringify({ amendments: [{ currentText: "제3조(가) 가는 한다.", text: "제3조(가) 가는 한다." }] }) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes("[NO_CHANGE]"));
    assert.equal(fs.existsSync(out), false);
  });
});
