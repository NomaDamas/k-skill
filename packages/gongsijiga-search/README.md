# gongsijiga-search

대한민국 국토교통부 부동산공시가격알리미(`realtyprice.kr`)의 공개 API를 호출해 지번 단위 **개별공시지가**(원/㎡)를 조회하는 Node.js 패키지입니다. 다년도 추이와 전년 대비 변동률을 정규화된 JSON으로 돌려줍니다.

> [!NOTE]
> `realtyprice.kr`는 API 키가 필요 없는 완전 공개 엔드포인트이므로 이 패키지는 `k-skill-proxy`를 경유하지 않고 사용자 머신에서 직접 upstream을 호출합니다. (참고: 저장소의 *k-skill-proxy inclusion rule* — 프록시는 API 키가 필요한 upstream만 다룹니다.)

## 설치

배포 후:

```bash
npm install gongsijiga-search
```

이 저장소에서 개발할 때:

```bash
npm install
```

## 사용 예시

```js
const { lookupGongsijiga } = require("gongsijiga-search");

async function main() {
  const result = await lookupGongsijiga("서울특별시 강남구 역삼동 736");
  console.log(result.latest); // { year, price_per_sqm, notice_date, base_date }
  console.log(result.history); // [{ year, price_per_sqm, notice_date }, ...] (descending)
  console.log(result.yoy_change_pct); // 전년 대비 % (소수점 둘째 자리 반올림)
}

main().catch((err) => {
  console.error(err.code, err.message);
  process.exitCode = 1;
});
```

## 입력 주소 형식

`<시도> <시군구> <읍면동…> [산] <본번[-부번]>` 형태의 한국어 지번 주소.

- 시도: 17개 광역자치단체 풀네임/약칭 모두 지원 (예: `서울특별시` / `서울`)
- **세종특별자치시**는 시군구가 없으므로 `세종 <읍면동> <지번>` 형식
- 산 지번은 `산 1-2` 또는 `산1-2`
- 본번은 4자리 이하 숫자, 부번은 `-` 뒤에 옴

예: `서울 강남구 역삼동 736`, `전남 무안군 청계면 청천리 산 1-2`, `세종 어진동 575`.

## 응답 모양

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

## 에러 코드

| `error.code` | 의미 | `statusCode` |
| --- | --- | --- |
| `ADDRESS_PARSE_FAILED` | 주소 파싱 실패 / 미인식 시도 / 토큰 부족 | 400 |
| `INVALID_BUNJI` | 본번이 비숫자 또는 4자리 초과 | 400 |
| `REGION_NOT_FOUND` | 시군구/읍면동 매칭 실패 (`err.candidates` 후보 최대 3개) | 404 |
| `LAND_NOT_FOUND` | 해당 지번이 공시지가에 등재되지 않음 | 404 |
| `UPSTREAM_ERROR` | realtyprice.kr 비정상 HTTP 응답 | 502 |
| `UPSTREAM_TIMEOUT` | 30초 타임아웃 | 504 |

## 공개 API

- `lookupGongsijiga(addressRaw, fetchFn?)` — 주소 → 정규화된 응답
- `parseAddress(rawAddress)` — 주소 파서 (지번/산/세종 처리)
- `parseSido(text)` — 시도명 → 2자리 코드
- `normalizeSearchResult(raw)` — gsiList 항목 → `{ year, price_per_sqm, notice_date }`
- `buildResponse({ address, jibun, san, history })` — 최종 응답 합성
- `fetchSigunguList`, `fetchEupmyeondongList`, `fetchGsiSearchList` — 단계별 upstream 호출
- `fetchWithTimeout(url, opts, timeoutMs?, fetchFn?)` — AbortController 기반 타임아웃
- `createCache()` — 단순 in-memory TTL 캐시 (Map 백엔드)
- `SIDO_MAP`, `REALTYPRICE_BASE_URL`, `REFERER`, `makeError`

## Notes

- 공시지가 ≠ 시세. 시세는 통상 공시지가의 1.5~3배.
- 매년 1월 1일 기준, 4~5월 발표. 1~4월에는 전년도가 최신.
- `realtyprice.kr` 호출에는 별도 `Referer` 헤더가 필요하며, 이 패키지가 자동 처리합니다.
