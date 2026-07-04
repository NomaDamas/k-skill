# S2B 학교장터 공고 조회 가이드

`s2b-notice-search`는 S2B 학교장터 공개 고객 공고/견적요청 조회 화면을 브라우저 우선으로 확인하고, 같은 조건을 재현할 수 있는 POST form recipe와 fixture HTML parser를 제공하는 read-only 스킬이다.

## 이 기능으로 할 수 있는 일

- 키워드, 학교/기관명, 지역, 게시일 범위로 S2B 공고 후보 조회
- 물품/공사/용역 및 1인/2인 수의계약 조건 정규화
- `/S2BNCustomer/tcmo001.do`의 `tcmo001Form` 실제 POST body 생성
- 목록 HTML fixture에서 공고/견적 코드, 제목, 기관, 상태, 품목구분, 게시일, 마감일 추출
- 상세 HTML fixture에서 본문, 공고번호, 기관, 계약방법, 첨부 action metadata 추출

## 접근 경로

```text
https://www.s2b.kr/S2BNCustomer/tcmo001.do
```

S2B는 브라우저 session/form state에 의존할 수 있으므로 자동화 순서는 다음으로 고정한다.

1. Aside Browser REPL snapshot/action
2. BrowserOS CDP(사용자가 띄운 세션) 또는 로컬 브라우저
3. Direct HTTP best-effort, 같은 session/form 조건이 동작할 때만 사용

## 입력 제한

| 조건 | 설명 |
| --- | --- |
| 날짜 | `YYYYMMDD` 또는 `YYYY-MM-DD` |
| 기간 | 시작일~종료일이 3 calendar months를 넘으면 실패 |
| 품목 | `물품`, `공사`, `용역`, `all` |
| 수의계약 | `1인`, `2인`, `all` |
| 페이지 | 1 이상의 정수 |

## 사용 예시

```js
const {
  buildBrowserAutomationInstructions,
  buildSearchRequest,
  normalizeSearchOptions,
  parseListHtml
} = require("s2b-notice-search")

const options = normalizeSearchOptions({
  keyword: "급식",
  organization: "초등학교",
  dateStart: "2026-06-01",
  dateEnd: "2026-06-30",
  itemType: "물품",
  privateContract: "1인",
  region: "서울",
  page: 1
})

const request = buildSearchRequest(options)
const automation = buildBrowserAutomationInstructions(options)
const rows = parseListHtml("<table>...</table>")
```

`buildSearchRequest()`가 만드는 주요 form field는 S2B 화면에서 확인한 이름을 그대로 따른다: `forwardName=list01`, `pageNo`, `search_yn=Y`, `process_yn=Y`, `tender_sep1`, `tender_name`, `company_name_s`, `tender_sep2`, `tender_date_start`, `tender_date_end`, `tender_item`, `estimate_kind`, `areaKind`.

## 실패 모드

- malformed curl/client error: form encoding, referer, cookie, timeout 문제
- login/CAPTCHA/blocked: 로그인, CAPTCHA, 점검, 보안 차단 페이지
- empty: 실제 결과 없음 또는 session/form state 불일치
- upstream markup change: 목록/상세 table, JavaScript action, hidden field 변경

## 정책 경계

- 조회 전용이다.
- 로그인, 견적 제출, 입찰 참여, 계약, 결제, 마이페이지 자동화는 하지 않는다.
- 공개 endpoint가 API key를 요구하지 않으므로 `k-skill-proxy`에 넣지 않는다.
