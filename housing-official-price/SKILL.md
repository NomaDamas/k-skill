---
name: housing-official-price
description: |
  Korean apartment and individual-house official price lookup through the public
  realtyprice.kr web data surface. Use when the user asks for 공동주택가격,
  개별주택가격, 아파트 공시가격, 단독주택 공시가격, or housing official price
  history. This is not land official price, transaction price, or building
  register metadata.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# Housing Official Price

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

`housing-official-price` looks up Korean official housing prices from the Ministry of Land 부동산공시가격알리미 (`realtyprice.kr`). It covers:

- apartment / 공동주택 official price histories by complex candidate + dong/ho selection
- individual-house / 개별주택 official price histories by 19-digit PNU

The source is a public read-only `realtyprice.kr` browser-visible public web data surface, not a documented OpenAPI / 공식 문서화된 OpenAPI가 아님. The package calls the upstream directly from the user's machine and does not use `k-skill-proxy`.

## Use the right neighboring skill

- `housing-official-price`: apartment and individual-house official prices (공동주택가격, 개별주택가격)
- `gongsijiga-search`: land official price / 개별공시지가, a per-square-meter land value for parcels
- `real-estate-search`: transaction data / 실거래가 and rent data, not government official price
- `building-register-search`: building register metadata / 건축물대장 표제부 such as use, area, floors, approval date

Do not present official prices as market value, transaction price, appraisal, tax/legal advice, ownership proof, or lien/right information.

## Prerequisites

- Node.js 18+
- Internet access
- `npm install housing-official-price`

No user login, CAPTCHA solving, API key, browser session, payment, or private credential is required. If `realtyprice.kr` shows a CAPTCHA/login/legal submission flow in the future, stop and ask for a manual source check instead of bypassing it.

## Access priority

1. Prefer a direct package call with synthetic or user-provided non-sensitive identifiers.
2. For individual houses, require an exact 19-digit PNU. Do not infer missing legal-dong/parcel digits.
3. For apartments, first call `searchApartmentCandidates({ complexName })`; if multiple candidates are returned, ask the user to choose or provide `aptCode`/`candidate`.
4. After an apartment candidate is fixed, call `lookupApartmentOfficialPrice` with explicit `dongCode`/`dongName` and `hoCode`/`hoName`. If dong/ho is ambiguous, stop and ask for a more specific selector.
5. Do not fall back to `k-skill-proxy`, VWorld, screen scraping, login automation, or unrelated real-estate datasets for this skill.

## API workflow

### Individual house by PNU

```bash
node -e "
const { lookupIndividualHousePriceByPnu } = require('housing-official-price');
lookupIndividualHousePriceByPnu('9999999999199999999')
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((err) => { console.error(err.code, err.message); process.exitCode = 1; });
"
```

### Apartment candidate search

```bash
node -e "
const { searchApartmentCandidates } = require('housing-official-price');
searchApartmentCandidates({ complexName: '샘플하우징' })
  .then((result) => console.log(JSON.stringify(result.candidates, null, 2)))
  .catch((err) => { console.error(err.code, err.message); process.exitCode = 1; });
"
```

If the candidate list has more than one row, show the user `complexName`, `roadAddress`, `landAddress`, `noticeDate`, and `aptCode`. Do not silently choose the first candidate.

### Apartment price history

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

## Output shape

All successful/empty responses include `source.api_documented: false` and `source.access: "public-web-data-surface"` so consumers remember this is a public web data surface, not a formal OpenAPI contract.

Individual-house OK response shape:

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
      "building_gross_area_sqm": 60,
      "residential_area_sqm": 55.25
    }
  ],
  "source": {
    "site": "realtyprice.kr",
    "endpoint": "/notice/search/hpiSearchListApi.search",
    "api_documented": false,
    "access": "public-web-data-surface"
  }
}
```

Apartment OK response shape:

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
    "unit": { "dongCode": "1", "dongName": "A", "hoCode": "1", "hoName": "101" }
  },
  "history": [
    { "year": 2026, "notice_date": "2026-06-26", "price_won": 232000000, "private_area_sqm": 57.5 }
  ],
  "source": {
    "site": "realtyprice.kr",
    "endpoint": "/notice/m/town/getPriceYear.do",
    "api_documented": false,
    "access": "public-web-data-surface"
  }
}
```

The client accepts both `model.list` and `modelMap.list`/`modelMap.totalCnt` response shapes because the browser-visible source has exposed both variants.

## Failure modes

| `error.code` | Meaning | Action |
| --- | --- | --- |
| `INVALID_PNU` | PNU is not exactly 19 digits or has an invalid land-type digit | Ask for a valid 19-digit PNU |
| `INVALID_SELECTOR` | Required apartment selector (`complexName`, `aptCode`, dong, ho) is missing or does not match returned choices | Ask for a more specific selector |
| `AMBIGUOUS_APARTMENT_CANDIDATE` | Multiple apartment candidates matched | Show candidates and ask the user to choose |
| `AMBIGUOUS_APARTMENT_DONG` / `AMBIGUOUS_APARTMENT_HO` | Multiple dong/ho choices matched | Ask for exact dong/ho code or name |
| `INDIVIDUAL_HOUSE_NOT_FOUND` / `APARTMENT_CANDIDATE_NOT_FOUND` | Upstream returned an empty result with zero count | Explain that the identifier may be wrong or not listed |
| `UPSTREAM_AMBIGUOUS_EMPTY` | Upstream reported `totalCnt > 0` but returned an empty/null list | Treat as upstream schema/data drift and retry later |
| `UPSTREAM_HTTP_ERROR` | Upstream HTTP was non-2xx | Retry later; include upstream status when safe |
| `UPSTREAM_MALFORMED_JSON` / `UPSTREAM_MALFORMED_HTML` | Upstream response could not be parsed | Treat as source drift/outage |
| `UPSTREAM_SCHEMA_DRIFT` | Expected list/detail fields were absent or invalid | Treat as source drift; do not guess |
| `UPSTREAM_TIMEOUT` | Request exceeded the default 30s `DEFAULT_TIMEOUT_MS` or caller timeout | Retry later or pass a bounded `timeoutMs` |
| `UPSTREAM_FETCH_ERROR` | Network failed before a response | Retry later; check connectivity |

## Rate, timeout, and safety policy

- Default timeout is `DEFAULT_TIMEOUT_MS` = 30000. Pass `timeoutMs` for a tighter bound or `signal` to preserve caller-managed cancellation.
- Keep calls user-triggered and low volume. Avoid bulk crawling, background harvesting, or saving live response values into repository fixtures.
- Use synthetic examples such as `9999999999199999999` and `샘플하우징`; do not publish personal addresses, live apartment names, session cookies, or response captures.
- This skill is read-only. It never logs in, solves CAPTCHA, accepts terms on behalf of the user, submits forms beyond lookup requests, or makes legal/tax judgments.

## Done when

- You used the direct package API and produced either normalized JSON or a typed failure mode.
- Ambiguous apartment candidates/dong/ho choices were surfaced to the user instead of guessed.
- You clearly labeled the value as government official housing price, not market/transaction price.
- Source metadata says `api_documented: false` and `public-web-data-surface`.
