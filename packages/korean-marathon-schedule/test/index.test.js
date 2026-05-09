const test = require("node:test")
const assert = require("node:assert/strict")

const {
  parseGorunningList,
  parseGorunningDetail,
  parseTriathlonList,
  parseTriathlonDetail,
  searchEvents
} = require("../src/index")

const gorunningListHtml = `<!doctype html><html><body>
<h3> 09월 12일 (토) 4개 대회</h3>
<a href="/races/1070/2nd-chorokwooson-runway-marathon/">제2회 초록우산 런웨이 마라톤</a>
<a href="https://gorunning.kr/races/1071/white-run/">제2회 화이트런 생리대 기부마라톤</a>
<a href="/blog/not-a-race/">블로그</a>
</body></html>`

const gorunningDetailHtml = `<!doctype html><html><body>
<h1>제2회 초록우산 런웨이 마라톤</h1>
<p>하프 10km 5km 3km 걷기 3km 걷기(어린이)</p>
<p>2026/09/12 (토) 08:00 D-127</p>
<p>대전 대전엑스포시민광장</p>
<p>지금 참가 신청 가능</p>
<p>접수 마감: 8월 1일 (D-86) · 공식 사이트에서 참가비·정원 확인</p>
<h2>대회 정보</h2>
<p>주최자</p><p>초록우산 대전세종지역본부</p>
<p>등록 기간</p><p>2026/04/13 ~ 2026/08/01 등록중 마감 D-86</p>
<p>웹사이트</p><a href="https://mara1080.com/event/abc">https://mara1080.com/event/abc</a>
<p>주소</p><p>대전엑스포시민광장</p>
<p>정보 검증</p><p>2026년 4월 14일 확인됨</p>
</body></html>`

const triathlonListHtml = `<!doctype html><html><body>
<table><tbody>
<tr><td>대회정보</td><td>대회일정</td><td>신청/기록</td></tr>
<tr>
<td>접수중 <a href="/events/tour/overview/?mode=overview&tourcd=2085">2026 고령군수배 대가야 전국 철인3종 대회</a> 장소: 경북 고령군 대가야생활촌 일원 코스: 생활체육(스탠다드)</td>
<td>2026.06.21</td><td>신청</td>
</tr>
</tbody></table>
</body></html>`

const triathlonDetailHtml = `<!doctype html><html><body>
<h2>2026 고령군수배 대가야 전국 철인3종 대회</h2>
<table>
<tr><th>대회명</th><td>2026 고령군수배 대가야 전국 철인3종 대회</td></tr>
<tr><th>대회기간</th><td>2026-06-21</td></tr>
<tr><th>대회장소</th><td>경북 고령군 대가야생활촌 일원</td></tr>
<tr><th>주최</th><td>고령군체육회</td></tr>
<tr><th>접수기간</th><td>2026-04-27 14:00 ~ 2026-05-10 18:00</td></tr>
</table>
<p>코스: 생활체육(스탠다드), 릴레이</p>
</body></html>`

test("parseGorunningList extracts unique race detail URLs", () => {
  assert.deepEqual(parseGorunningList(gorunningListHtml), [
    "https://gorunning.kr/races/1070/2nd-chorokwooson-runway-marathon/",
    "https://gorunning.kr/races/1071/white-run/"
  ])
})

test("parseGorunningDetail normalizes venue, deadline, and categories", () => {
  const event = parseGorunningDetail(gorunningDetailHtml, "https://gorunning.kr/races/1070/2nd-chorokwooson-runway-marathon/")

  assert.equal(event.source, "gorunning")
  assert.equal(event.type, "marathon")
  assert.equal(event.title, "제2회 초록우산 런웨이 마라톤")
  assert.equal(event.eventDate, "2026-09-12")
  assert.equal(event.region, "대전")
  assert.equal(event.venue, "대전엑스포시민광장")
  assert.equal(event.registrationDeadline, "2026-08-01")
  assert.equal(event.registrationPeriod.start, "2026-04-13")
  assert.equal(event.registrationPeriod.end, "2026-08-01")
  assert.equal(event.status, "등록중")
  assert.deepEqual(event.categories, ["Half", "10km", "5km", "3km 걷기", "3km 걷기(어린이)"])
  assert.equal(event.organizer, "초록우산 대전세종지역본부")
  assert.equal(event.officialUrl, "https://mara1080.com/event/abc")
})

