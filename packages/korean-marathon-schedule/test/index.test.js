const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")

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



test("parseGorunningList ignores off-origin race detail links", () => {
  const html = `<!doctype html><html><body>
<a href="https://evil.example/races/123/fake/">악성 외부 링크</a>
<a href="/races/1070/2nd-chorokwooson-runway-marathon/">정상 대회</a>
</body></html>`

  assert.deepEqual(parseGorunningList(html), [
    "https://gorunning.kr/races/1070/2nd-chorokwooson-runway-marathon/"
  ])
})

test("parseTriathlonList ignores off-origin federation detail links", () => {
  const html = `<!doctype html><html><body>
<a href="https://evil.example/events/tour/overview/?mode=overview&tourcd=9999">외부 철인3종 링크</a>
<a href="/events/tour/overview/?mode=overview&tourcd=2085">정상 철인3종 대회</a>
</body></html>`

  assert.deepEqual(parseTriathlonList(html), [
    {
      url: "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2085",
      categories: []
    }
  ])
})

test("parseTriathlonList filters education and admin entries before detail fetch", () => {
  const html = `<!doctype html><html><body><table><tbody>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=3001">2026 철인3종 2차 대회규정 정기 교육</a> 장소: 서울 교육장</td></tr>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=2085">2026 고령군수배 대가야 전국 철인3종 대회</a> 장소: 경북 고령군 코스: 생활체육(스탠다드)</td></tr>
</tbody></table></body></html>`

  assert.deepEqual(parseTriathlonList(html), [
    {
      url: "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2085",
      categories: ["생활체육(스탠다드)"]
    }
  ])
})

