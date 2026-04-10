---
name: subway-lost-property
description: Use when the user asks how to look up 지하철 분실물 or 유실물 by 역명/물품명. v1 is an 안내형/하이브리드 skill that structures the official LOST112 + 서울교통공사 flow conservatively.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# Subway Lost Property

## What this skill does

지하철에서 잃어버린 물건을 찾기 위해 공식 경로를 구조화한다.

- LOST112 `습득물 목록 조회`에 넣을 검색 조건을 정리한다.
- 서울교통공사 유실물센터 진입점을 함께 안내한다.
- 공개 API가 명확하지 않은 상태라 v1은 **안내형/하이브리드** 범위로 유지한다.

## When to use

- "강남역에서 지갑 잃어버렸는데 어디서 찾아?"
- "2호선 지하철 분실물 조회 방법 알려줘"
- "서울 지하철 유실물 공식 사이트로 바로 찾게 도와줘"

## Inputs

- 필수: 역명 또는 보관장소 키워드
- 선택: 물품명, 호선, 분실/습득 추정 기간

## Official surfaces

- LOST112 습득물 목록: `https://www.lost112.go.kr/find/findList.do`
- 서울교통공사 유실물센터: `https://www.seoulmetro.co.kr/kr/page.do?menuIdx=541`

LOST112 검색 폼에서 확인되는 핵심 필드는 아래와 같다.

- `SITE=V`: 경찰 이외 기관(지하철, 공항 등)
- `DEP_PLACE`: 보관장소
- `PRDT_NM`: 습득물명
- `START_YMD`, `END_YMD`: 검색 기간

## Workflow

### 1) Ask for the minimum clues first

바로 추정하지 말고 아래 정보를 먼저 받는다.

- 어느 역/어느 구간인지
- 물건 종류가 무엇인지
- 대략 언제 잃어버렸는지
- 서울교통공사(1~8호선) 범위인지, 다른 운영사인지

### 2) Generate the official LOST112 search payload

repo helper를 그대로 써도 된다.

```bash
python3 scripts/subway_lost_property.py \
  --station 강남역 \
  --item 지갑 \
  --days 14
```

helper는 기본적으로 `SITE=V` 를 사용하고, 역명/물품명/기간을 LOST112 form payload와 **referer까지 포함한 runnable `curl` 예시**로 정리해 준다. 예시 `curl` 은 응답 HTML을 `lost112-search-result.html` 로 저장한다.

### 3) Optionally verify live reachability

```bash
python3 scripts/subway_lost_property.py \
  --station 강남역 \
  --item 지갑 \
  --days 14 \
  --verify-live
```

`--verify-live` 는 공식 페이지 접근 가능 여부만 보수적으로 확인한다. 사이트가 느리면 timeout을 그대로 보고하고 manual open으로 전환한다.

### 4) Guide the user conservatively

- 먼저 LOST112에서 역명 그대로 검색
- 결과가 없으면 `강남`처럼 `역` 없는 키워드로 재검색
- 필요하면 호선명도 추가 검색
- 서울교통공사 유실물센터 페이지를 함께 열어 후속 안내 확인

## Done when

- 사용자가 공식 조회 경로를 바로 열 수 있다.
- LOST112 검색 조건(`SITE=V`, 역명, 물품명, 기간)을 받았다.
- 자동 조회 보장 범위와 manual fallback을 분명히 설명했다.

## Failure modes

- 공식 사이트 응답이 느리거나 timeout 발생
- 역명이 실제 보관장소 표기와 달라 검색 결과가 비는 경우
- 공개 API 부재로 자동 결과 수집이 안정적이지 않은 경우

## Notes

- v1은 공식 웹 흐름을 안전하게 안내하는 범위다.
- 완전 자동 조회형으로 확장하려면 캡차/세션/동적 요청 안정성 재검증이 먼저 필요하다.
- helper는 공식 HTTPS 진입점만 사용한다.
