# 국방전자조달시스템 공고 조회 가이드

`d2b-notice-search`는 국방전자조달시스템(D2B, `www.d2b.go.kr`)의 공개 `입찰공고` 검색 화면을 브라우저로 조회하는 read-only 스킬이다. 직접 HTTP OpenAPI probe는 보안 라우팅 HTML을 반환할 수 있으므로 기본 경로가 아니다.

## 이 기능으로 할 수 있는 일

- D2B 입찰공고 키워드 검색
- 공고구분 필터: 정상공고, 긴급공고, 정정공고, 취소공고, 연기공고, 재공고
- 개찰일자 또는 공고일자 기준 기간 검색
- G2B공고번호와 발주기관 조건 검색
- 렌더링된 공고 링크에서 제목, 공고번호, 업무구분, 게시일 추출

## 가장 중요한 정책 경계

- Aside Browser를 기본으로 사용한다.
- Aside Browser가 불가능하면 Playwright 또는 Chrome headless로 동일한 공개 화면을 조작한다.
- 직접 HTTP는 best-effort이며, `400 Bad Request`/security HTML은 blocked로 분류한다.
- 공개 화면이므로 API key 없는 경로를 `k-skill-proxy`로 우회하지 않는다.
- 로그인, 투찰, 서류 제출, 공동인증서, 결제, 보안 프로그램 우회는 하지 않는다.

## 공개 접근 경로

공식 진입점:

```text
https://www.d2b.go.kr/index.do
```

검색 조건:

| 목적 | 입력 |
| --- | --- |
| 제목 검색 | `공고건명` |
| 공고구분 | 정상공고 `A`, 긴급공고 `B`, 정정공고 `H`, 취소공고 `J`, 연기공고 `K`, 재공고 `D` |
| 날짜 기준 | 개찰일자 `1`, 공고일자 `2` |
| 날짜 범위 | 시작날짜, 마지막날짜 |
| 번호 검색 | `G2B공고번호` |
| 기관 검색 | `발주기관` |

## 사용 예시

```js
const { buildBrowserAutomationInstructions, parseListHtml } = require("d2b-notice-search")

const instructions = buildBrowserAutomationInstructions({
  keyword: "냉난방기",
  kind: "물품",
  noticeType: "긴급공고",
  dateType: "공고일자",
  dateStart: "2026-07-01",
  dateEnd: "2026-08-30"
})

console.log(instructions.steps)
```

## 출력 필드

렌더링된 링크 파서가 확인하는 필드:

- `noticeNo`: JavaScript detail action의 첫 번째 인자
- `kind`: 업무구분 코드
- `title`: 화면에 보이는 공고 제목
- `postedDate`: 링크 주변의 날짜 텍스트
- `action`: 원본 JavaScript function name과 args

## 실패 모드

- D2B 화면 구조, placeholder, JavaScript function name 변경
- direct HTTP `400 Bad Request` 또는 deceptive/security routing HTML
- TouchEn/security module, CAPTCHA, login wall, 점검 페이지
- 너무 넓은 날짜 범위 또는 사이트 정책상 빈 결과

## Done when

- 공식 D2B 페이지가 Aside Browser 또는 browser fallback으로 열렸다.
- 요청 조건이 공개 `입찰공고` 검색 폼에 입력되었다.
- 결과 목록, 최근 공고 링크, 빈 결과, 또는 blocked 상태가 실제 화면 evidence로 남았다.
- 로그인/투찰/결제/서명/보안 우회 없이 read-only 조회로 종료했다.
