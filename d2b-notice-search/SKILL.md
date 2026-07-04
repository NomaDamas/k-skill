---
name: d2b-notice-search
description: 국방전자조달시스템(D2B) 공개 입찰공고 검색 화면에서 공고건명·공고구분·공고/개찰일·G2B공고번호·발주기관 조건으로 공고를 조회한다.
license: MIT
metadata:
  category: procurement
  locale: ko-KR
  phase: v1
---

# D2B Notice Search

## What this skill does

국방전자조달시스템(D2B, `www.d2b.go.kr`)의 공개 `입찰공고` 검색 화면을 브라우저로 읽어 국방 조달 공고 후보를 조회한다.

- 공고건명 키워드로 검색한다.
- 공고구분을 정상공고, 긴급공고, 정정공고, 취소공고, 연기공고, 재공고로 좁힌다.
- 개찰일자 또는 공고일자 기준 기간을 지정한다.
- G2B공고번호와 발주기관 조건을 함께 사용할 수 있다.
- 렌더링된 목록/최근 공고 링크의 제목, 공고번호, 업무구분, 게시일을 추출한다.

입찰, 투찰, 서류 제출, 로그인, 공동인증서/보안 프로그램 조작, 결제는 하지 않는다.

## When to use

- "국방전자조달 냉난방기 공고 찾아줘"
- "D2B 긴급 물품 공고 조회"
- "국방전자조달시스템에서 G2B공고번호로 찾아줘"
- "방위사업청 입찰공고 최신 목록 보여줘"

## Prerequisites

- 인터넷 연결
- Node.js 18+
- 기본: Aside Browser
- fallback: 사용자가 띄운 BrowserOS 세션에 CDP로 붙거나(권장), 로컬 브라우저 사용

## Public access path discovered

### Primary source: official D2B rendered search form

Entry point:

```text
https://www.d2b.go.kr/index.do
```

Observed public `입찰공고` fields:

| Field | Meaning |
| --- | --- |
| `공고건명` | notice title keyword |
| `공고구분` | 정상공고 `A`, 긴급공고 `B`, 정정공고 `H`, 취소공고 `J`, 연기공고 `K`, 재공고 `D` |
| `공고/개찰일` | 개찰일자 `1`, 공고일자 `2` |
| 시작/마지막 날짜 | date range |
| `G2B공고번호` | G2B notice number |
| `발주기관` | ordering organization |

Discovery result: the home page renders a public search form and recent bid links without login. Direct probes to `https://www.d2b.go.kr/openapi/sealedBidAnnounceList.json` can return `400 Bad Request` / deceptive request routing HTML, so browser automation is the stable primary route.

No `k-skill-proxy` route is used because the public page does not require an API key. If a separate free API key route is later confirmed, it must be narrow, allowlisted, cache-backed, and documented before proxying.

## Workflow

### 1. Build a search recipe

```js
const { buildBrowserAutomationInstructions } = require("d2b-notice-search")

const instructions = buildBrowserAutomationInstructions({
  keyword: "냉난방기",
  kind: "물품",
  noticeType: "긴급공고",
  dateType: "공고일자",
  dateStart: "2026-07-01",
  dateEnd: "2026-08-30",
  organization: "해병"
})
```

### 2. Execute with Aside Browser first

1. Open `https://www.d2b.go.kr/index.do`.
2. Snapshot the `입찰공고` area.
3. Fill 공고건명, 공고구분, 공고/개찰일, date range, G2B공고번호, and 발주기관 as needed.
4. Click `검색`.
5. Snapshot the resulting list or recent notice links and extract visible fields.

### 3. Fallback order

1. Aside Browser against the official rendered page.
2. A user-launched BrowserOS session over CDP (or a local browser you own) with the same public form interactions.
3. Direct HTTP best-effort only. Treat `400 Bad Request`, `deceptive request routing`, TouchEn/security, login, CAPTCHA, queue, or maintenance HTML as an explicit blocked state, not as empty results.

## Supported aliases

| Input aliases | Normalized value |
| --- | --- |
| `물품`, `goods`, `pdb` | `PDB` |
| `용역`, `service`, `services`, `psb` | `PSB` |
| `공사`, `works`, `construction`, `pcb` | `PCB` |
| `국외`, `foreign`, `peb` | `PEB` |
| `정상공고`, `normal`, `A` | `A` |
| `긴급공고`, `urgent`, `B` | `B` |
| `정정공고`, `H` | `H` |
| `취소공고`, `J` | `J` |
| `연기공고`, `K` | `K` |
| `재공고`, `D` | `D` |
| `개찰일자`, `open`, `opening`, `1` | `1` |
| `공고일자`, `posted`, `notice`, `2` | `2` |

## Done when

- The official D2B page was opened through Aside Browser or the documented browser fallback.
- The visible search form was filled with the requested conditions.
- Results or an explicit no-results/blocked state were captured from the rendered page.
- Direct HTTP failures were classified as blocked/security routing when they return 400/security HTML.
- No login, bidding, signature, payment, or security bypass was attempted.

## Failure modes

- D2B may change Vue/component markup, placeholders, JavaScript action names, or the openapi route.
- Direct HTTP may return `400 Bad Request`, traffic/security routing HTML, or maintenance pages.
- Browser automation can be blocked by security software, certificate prompts, CAPTCHA, login walls, or site maintenance.
- Date ranges wider than 12 months are rejected by this package to keep user queries narrow.
- Rendered results can differ by current D2B service state; cite the official D2B URL and visible timestamp/context when answering.