test("searchEvents continues past pre-filter windows until GoRunning matches are collected", async () => {
  const links = Array.from({ length: 31 }, (_, index) => {
    const id = 2000 + index
    return `<a href="/races/${id}/race-${index + 1}/">대회 ${index + 1}</a>`
  }).join("\n")
  const fetcher = async (url) => {
    const textUrl = String(url)
    if (textUrl === "https://gorunning.kr/races/") return htmlResponse(`<!doctype html><html><body>${links}</body></html>`)
    const id = Number(textUrl.match(/\/races\/(\d+)\//)?.[1])
    const isJeju = id === 2030
    return htmlResponse(`<!doctype html><html><body>
<h1>${isJeju ? "제주 바다 마라톤" : `서울 준비 대회 ${id}`}</h1>
<p>10km</p>
<p>2026/05/10 (일) 08:00</p>
<p>${isJeju ? "제주 월드컵경기장" : "서울 광장"}</p>
<p>주소</p><p>${isJeju ? "제주 월드컵경기장" : "서울 광장"}</p>
</body></html>`)
  }

  const result = await searchEvents({
    query: "제주",
    from: "2026-01-01",
    to: "2026-12-31",
    limit: 10,
    fetcher
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].title, "제주 바다 마라톤")
  assert.deepEqual(result.warnings, [])
})

test("searchEvents continues past pre-filter windows until triathlon matches are collected", async () => {
  const links = Array.from({ length: 21 }, (_, index) => {
    const tourcd = 4000 + index
    const title = index === 20 ? "2026 제주 국제 철인3종 대회" : `2026 서울 철인3종 대회 ${index + 1}`
    return `<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=${tourcd}">${title}</a> 장소: ${index === 20 ? "제주 서귀포" : "서울 한강"} 코스: 스탠다드</td></tr>`
  }).join("\n")
  const fetcher = async (url) => {
    const textUrl = String(url)
    if (textUrl === "https://gorunning.kr/races/") return htmlResponse("")
    if (textUrl.startsWith("https://triathlon.or.kr/events/tour/") && !textUrl.includes("overview")) {
      return htmlResponse(`<!doctype html><html><body><table>${links}</table></body></html>`)
    }
    const tourcd = Number(new URL(textUrl).searchParams.get("tourcd"))
    const isJeju = tourcd === 4020
    return htmlResponse(`<!doctype html><html><body>
<h2>${isJeju ? "2026 제주 국제 철인3종 대회" : `2026 서울 철인3종 대회 ${tourcd}`}</h2>
<table>
<tr><th>대회명</th><td>${isJeju ? "2026 제주 국제 철인3종 대회" : `2026 서울 철인3종 대회 ${tourcd}`}</td></tr>
<tr><th>대회기간</th><td>2026-07-01</td></tr>
<tr><th>대회장소</th><td>${isJeju ? "제주 서귀포시" : "서울 한강"}</td></tr>
<tr><th>접수기간</th><td>2026-05-01 ~ 2026-06-01</td></tr>
</table>
</body></html>`)
  }

  const result = await searchEvents({
    query: "제주",
    from: "2026-01-01",
    to: "2026-12-31",
    includeTriathlon: true,
    limit: 10,
    fetcher
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].title, "2026 제주 국제 철인3종 대회")
  assert.deepEqual(result.warnings, [])
})



test("searchEvents warns when a configurable detail budget is exhausted before source list end", async () => {
  const links = Array.from({ length: 6 }, (_, index) => {
    const id = 5000 + index
    return `<a href="/races/${id}/race-${index + 1}/">대회 ${index + 1}</a>`
  }).join("\n")
  const fetcher = async (url) => {
    const textUrl = String(url)
    if (textUrl === "https://gorunning.kr/races/") return htmlResponse(`<!doctype html><html><body>${links}</body></html>`)
    return htmlResponse(`<!doctype html><html><body>
<h1>서울 준비 대회</h1>
<p>2026/05/10 (일) 08:00</p>
<p>서울 광장</p>
<p>주소</p><p>서울 광장</p>
</body></html>`)
  }

  const result = await searchEvents({
    query: "제주",
    from: "2026-01-01",
    to: "2026-12-31",
    limit: 10,
    maxDetailsPerSource: 3,
    fetcher
  })

  assert.equal(result.items.length, 0)
  assert.match(result.warnings.join("\n"), /gorunning detail budget exhausted after 3 of 6 source links/)
})

test("searchEvents applies one triathlon detail budget across selected years", async () => {
  const seenDetails = []
  const fetcher = async (url) => {
    const textUrl = String(url)
    if (textUrl === "https://gorunning.kr/races/") return htmlResponse("")
    if (textUrl === "https://triathlon.or.kr/events/tour/?sYear=2026&vType=list") {
      return htmlResponse(`<!doctype html><html><body><table>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=6101">2026 서울 철인3종 대회</a> 장소: 서울 코스: 스탠다드</td></tr>
</table></body></html>`)
    }
    if (textUrl === "https://triathlon.or.kr/events/tour/?sYear=2027&vType=list") {
      return htmlResponse(`<!doctype html><html><body><table>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=7101">2027 제주 철인3종 대회</a> 장소: 제주 코스: 스탠다드</td></tr>
</table></body></html>`)
    }
    if (textUrl.includes("/events/tour/overview/")) {
      seenDetails.push(textUrl)
      const tourcd = new URL(textUrl).searchParams.get("tourcd")
      return htmlResponse(`<!doctype html><html><body>
<h2>${tourcd} 철인3종 대회</h2>
<table>
<tr><th>대회명</th><td>${tourcd} 철인3종 대회</td></tr>
<tr><th>대회기간</th><td>${tourcd === "6101" ? "2026" : "2027"}-07-01</td></tr>
<tr><th>대회장소</th><td>서울 한강</td></tr>
</table>
</body></html>`)
    }
    return new Response("not found", { status: 404 })
  }

  const result = await searchEvents({
    query: "부산",
    from: "2026-01-01",
    to: "2027-12-31",
    includeTriathlon: true,
    limit: 5,
    maxDetailsPerSource: 1,
    fetcher
  })

  assert.equal(result.items.length, 0)
  assert.equal(seenDetails.length, 1)
  assert.deepEqual(seenDetails, [
    "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=6101"
  ])
  assert.match(result.warnings.join("\n"), /triathlon detail budget exhausted after 1 of 2 source links/)
})

test("CLI help documents max-details-per-source budget option", () => {
  const result = spawnSync(process.execPath, ["src/cli.js", "--help"], {
    cwd: __dirname + "/..",
    encoding: "utf8"
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /--max-details-per-source <number>/)
})

test("CLI maps max-details-per-source argument to search options", () => {
  const { parseArgs } = require("../src/cli")

  const options = parseArgs([
    "고령",
    "--from",
    "2026-01-01",
    "--include-triathlon",
    "--max-details-per-source",
    "7"
  ])

  assert.equal(options.maxDetailsPerSource, 7)
})

test("parseTriathlonList keeps race rows isolated from neighboring education rows", () => {
  const html = `<!doctype html><html><body><table><tbody>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=3001">2026 철인3종 2차 대회규정 정기 교육</a> 장소: 서울 교육장</td></tr>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=2085">2026 고령군수배 대가야 전국 철인3종 대회</a> 장소: 경북 고령군 코스: 생활체육(스탠다드)</td></tr>
<tr><td>교육 신청 안내</td></tr>
</tbody></table></body></html>`

  assert.deepEqual(parseTriathlonList(html), [
    {
      url: "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2085",
      categories: ["생활체육(스탠다드)"]
    }
  ])
})



test("parseTriathlonList extracts categories from each race row without neighboring leakage", () => {
  const html = `<!doctype html><html><body><table><tbody>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=2084">2026 부산 철인3종 대회</a> 장소: 부산 코스: 스프린트</td></tr>
<tr><td><a href="/events/tour/overview/?mode=overview&tourcd=2085">2026 제주 철인3종 대회</a> 장소: 제주 코스: 올림픽</td></tr>
</tbody></table></body></html>`

  assert.deepEqual(parseTriathlonList(html), [
    {
      url: "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2084",
      categories: ["스프린트"]
    },
    {
      url: "https://triathlon.or.kr/events/tour/overview/?mode=overview&tourcd=2085",
      categories: ["올림픽"]
    }
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

test("parseGorunningDetail infers region from event location before unrelated page text", () => {
  const yonginHtml = `<!doctype html><html><body>
<nav>서울 인기 마라톤 바로가기</nav>
<h1>2026 용인마라톤</h1>
<p>10km 5km</p>
<p>2026/06/06 (토) 08:00 D-30</p>
<p>경기도 용인특례시청 잔디광장</p>
<p>등록 기간</p><p>2026/04/01 ~ 2026/05/15 등록중</p>
<p>주소</p><p>경기도 용인특례시청 잔디광장</p>
</body></html>`

  const event = parseGorunningDetail(yonginHtml, "https://gorunning.kr/races/9999/yongin-marathon/")

  assert.equal(event.region, "경기")
  assert.equal(event.venue, "경기도 용인특례시청 잔디광장")
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
