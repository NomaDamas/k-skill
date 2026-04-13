---
name: household-waste-info
description: Use when the user asks for 생활쓰레기 배출 요일/시간/장소 정보 by 지역명(시군구) and wants official data.go.kr household waste guidance.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Household Waste Info

## What this skill does

행정안전부 생활쓰레기배출정보 Open API를 조회해
지역별 생활쓰레기/음식물쓰레기/재활용품 배출 기준과 요일/시간 정보를 안내한다.

- 기본 조회 단위는 시군구명(`SGG_NM`)이다.
- 응답은 사용자에게 이해하기 쉬운 요약 형태로 정리한다.
- Base URL은 원본 API(`https://apis.data.go.kr/1741000/household_waste_info`)를 기준으로 한다.
- `serviceKey`(`DATA_GO_KR_API_KEY`)만 proxy 서버에서 주입/관리한다.

## When to use

- "강남구 쓰레기 배출 요일 알려줘"
- "우리 동네 음식물쓰레기 언제 버려?"
- "재활용품 배출 시간 확인해줘"
- "생활쓰레기 배출 장소/방법 찾아줘"

## Prerequisites

- 인터넷 연결
- `curl`, `python3` 사용 가능 환경
- 원본 API 접근 가능 환경
- API 키 주입용 proxy 접근 가능 환경

## Credential requirements

기본적으로 사용자 측 필수 인증키는 없다.

선택 환경변수:

- `KSKILL_PROXY_BASE_URL` (self-hosted proxy를 쓸 때)

인증키 사용 원칙:

1. endpoint/파라미터 체계는 원본 API를 따른다.
2. `serviceKey` 값은 proxy 서버가 관리하고 주입한다.
3. 사용자 측 로컬 환경에 `DATA_GO_KR_API_KEY`를 둘 필요가 없다.

## Official API surface

- Base URL: `https://apis.data.go.kr/1741000/household_waste_info`
- Endpoint: `GET /info`
- (key injection only) proxy: `k-skill-proxy`가 `serviceKey`를 서버 측에서 주입

## Default path

추가 client API 레이어는 불필요하다. Base URL은 원본 API를 기준으로 유지한다.

현재 proxy가 지원하는 쿼리 파라미터:

- `cond[SGG_NM::LIKE]`: 시군구명 포함 검색 (필수)
- `pageNo` / `numOfRows`(또는 `page_no` / `num_of_rows`): **필수**, 값은 **반드시 `1` / `100`** — 그 외 값·비정수(숫자만 아닌) 문자열은 **`400`**. upstream에는 항상 1페이지·100건만 전달한다.
- `returnType`: proxy가 항상 `json`으로 강제 — 클라이언트가 값을 보내도 무시된다
- `serviceKey`: proxy가 서버 측에서 주입 — 클라이언트에서 전달 금지

> 원본 API의 `cond[DAT_CRTR_YMD::*]`, `cond[DAT_UPDT_PNT::*]` 같은 부가 필터는 현재 proxy 라우트에서 패스스루되지 않는다. 사용자가 보내는 일반적인 질의("강남구 쓰레기 배출 요일")는 시군구 기준 검색만으로 충분하므로, 필요하다면 응답에서 `DAT_UPDT_PNT` 기준으로 클라이언트에서 정렬한다.

## Workflow

### 1) Ask location first

사용자 지역 정보 없이 바로 조회하지 않는다.

- 권장 질문: `확인할 지역(시/군/구)을 알려주세요. 예: 강남구, 수원시 영통구`

### 2) Validate input and resolve query

- 시군구 입력이 비어 있으면 다시 물어본다.
- 모호한 입력이면 상위 행정구역 포함 형태로 재질문한다.

### 3) Call via proxy (serviceKey injected server-side)

proxy가 `serviceKey`를 서버 측에서 주입한 뒤 원본 API로 전달한다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/household-waste/info' \
  --data-urlencode "cond[SGG_NM::LIKE]=강남구" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "numOfRows=100"
```

`returnType`은 proxy가 항상 `json`으로 강제하므로 클라이언트에서 별도로 보낼 필요가 없다.

`KSKILL_PROXY_BASE_URL`이 있으면 그 값을 사용하고, 없으면 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 사용한다.

### 4) Summarize for user

응답에서 필요한 항목만 간단히 정리한다.

- 관리구역/대상지역 (`MNG_ZONE_NM`, `MNG_ZONE_TRGT_RGN_NM`)
- 배출장소/배출방법 (`EMSN_PLC`, `LF_WST_EMSN_MTHD`, `FOD_WST_EMSN_MTHD`, `RCYCL_EMSN_MTHD`)
- 배출요일/시간 (`LF_WST_EMSN_DOW`, `FOD_WST_EMSN_DOW`, `RCYCL_EMSN_DOW`, 각 시작/종료시간)
- 미수거일 (`UNCLLT_DAY`)
- 문의처 (`MNG_DEPT_NM`, `MNG_DEPT_TELNO`)

## Done when

- 사용자 지역(시군구)을 확인했다.
- proxy `/v1/household-waste/info` 호출에 성공했다.
- 배출 요일/시간/장소를 3~6개 핵심 포인트로 요약해 안내했다.

## Failure modes

- 프록시 서버에 `DATA_GO_KR_API_KEY`가 없거나 만료된 경우 (`serviceKey` 주입 실패)
- 검색 지역명이 API 데이터와 불일치하여 결과가 비는 경우
- 공공데이터 API 일시 장애/트래픽 제한
- 필수 파라미터 누락(`cond[SGG_NM::LIKE]`, 또는 `pageNo` / `numOfRows` 미전달)
- `pageNo` / `numOfRows` 값이 `1` / `100`이 아니거나, 숫자만으로 표현되지 않은 문자열인 경우(proxy `400`, upstream 미호출)

## Notes

- 사용자 측에 `DATA_GO_KR_API_KEY`를 저장하지 않고 proxy 서버에서만 관리한다.
- API raw payload를 그대로 노출하지 말고 사용자 친화적으로 요약한다.
- 응답이 여러 건이면 최신 `DAT_UPDT_PNT` 기준으로 우선 정렬해 보여준다.
- 공식 데이터 출처: 공공데이터포털 (`https://www.data.go.kr`)