test("parseTriathlonList extracts official federation detail URLs with list categories", () => {
  assert.deepEqual(parseTriathlonList(triathlonListHtml), [
    {
      url: "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2085",
      categories: ["생활체육(스탠다드)"]
    }
  ])
})

test("parseTriathlonDetail normalizes course and registration deadline", () => {
  const event = parseTriathlonDetail(triathlonDetailHtml, "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2085")

  assert.equal(event.source, "triathlon.or.kr")
  assert.equal(event.type, "triathlon")
  assert.equal(event.title, "2026 고령군수배 대가야 전국 철인3종 대회")
  assert.equal(event.eventDate, "2026-06-21")
  assert.equal(event.region, "경북")
  assert.equal(event.venue, "경북 고령군 대가야생활촌 일원")
  assert.equal(event.registrationDeadline, "2026-05-10")
  assert.equal(event.registrationPeriod.start, "2026-04-27")
  assert.equal(event.registrationPeriod.end, "2026-05-10")
  assert.deepEqual(event.categories, ["생활체육(스탠다드)", "릴레이"])
  assert.equal(event.organizer, "고령군체육회")
})

test("searchEvents fetches marathon and optional triathlon details with filters", async () => {
  const seen = []
  const fetcher = async (url) => {
    seen.push(String(url))
    if (String(url) === "https://gorunning.kr/races/") return htmlResponse(gorunningListHtml)
    if (String(url).includes("1070")) return htmlResponse(gorunningDetailHtml)
    if (String(url).includes("1071")) return htmlResponse(gorunningDetailHtml.replaceAll("초록우산", "화이트런").replaceAll("대전", "서울").replaceAll("대전엑스포시민광장", "서울광장"))
    if (String(url).startsWith("https://triathlon.or.kr/events/tour/")) {
      if (String(url).includes("overview")) return htmlResponse(triathlonDetailHtml)
      return htmlResponse(triathlonListHtml)
    }
    return new Response("not found", { status: 404 })
  }

  const result = await searchEvents({
    query: "대전",
    from: "2026-06-01",
    to: "2026-12-31",
    includeTriathlon: true,
    limit: 5,
    fetcher
  })

  assert.equal(result.query, "대전")
  assert.deepEqual(result.warnings, [])
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].title, "제2회 초록우산 런웨이 마라톤")
  assert.equal(result.items[0].registrationDeadline, "2026-08-01")
  assert.ok(seen.includes("https://gorunning.kr/races/"))
  assert.ok(seen.includes("https://triathlon.or.kr/events/tour/?sYear=2026&vType=list"))
})

test("searchEvents preserves triathlon list categories when detail omits course text", async () => {
  const fetcher = async (url) => {
    if (String(url) === "https://gorunning.kr/races/") return htmlResponse("")
    if (String(url).startsWith("https://triathlon.or.kr/events/tour/")) {
      if (String(url).includes("overview")) {
        return htmlResponse(triathlonDetailHtml.replace("<p>코스: 생활체육(스탠다드), 릴레이</p>", ""))
      }
      return htmlResponse(triathlonListHtml)
    }
    return new Response("not found", { status: 404 })
  }

  const result = await searchEvents({
    query: "고령",
    from: "2026-01-01",
    to: "2026-12-31",
    includeTriathlon: true,
    fetcher
  })

  assert.equal(result.items.length, 1)
  assert.deepEqual(result.items[0].categories, ["생활체육(스탠다드)"])
})

test("searchEvents returns successful marathon results with warnings when triathlon source fails", async () => {
  const fetcher = async (url) => {
    if (String(url) === "https://gorunning.kr/races/") return htmlResponse(gorunningListHtml)
    if (String(url).includes("1070")) return htmlResponse(gorunningDetailHtml)
    if (String(url).includes("1071")) return new Response("temporary upstream failure", { status: 503 })
    if (String(url).startsWith("https://triathlon.or.kr/events/tour/")) {
      return new Response("triathlon unavailable", { status: 502 })
    }
    return new Response("not found", { status: 404 })
  }

  const result = await searchEvents({
    query: "대전",
    from: "2026-06-01",
    to: "2026-12-31",
    includeTriathlon: true,
    fetcher
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].title, "제2회 초록우산 런웨이 마라톤")
  assert.match(result.warnings.join("\n"), /gorunning detail failed/)
  assert.match(result.warnings.join("\n"), /triathlon source failed/)
})

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  })
}
