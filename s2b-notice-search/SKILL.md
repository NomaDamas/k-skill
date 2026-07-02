---
name: s2b-notice-search
description: S2B 학교장터 공개 고객 공고/견적요청 목록을 브라우저 우선으로 조회하고 fixture HTML을 파싱해 공고 메타데이터를 정리한다.
license: MIT
metadata:
  category: procurement
  locale: ko-KR
  phase: v1
---

# S2B Notice Search

## What this skill does

S2B 학교장터(`www.s2b.kr`)의 공개 고객 공고/견적요청 표면에서 학교·교육기관 관련 물품, 공사, 용역 공고를 조회하는 read-only 스킬이다.

- 키워드, 기관명, 지역, 게시일 범위, 물품/공사/용역, 1인/2인 수의계약 조건을 정규화한다.
- `/S2BNCustomer/tcmo001.do` 검색 폼에 보낼 실제 `tcmo001Form` POST form recipe를 만든다.
- 목록 fixture HTML에서 공고/견적 코드, 제목, 기관, 상태, 품목구분, 게시일, 마감일, 상세 JavaScript action metadata를 추출한다.
- 상세 fixture HTML에서 제목, 공고번호, 기관명, 품목구분, 계약방법, 게시일, 마감일, 본문, 첨부 action metadata를 추출한다.

입찰 참여, 견적 제출, 로그인, 결제, 낙찰/계약 처리 자동화는 하지 않는다.

## Public path discovered from Aside

Aside Browser로 S2B 공개 고객 화면을 확인할 때 우선 진입점은 다음이다.

```text
https://www.s2b.kr/S2BNCustomer/tcmo001.do
```

이 화면은 학교장터 고객용 공고/견적요청 조회 폼으로 동작하며, 브라우저에서 검색 조건을 채운 뒤 폼 제출 결과 표와 상세 이동 JavaScript action을 관찰한다. 확인된 form 이름은 `tcmo001Form`이고 주요 field는 `forwardName=list01`, `pageNo`, `search_yn=Y`, `process_yn=Y`, `tender_sep1`, `tender_name`, `company_name_s`, `tender_sep2`, `tender_date_start`, `tender_date_end`, `tender_item`, `estimate_kind`, `areaKind`다.

## Fallback order

1. Aside Browser REPL snapshot/action: 공개 페이지를 열고 snapshot으로 검색 폼과 결과 테이블을 확인한 뒤, 입력/제출/action metadata를 브라우저 표면에서 읽는다.
2. Playwright 또는 Chrome headless: Aside를 사용할 수 없으면 새 browser context로 `https://www.s2b.kr/S2BNCustomer/tcmo001.do`를 열고 검색 폼을 제출한 뒤 렌더링된 목록/상세 HTML을 파싱한다.
3. Direct HTTP best-effort: 같은 session cookie, referer, form token 조건이 브라우저와 동일하게 동작할 때만 `/S2BNCustomer/tcmo001.do`에 POST form body를 보낸다. session/form이 맞지 않으면 브라우저 경로로 돌아간다.

## Inputs

| Input | Values |
| --- | --- |
| `keyword` | 검색어 |
| `organization` | 기관/학교명 |
| `dateStart`, `dateEnd` | `YYYYMMDD` 또는 `YYYY-MM-DD`; 3 calendar months 초과 금지 |
| `itemType` | `물품`, `공사`, `용역`, `all` |
| `privateContract` | `1인`, `2인`, `all` |
| `region` | 지역명 |
| `page` | 1 이상의 정수 |

## Package use

```js
const {
  buildBrowserAutomationInstructions,
  buildSearchRequest,
  normalizeSearchOptions,
  parseDetailHtml,
  parseListHtml
} = require("s2b-notice-search")
```

## Failure modes

- malformed curl/client error: form body, cookies, referer, encoding, or client timeout이 잘못되어 S2B가 정상 HTML을 반환하지 않는다.
- login/CAPTCHA/blocked: 로그인 벽, CAPTCHA, 차단/점검/보안 페이지가 나오면 우회하지 않고 실패로 분류한다.
- empty: 검색 조건이 실제로 결과 없음이거나 session/form state가 맞지 않아 빈 목록이 반환된다.
- upstream markup change: S2B table, 상세 action, hidden input, JavaScript 함수명이 바뀌면 파싱 결과가 부분적이거나 비어 있을 수 있다.

## Done when

- Aside Browser 또는 fallback browser에서 공개 S2B 조회 표면을 열었다.
- 검색 기간이 유효하고 3 calendar months를 넘지 않는다.
- 목록/상세 fixture parser가 필요한 필드를 추출했다.
- 결과는 read-only lookup으로만 사용하고 제출/계약/로그인 자동화는 하지 않았다.
