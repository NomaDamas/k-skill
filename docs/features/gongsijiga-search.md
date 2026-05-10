# 개별공시지가 조회 가이드

## 이 기능으로 할 수 있는 일

- 한국 국토교통부 부동산공시가격알리미(`realtyprice.kr`)에서 지번 단위 **개별공시지가**(원/㎡) 조회
- 다년도 추이(과거 수년치)와 전년 대비 변동률 정규화 JSON 출력
- 17개 광역자치단체(서울, 세종특별자치시 포함) 모든 시·군·구 지원
- 산 지번 / 본번-부번 모두 지원

## 가장 중요한 규칙

`realtyprice.kr`는 **API 키가 필요 없는 완전 공개 엔드포인트**이므로 이 스킬은 `k-skill-proxy`를 경유하지 않는다. 사용자 머신에서 직접 upstream을 호출한다. (저장소의 *k-skill-proxy inclusion rule* — 프록시는 API 키가 필요한 upstream만 다룬다.)

## 무엇을 가져오나

- 공시지가는 매년 1월 1일 기준, 4~5월에 공시된다.
- 재산세, 종합부동산세, 양도소득세 등 **세금 산정의 법적 기준 단가**다.
- 공시지가 ≠ 시세. 시세는 통상 공시지가의 1.5~3배.

> 시세, 실거래가, 매매가, 호가가 필요하면 [`real-estate-search`](real-estate-search.md) 또는 다른 스킬을 사용한다.

## 먼저 필요한 것

없음. 인터넷 연결과 Node.js 18+ 만 있으면 된다.

## 사용 방법

### 설치

```bash
npm install gongsijiga-search
```

### 기본 호출

```js
const { lookupGongsijiga } = require("gongsijiga-search");

const result = await lookupGongsijiga("서울특별시 강남구 역삼동 736");
console.log(result.latest.price_per_sqm); // 72340000
console.log(result.yoy_change_pct); // 5.45
```

### 입력 주소 형식

`<시도> <시군구> <읍면동…> [산] <본번[-부번]>`

| 형식 | 예시 |
| --- | --- |
| 일반 | `서울특별시 강남구 역삼동 736` |
| 약칭 시도 | `서울 강남구 역삼동 736` |
| 부번 있음 | `경기 성남시 분당구 정자동 178-3` |
| 산 지번 | `서울 서초구 서초동 산 1-2` |
| 다토큰 읍면동 | `전남 무안군 청계면 청천리 100-5` |
| 세종 (시군구 없음) | `세종 어진동 575` 또는 `세종특별자치시 어진동 575` |

### 응답 모양

```json
{
  "address": "서울특별시 강남구 역삼동 736",
  "jibun": "736번지",
  "san": false,
  "latest": {
    "year": 2026,
    "price_per_sqm": 72340000,
    "notice_date": "2026-04-30",
    "base_date": "2026-01-01"
  },
  "history": [
    { "year": 2026, "price_per_sqm": 72340000, "notice_date": "2026-04-30" },
    { "year": 2025, "price_per_sqm": 68600000, "notice_date": "2025-04-30" }
  ],
  "yoy_change_pct": 5.45,
  "source_url": "https://www.realtyprice.kr/notice/gsindividual/search.htm"
}
```

## 실패 모드

| `error.code` | 의미 | 처리 |
| --- | --- | --- |
| `ADDRESS_PARSE_FAILED` | 주소 파싱 실패 / 미인식 시도 | "행정구역 + 본번이 포함된 주소가 필요합니다" 안내 후 재요청 |
| `INVALID_BUNJI` | 본번 비숫자 또는 4자리 초과 | 본번 형식 재요청 |
| `REGION_NOT_FOUND` | 시군구/읍면동 매칭 실패 | `err.candidates` 후보(최대 3개) 제안 |
| `LAND_NOT_FOUND` | 해당 지번 미등재 | "본번/부번 오타이거나 도로/하천 등 미과세 토지" 설명 |
| `UPSTREAM_ERROR` | `realtyprice.kr` 비정상 응답 | "데이터 출처 일시 장애. 잠시 후 재시도" + `source_url` |
| `UPSTREAM_TIMEOUT` | 30초 타임아웃 | UPSTREAM_ERROR와 동일 처리 |

## 출처

- [부동산공시가격알리미](https://www.realtyprice.kr/notice/gsindividual/search.htm) — 국토교통부
- 패키지 소스: [`packages/gongsijiga-search/`](../../packages/gongsijiga-search)
