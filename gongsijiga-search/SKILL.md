---
name: gongsijiga-search
description: |
  대한민국 국토교통부가 매년 공시하는 "개별공시지가"(원/㎡) 조회.
  지번 단위 토지의 정부 공시 단가로, 재산세·종부세·양도세 등
  세금 산정의 법적 기준이다. **시세/실거래가가 아니다.**
  Use when the user asks for 공시지가, 개별공시지가, 토지 공시단가,
  세무 계산용 토지 단가, or "이 땅 공시지가 얼마야".
  Do NOT use for 시세, 실거래가, 매매가, 호가, 공동주택가격
  (those need a different data source).
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# 개별공시지가 조회

## What this skill does

한국 국토교통부 부동산공시가격알리미(realtyprice.kr)에서 특정 필지의 **개별공시지가**(원/㎡)를 조회한다. 다년도 추이(최근 5년 이내)와 전년 대비 변동률을 정규화된 JSON으로 반환한다.

공시지가는 매년 1월 1일 기준, 4~5월 공시. 세금(재산세, 종합부동산세, 양도소득세) 산정의 법적 기준 단가다.

## When to use

- "서울 강남구 역삼동 736 공시지가 알려줘"
- "전라남도 무안군 청계면 청천리 100번지 개별공시지가"
- "서초동 산 1-2 공시지가 추이"
- 세무 계산에서 토지 공시 단가가 필요할 때

## When NOT to use

- 시세, 실거래가, 매매가, 호가 → 다른 데이터 소스 필요
- 공동주택가격, 표준지공시지가, 단독주택가격 → 별도 스킬
- 토지이용계획 → eum.go.kr 별도 스킬

## Prerequisites

- 인터넷 연결
- `curl` (또는 HTTP 호출 도구)

사용자에게 필요한 시크릿 없음 (공개 데이터).

## Default path

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
BASE="${BASE%/}"
```

## Workflow

### 1. 사용자 입력 수집

사용자에게 **시도 + 시군구 + 읍면동 + 지번**이 포함된 주소를 요청한다.

- 최소 필수: 시도, 시군구, 읍면동, 본번
- 산 지번이면 "산" 키워드 포함
- 부번이 있으면 "100-5" 형식

예시: "서울 강남구 역삼동 736", "전남 무안군 청계면 청천리 산 1-2"

시도가 누락된 주소(예: "역삼동 736")는 조회 불가 — 시도를 물어본다.

### 2. 프록시 호출

```bash
curl -s "${BASE}/realtyprice?address=$(python3 -c "import urllib.parse; print(urllib.parse.quote('서울 강남구 역삼동 736'))")"
```

### 3. 응답 해석 및 출력

성공 응답 예시:

```json
{
  "address": "서울 강남구 역삼동 736",
  "jibun": "736번지",
  "san": false,
  "latest": {
    "year": 2026,
    "price_per_sqm": 72340000,
    "notice_date": "2026-04-30",
    "base_date": "2026-01-01"
  },
  "history": [...],
  "yoy_change_pct": 5.45,
  "source_url": "https://www.realtyprice.kr/notice/gsindividual/search.htm"
}
```

**출력 규칙:**

1. 반드시 "공시지가" 단어 사용. "가격/시세/매매가" 단어 금지.
2. 헤더: `[정부 공시] 개별공시지가 — {address}`
3. 최신값: `{year}년 공시지가: {price_per_sqm:,}원/㎡ (전년 대비 +{yoy_change_pct}%)`
4. 추이 표 (history 배열을 연도순 테이블로):

| 연도 | 공시지가 (원/㎡) | 공시일 |
|------|-----------------|--------|
| 2026 | 72,340,000 | 2026-04-30 |
| ... | ... | ... |

5. 마지막 줄 disclaimer:
   `본 단가는 세금 산정용 정부 공시 가격으로, 시세나 실거래가와 다릅니다.`

### 4. 올해 미발표 안내

`latest.year`가 올해보다 작으면: "올해 공시지가는 아직 미발표 상태입니다. 최신 데이터는 {latest.year}년 기준입니다." 안내.

## Failure modes

| error.code | 의미 | 행동 |
|---|---|---|
| `ADDRESS_PARSE_FAILED` | 주소 파싱 실패 | "행정구역 + 본번까지 포함된 주소가 필요합니다" + 예시 |
| `INVALID_BUNJI` | 본번 형식 오류 | 본번 입력 형식 재요청 |
| `REGION_NOT_FOUND` | 행정구역 매칭 실패 | candidates 배열이 있으면 제안, 없으면 오타 확인 요청 |
| `LAND_NOT_FOUND` | 해당 지번 미등재 | "본번/부번 오타이거나 도로/하천 등 미과세 토지" 설명 |
| `UPSTREAM_ERROR` | realtyprice.kr 장애 | "데이터 출처 일시 장애. 잠시 후 재시도" + source_url |
| `UPSTREAM_TIMEOUT` | 30초 초과 | UPSTREAM_ERROR와 동일 |

## Notes

- 공시지가 ≠ 시세. 시세는 통상 공시지가의 1.5~3배.
- 매년 1월 1일 기준, 4~5월 발표. 1~4월은 전년도가 최신.
- realtyprice.kr는 API 키 불필요 (공개 데이터).
