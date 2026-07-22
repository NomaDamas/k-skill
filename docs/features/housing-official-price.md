# 한국 주택 공시가격 조회 가이드

## 개요

`housing-official-price`는 국토교통부 부동산공시가격알리미(`realtyprice.kr`)에서 공동주택(아파트)과 개별주택의 정부 공시가격 이력을 조회하는 Node.js 패키지다.

이 데이터 표면은 로그인/API 키 없이 브라우저에서 보이는 public web data surface / 공개 웹 데이터 표면이며, 공식 문서화된 OpenAPI가 아님 / not a documented OpenAPI. 따라서 `k-skill-proxy`를 거치지 않고 사용자 머신에서 직접 호출한다.

## 어떤 데이터를 다루나

- 공동주택가격: 아파트 단지 후보를 찾고, 동/호를 확정한 뒤 연도별 공시가격을 조회한다.
- 개별주택가격: 19자리 PNU로 단독/다가구 등 개별주택 공시가격 이력을 조회한다.
- 각 응답은 `source.api_documented: false`, `source.access: "public-web-data-surface"`를 포함한다.
- realtyprice.kr 응답은 `model.list` 또는 `modelMap.list`/`modelMap.totalCnt` 형태가 모두 관측되어 둘 다 지원한다.

## 주변 부동산 스킬과 구분

- `housing-official-price`: 공동주택가격/개별주택가격, 즉 apartment/individual-house official prices.
- `gongsijiga-search`: land official price / 개별공시지가. 토지 필지의 원/㎡ 정부 공시 단가다.
- `real-estate-search`: transaction data / 실거래가와 전월세 거래 데이터다.
- `building-register-search`: register metadata / 건축물대장 표제부 정보(용도, 면적, 층수, 사용승인일 등)다.

공시가격은 시세, 실거래가, 감정평가, 등기 권리관계, 세무/법률 판단이 아니다.

## 설치

배포 후:

```bash
npm install housing-official-price
```

이 저장소에서 개발할 때:

```bash
npm install
npm test --workspace housing-official-price
```

## 접근 우선순위

1. 패키지 API를 직접 호출한다. 프록시, 로그인 브라우저, CAPTCHA 우회, 별도 VWorld fallback을 사용하지 않는다.
2. 개별주택은 정확한 19자리 PNU가 있어야 한다. PNU를 모르면 추정하지 말고 사용자에게 법정동/필지 확인을 요청한다.
3. 공동주택은 `searchApartmentCandidates({ complexName })`로 후보를 먼저 찾는다.
4. 후보가 여러 개면 `aptCode`, `noticeDate`, 주소를 보여주고 선택을 요청한다. 첫 번째 후보를 자동 선택하지 않는다.
5. 후보 확정 후 `lookupApartmentOfficialPrice`에 `dongName`/`dongCode`와 `hoName`/`hoCode`를 넘긴다. 동/호가 여러 개면 명시적으로 중단한다.

## 기본 호출

### 개별주택 PNU 조회

```bash
node -e "
const { lookupIndividualHousePriceByPnu } = require('housing-official-price');
lookupIndividualHousePriceByPnu('9999999999199999999')
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((err) => { console.error(err.code, err.message); process.exitCode = 1; });
"
```

### 공동주택 후보 검색

```bash
node -e "
const { searchApartmentCandidates } = require('housing-official-price');
searchApartmentCandidates({ complexName: '샘플하우징' })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((err) => { console.error(err.code, err.message); process.exitCode = 1; });
"
```

후보 예시:

```json
{
  "status": "ok",
  "query": { "type": "apartment", "complexName": "샘플하우징" },
  "candidates": [
    {
      "noticeDate": "20260626",
      "aptCode": "99000001",
      "complexName": "샘플하우징A동",
      "roadAddress": "테스트시 샘플구 예시대로 999",
      "landAddress": "테스트시 샘플구 예시동 999",
      "regCode": "99999",
      "eubCode": "99999",
      "pnu": "9999999999199999999",
      "rank": 1
    }
  ],
  "source": {
    "site": "realtyprice.kr",
    "endpoint": "/notice/m/town/getApt.do",
    "api_documented": false,
    "access": "public-web-data-surface"
  }
}
```

### 공동주택 가격 이력 조회

```js
const { lookupApartmentOfficialPrice } = require("housing-official-price");

const result = await lookupApartmentOfficialPrice({
  candidate: {
    noticeDate: "20260626",
    aptCode: "99000001",
    complexName: "샘플하우징A동",
  },
  dongName: "A",
  hoName: "101",
});
```

## 응답 JSON

개별주택 성공 예시:

```json
{
  "status": "ok",
  "query": { "type": "individual-house", "pnu": "9999999999199999999" },
  "selected": {
    "pnu": "9999999999199999999",
    "bjdCode": "9999999999",
    "regCode": "99999",
    "eubCode": "99999",
    "san": "1",
    "bun1": "9999",
    "bun2": "9999",
    "address": "테스트시 샘플구 예시동 999"
  },
  "history": [
    {
      "year": 2026,
      "base_date": "2026-01-01",
      "notice_date": "2026-04-30",
      "price_won": 232000000,
      "land_area_sqm": 57.5,
      "calculated_land_area_sqm": 21.2,
      "building_gross_area_sqm": 60,
      "residential_area_sqm": 55.25
    }
  ],
  "source": {
    "site": "realtyprice.kr",
    "endpoint": "/notice/search/hpiSearchListApi.search",
    "page": "https://www.realtyprice.kr/notice/hpindividual/search.htm",
    "api_documented": false,
    "access": "public-web-data-surface"
  }
}
```

