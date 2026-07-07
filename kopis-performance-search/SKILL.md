---
name: kopis-performance-search
description: KOPIS 공연예술통합전산망 Open API를 k-skill-proxy 경유로 조회해 공연 목록·상세와 공연시설 정보를 찾는다. 조회 전용.
license: MIT
metadata:
  category: culture
  locale: ko-KR
  phase: v1
---

# KOPIS Performance Search

## What this skill does

KOPIS 공연예술통합전산망 Open API `https://www.kopis.or.kr/openApi/restful` 을 `k-skill-proxy` 경유로 호출한다.

지원 endpoint:

- `GET /v1/kopis/performances` → `pblprfr` 공연 목록
- `GET /v1/kopis/performances/{id}` → `pblprfr/{mt20id}` 공연 상세
- `GET /v1/kopis/facilities` → `prfplc` 공연시설 목록
- `GET /v1/kopis/facilities/{id}` → `prfplc/{mt10id}` 공연시설 상세

예매, 좌석 선점, 결제 자동화는 범위 밖이다.

## When to use

- "이번 달 서울 공연 KOPIS에서 찾아줘"
- "공연 ID PF132236 상세 보여줘"
- "세종문화회관 KOPIS 시설 정보 찾아줘"

## Prerequisites

- 인터넷 연결
- hosted/self-host `k-skill-proxy`의 `/v1/kopis/*` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `KOPIS_API_KEY` 또는 `KSKILL_KOPIS_API_KEY` 는 프록시 운영 서버 환경에만 둔다.

키 발급: KOPIS Open API 안내 <https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00074> 에서 회원가입/로그인 후 OpenAPI 이용신청으로 발급한다.

## Inputs

공연 목록:

- `start`/`stdate`: 시작일 `YYYYMMDD`
- `end`/`eddate`: 종료일 `YYYYMMDD`
- `genre`/`shcate`: 장르 코드
- `areaCode`/`signgucode`: 지역 코드
- `sigunguCode`/`signgucodesub`: 시군구 코드
- `prfstate`, `kidstate`, `openrun`, `afterdate`
- `page`/`cpage`, `limit`/`rows`

시설 목록:

- `q`/`query`/`name`/`shprfnmfct`: 시설명
- `areaCode`/`signgucode`, `sigunguCode`/`signgucodesub`
- `fcltychartr`, `afterdate`
- `page`/`cpage`, `limit`/`rows`

## Workflow

### 1. Search a small list first

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/kopis/performances" \
  --data-urlencode "start=20260701" \
  --data-urlencode "end=20260731" \
  --data-urlencode "areaCode=11" \
  --data-urlencode "limit=10"
```

### 2. Fetch details for a selected ID

```bash
curl -fsS "$BASE/v1/kopis/performances/PF132236"
```

시설명으로 먼저 찾은 뒤 시설 ID가 필요하면 상세를 조회한다.

```bash
curl -fsS --get "$BASE/v1/kopis/facilities" \
  --data-urlencode "q=세종문화회관" \
  --data-urlencode "limit=5"
```

## Failure modes

- `400 bad_request`: 날짜 형식, 페이지 크기, ID 형식이 잘못됨.
- `503 upstream_not_configured`: 프록시 서버에 `KOPIS_API_KEY`/`KSKILL_KOPIS_API_KEY` 없음.
- KOPIS upstream XML 에러/빈 결과: 검색 기간·지역·장르를 완화하거나 ID를 다시 확인한다.
- KOPIS 공식 가이드는 오류 XML 스키마를 명확히 열거하지 않는다. live 응답의 XML 본문을 그대로 확인한다.

## Done when

- 목록 검색은 날짜 범위를 좁혀 수행했다.
- 상세 답변은 KOPIS `mt20id` 또는 `mt10id`를 함께 명시했다.
- 공연명, 기간, 장소, 상태, 출처 endpoint를 원문 필드 기준으로 요약했다.
- 예매/결제/좌석 자동화로 넘어가지 않았다.

## Maintainer review notes

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `node --test packages/k-skill-proxy/test/server.test.js`
- `curl -i --get "$KSKILL_PROXY_BASE_URL/v1/kopis/performances" --data-urlencode "start=20260701" --data-urlencode "end=20260731"` (키 미설정이면 503 확인)

Live smoke는 hosted/self-host proxy에 `KOPIS_API_KEY`가 설정된 뒤 수행한다.

## Safety notes

- 조회 전용 스킬이다.
- 예매, 좌석 선점, 결제, 로그인 자동화는 하지 않는다.
- 인증키는 프록시 서버에서만 다루며 repo/GitHub Actions/public docs에 저장하지 않는다.
