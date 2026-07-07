---
name: nhis-care-checkup-search
description: 국민건강보험공단 장기요양기관과 건강검진기관 검색 API를 k-skill-proxy 경유로 조회한다. 조회 전용.
license: MIT
metadata:
  category: healthcare
  locale: ko-KR
  phase: v1
---

# NHIS Care And Checkup Search

## What this skill does

국민건강보험공단 장기요양기관 검색서비스(data.go.kr `15059029`)와 검진기관 찾기 조회(data.go.kr `15154419`)를 `k-skill-proxy` 경유로 호출해 공개 기관 후보를 조회한다.

## When to use

- "서울 강남 장기요양기관 찾아줘"
- "요양원 후보와 주소/전화번호 확인해줘"
- "서울 강남 건강검진기관 찾아줘"
- "주말 검진 가능한 검진기관 찾아줘"

## When not to use

- 의료 판단, 장기요양 등급 판정, 특정 기관 추천 보증
- 예약·신청·민감 의료정보 조회 자동화

## Prerequisites

- 인터넷 연결
- hosted/self-host `k-skill-proxy`의 `/v1/nhis/long-term-care`, `/v1/nhis/checkup/*` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털에서 필요한 서비스의 활용신청이 승인돼 있어야 한다.

키 발급:

- 장기요양기관 검색 서비스: <https://www.data.go.kr/data/15059029/openapi.do>
- 건강검진기관 검색 서비스: <https://www.data.go.kr/data/15154419/openapi.do>
- 공공데이터포털 이용 가이드: <https://www.data.go.kr/ugs/selectPublicDataUseGuideView.do>

## Inputs

장기요양기관 route:

- `q`, `query`, `name`, 또는 `adminNm`: 기관명 검색어
- `sido` 또는 `siDoCd`: 시도 코드
- `sigungu` 또는 `siGunGuCd`: 시군구 코드
- `service_kind` 또는 `serviceKind`: 급여/서비스 종류 코드
- `page` 또는 `pageNo`: 기본 1
- `limit` 또는 `numOfRows`: 기본 10, 최대 100

건강검진기관 route:

- route operation: `list`, `by-region`, `by-checkup-type`, `holiday`
- `q`, `query`, `name`, 또는 `hmcNm`: 검진기관명 검색어
- `sido` 또는 `siDoCd`: 시도 코드
- `sigungu` 또는 `siGunGuCd`: 시군구 코드
- `hchk_type`, `checkup_type`, 또는 `hchkTypeCd`: 검진 유형 코드
- `page` 또는 `pageNo`: 기본 1
- `limit` 또는 `numOfRows`: 기본 10, 최대 100

## Workflow

### 1. Decide the surface

장기요양기관이면 `/v1/nhis/long-term-care`를 사용한다. 건강검진기관이면 검색 목적에 맞춰 `/v1/nhis/checkup/list`, `/v1/nhis/checkup/by-region`, `/v1/nhis/checkup/by-checkup-type`, `/v1/nhis/checkup/holiday` 중 하나를 사용한다.

### 2. Query long-term care institutions through the proxy

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/nhis/long-term-care" \
  --data-urlencode "q=강남" \
  --data-urlencode "sido=11" \
  --data-urlencode "limit=10"
```

### 3. Query health checkup institutions through the proxy

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/nhis/checkup/by-region" \
  --data-urlencode "q=검진" \
  --data-urlencode "sido=11" \
  --data-urlencode "limit=10"
```

### 4. Summarize source fields

응답 XML의 `item` 필드에서 기관명, 주소, 전화번호, 급여종류, 검진유형, 운영일처럼 upstream이 제공한 공개 항목만 요약한다. 사용자가 실제 이용·입소·검진 예약을 하려면 NHIS 또는 기관에 직접 확인하라고 안내한다.

## Failure modes

- `400 bad_request`: 검색어/지역/서비스 종류 중 하나도 없거나 코드/페이지 값이 잘못됨.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없음.
- `502 upstream_forbidden`: data.go.kr gateway가 키를 거부함.
- 빈 결과: 지역 코드나 기관명 표기를 완화해서 재검색한다.
- 특정 서비스만 실패: 같은 `DATA_GO_KR_API_KEY`라도 data.go.kr 서비스별 활용신청이 별도라서 `15059029` 또는 `15154419` 승인 상태를 확인한다.

## Done when

- 장기요양기관 조회는 `k-skill-proxy` route로 수행했고 사용자에게 API key를 요구하지 않았다.
- 건강검진기관 조회는 `k-skill-proxy` route로 수행했고 사용자에게 API key를 요구하지 않았다.
- 결과에는 기관명, 위치, 연락처, 원천 서비스와 조회 조건을 함께 적었다.

## Maintainer review notes

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `node --test packages/k-skill-proxy/test/server.test.js`
- `curl -i --get "$KSKILL_PROXY_BASE_URL/v1/nhis/long-term-care" --data-urlencode "q=강남"` (키 미설정이면 503 확인)
- `curl -i --get "$KSKILL_PROXY_BASE_URL/v1/nhis/checkup/by-region" --data-urlencode "q=검진" --data-urlencode "sido=11"` (키 미설정이면 503 확인)

Live smoke는 hosted/self-host proxy에 `DATA_GO_KR_API_KEY`가 설정되고 `15059029` 또는 `15154419` 활용신청이 승인된 뒤 수행한다.

## Safety notes

- 조회 전용 스킬이다.
- 의료 판단, 장기요양 등급 판정, 예약/신청 자동화는 하지 않는다.
- 인증키는 프록시 서버에서만 다루며 repo/GitHub Actions/public docs에 저장하지 않는다.