공동주택 성공 예시:

```json
{
  "status": "ok",
  "query": { "type": "apartment", "complexName": "샘플하우징A동" },
  "selected": {
    "candidate": {
      "noticeDate": "20260626",
      "aptCode": "99000001",
      "complexName": "샘플하우징A동",
      "roadAddress": "테스트시 샘플구 예시대로 999",
      "landAddress": "테스트시 샘플구 예시동 999"
    },
    "unit": {
      "dongCode": "1",
      "dongName": "A",
      "hoCode": "1",
      "hoName": "101",
      "ktownHoSeq": "9900101"
    }
  },
  "history": [
    {
      "year": 2026,
      "base_date": "2026-01-01",
      "notice_date": "2026-06-26",
      "price_won": 232000000,
      "private_area_sqm": 57.5
    }
  ],
  "source": {
    "site": "realtyprice.kr",
    "endpoint": "/notice/m/town/getPriceYear.do",
    "page": "https://www.realtyprice.kr/notice/m/town/detail.do",
    "api_documented": false,
    "access": "public-web-data-surface"
  }
}
```

## 빈 결과와 에러 상태

| `error.code` | 의미 | 처리 |
| --- | --- | --- |
| `INVALID_PNU` | PNU가 19자리 숫자가 아니거나 토지구분 자리가 `1`/`2`가 아님 | 정확한 PNU 재요청 |
| `INVALID_SELECTOR` | 후보/동/호 선택값이 없거나 맞지 않음 | 후보 목록을 보여주고 더 구체적인 선택 요청 |
| `AMBIGUOUS_APARTMENT_CANDIDATE` | 공동주택 후보가 여러 개 | `aptCode` 또는 candidate 객체 선택 요청 |
| `AMBIGUOUS_APARTMENT_DONG` / `AMBIGUOUS_APARTMENT_HO` | 동/호 선택지가 여러 개 | 정확한 동/호 코드 또는 이름 요청 |
| `INDIVIDUAL_HOUSE_NOT_FOUND` | PNU에 해당하는 개별주택 가격 목록이 비어 있음 | 입력 PNU/필지 확인 안내 |
| `APARTMENT_CANDIDATE_NOT_FOUND` | 단지명 후보가 없음 | 단지명 철자/고시 기준명 확인 안내 |
| `UPSTREAM_AMBIGUOUS_EMPTY` | `totalCnt > 0`인데 list가 비어 있음 | realtyprice.kr 데이터/스키마 이상으로 보고 재시도 |
| `UPSTREAM_HTTP_ERROR` | upstream HTTP 오류 | 재시도 또는 출처 상태 확인 |
| `UPSTREAM_MALFORMED_JSON` / `UPSTREAM_MALFORMED_HTML` | JSON/HTML 파싱 실패 | 출처 변경 가능성으로 보고 중단 |
| `UPSTREAM_SCHEMA_DRIFT` | 필요한 필드가 사라지거나 타입이 달라짐 | 추측하지 않고 중단 |
| `UPSTREAM_TIMEOUT` | 기본 30초 `DEFAULT_TIMEOUT_MS` 또는 지정 `timeoutMs` 초과 | 짧은 재시도 또는 나중에 재조회 |
| `UPSTREAM_FETCH_ERROR` | 응답 전 네트워크 실패 | 네트워크/출처 상태 확인 |

## timeout/rate 정책

- 기본 timeout은 `DEFAULT_TIMEOUT_MS = 30000`이다.
- 호출자가 `signal`을 넘기면 그 signal을 보존하고, 패키지 내부 timeout signal을 추가로 만들지 않는다.
- 호출자가 `timeoutMs`를 넘기면 더 짧은 bounded timeout으로 사용할 수 있다.
- 사용자 질문 하나에 필요한 후보/동/호/가격 조회만 수행한다. 대량 수집, 백그라운드 크롤링, live 응답 fixture 저장은 하지 않는다.

## 안전 경계

- 로그인, CAPTCHA, 결제, 약관 동의, 법적 제출, 개인정보 수집은 범위 밖이다.
- 주택 공시가격은 정부 공시가격일 뿐 시세/실거래가/감정가가 아니다.
- 세금·법률 판단은 하지 말고, 계산 근거가 필요하면 전문가 확인을 권한다.
- 예시는 모두 합성값(`9999999999199999999`, `샘플하우징`, `테스트시 샘플구 예시동`)만 사용한다.

## 출처

- [부동산공시가격알리미 개별주택가격 화면](https://www.realtyprice.kr/notice/hpindividual/search.htm) — 국토교통부
- [부동산공시가격알리미 공동주택가격 모바일 화면](https://www.realtyprice.kr/notice/m/town/search.do) — 국토교통부
- 패키지 소스: [`packages/housing-official-price/`](../../packages/housing-official-price)
