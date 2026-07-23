---
name: korean-heritage-search
description: Search official Korean national heritage records, details, locations, and monthly heritage events from the Korea Heritage Service Open API.
license: MIT
metadata:
  category: history
  locale: ko-KR
  phase: v1
---

# 한국 국가유산 검색

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

국가유산청(현 국가유산청 영문 Korea Heritage Service)의 공식 Open API에서 국가유산 목록·상세정보와 월별 국가유산 활용 행사를 조회한다.

v1은 공식 XML API를 직접 호출하며, 별도 API key·로그인·프록시가 필요 없다.

- 국가유산명·지역 기준 검색
- 국가유산 상세 설명·주소·좌표·이미지 조회
- 연도·월별 국가유산 행사 조회

## When to use

- "경복궁 관련 국가유산 찾아줘"
- "서울 국보 목록 보여줘"
- "숭례문 역사와 주소 알려줘"
- "이번 달 국가유산 행사 알려줘"
- "전주 지역 국가유산을 검색해줘"

## When not to use

- 현재 입장 가능 여부, 운영시간, 입장료를 확정해야 하는 경우
- 실시간 통제·혼잡도·주차 가능 여부가 필요한 경우
- 예매·결제·행사 신청을 자동화해야 하는 경우

## Prerequisites

- 인터넷 연결
- Python 3.10+
- 설치된 skill payload 안에 `scripts/korean_heritage_search.py` helper가 포함되어 있다.
- 별도 API key나 로그인은 필요 없다.

## Inputs

### Search

- 선택: 국가유산명 검색어
- 선택: 시도명 또는 시도 코드
- 선택: 페이지 번호
- 선택: 결과 수(1~100)

지원 지역명: 서울, 부산, 대구, 인천, 광주, 대전, 울산, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주, 세종.

### Detail

목록 결과에서 받은 다음 세 식별자가 필요하다.

- `ccbaKdcd`
- `ccbaAsno`
- `ccbaCtcd`

### Events

- 필수: 연도(`YYYY`)
- 필수: 월(`1~12`)
- 선택: 시도명·시군구명 부분 필터

## Workflow

1. 국가유산명과 지역을 확인한다. 모호한 요청이면 먼저 검색 결과를 보여주고 상세 대상을 선택하게 한다.
2. 공식 `SearchKindOpenapiList.do`에서 목록을 조회한다.
3. 목록 결과의 `ccbaKdcd`, `ccbaAsno`, `ccbaCtcd`를 사용해 `SearchKindOpenapiDt.do` 상세를 조회한다.
4. 행사 요청이면 `selectEventListOpenapi.do`에 연도·월을 넣고, 반환된 지역·기간·행사명·공식 링크를 정리한다.
5. 결과에 공식 출처 URL과 조회 시각을 포함한다.
6. 입장료·운영시간·현재 행사 진행 여부처럼 변동 가능성이 있는 정보는 상세 API의 사실과 별도로 표시하고, 공식 안내 페이지를 확인하도록 안내한다.

## CLI examples

```bash
python3 scripts/korean_heritage_search.py search --query "경복궁" --region 서울 --limit 5
python3 scripts/korean_heritage_search.py search --region 전북 --limit 10
python3 scripts/korean_heritage_search.py detail --ccba-kdcd 11 --ccba-asno 0000010000000 --ccba-ctcd 11
python3 scripts/korean_heritage_search.py events --year 2026 --month 7 --region 서울 --limit 10
```

## Response policy

- 국가유산명, 유형, 지역, 주소, 좌표, 지정일, 설명, 관리기관을 공식 응답 그대로 요약한다.
- 상세 조회에서 받은 `content`는 역사 설명으로 표시하고, 현재 운영 상태로 해석하지 않는다.
- 행사 응답의 `subContent`는 HTML을 제거한 텍스트로 정리하되, 원문 링크(`subPath`)를 함께 제공한다.
- 결과가 없으면 다른 국가유산명 표기나 지역 조건을 제안한다.
- API에 없는 입장료·운영시간·통제 상태를 추정하지 않는다.

## Done when

- 검색 요청이면 공식 목록 결과와 `total_results`가 정리되어 있다.
- 상세 요청이면 공식 식별자와 설명·주소·좌표·이미지가 정리되어 있다.
- 행사 요청이면 연도·월, 행사명, 기간, 지역, 공식 링크가 정리되어 있다.
- 응답에 공식 출처와 조회 시각이 포함되어 있다.

## Failure modes

- 국가유산명·지역 조건에 해당하는 결과가 없음
- `ccbaKdcd`, `ccbaAsno`, `ccbaCtcd` 조합이 유효하지 않음
- 국가유산청 API의 일시적 timeout, HTTP 오류, XML 오류
- 행사 데이터의 설명 HTML 또는 기간 문자열이 불완전함
- 오래된 API 응답으로 이미지 URL 또는 일부 필드가 비어 있음

## Notes

- 목록 API: `https://www.khs.go.kr/cha/SearchKindOpenapiList.do`
- 상세 API: `https://www.khs.go.kr/cha/SearchKindOpenapiDt.do`
- 행사 API: `https://www.khs.go.kr/cha/openapi/selectEventListOpenapi.do`
- 공식 Open API 안내: `https://www.khs.go.kr/html/HtmlPage.do?mn=NS_04_04_03&pg=%2Fpublicinfo%2Fpbinfo3_0201.jsp`
- 이 기능은 검색·조회 전용이며 예약, 결제, 신청을 수행하지 않는다.
