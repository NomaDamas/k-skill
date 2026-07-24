# lovebug-report — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- When submission is requested, continue past lookup: open the exact official form, prefill every safe field, and attach prepared documents without submitting.
- Immediately before final submission (or any payment/cancellation it triggers), call `clarify` with the form target, key field values, and effect. After approval, submit and verify the receipt/confirmation.

# Lovebug Report

## What this skill does

`러브버그.com`(`https://xn--2i0bt2q2wd1wb.com/`)의 공개 지도/제보 표면을 이용해 러브버그(붉은등우단털파리) 관련 지역 정보를 취득하고, 사용자가 제공한 현재 위치 좌표로 익명 제보를 제출한다.

- 수도권 시·구별 러브버그 스코어와 최근 제보량을 조회한다.
- 동/읍/면 단위 area snapshot을 함께 조회해 어느 동네 제보인지 좁힌다.
- 사이트가 쓰는 익명 Supabase RPC 표면으로 제보를 보낸다.
- 좌표가 선택한 구 밖이거나 정확도가 낮거나 오늘 이미 같은 익명 기기에서 제보한 경우 upstream 거절을 그대로 알린다.

## When to use

- "우리 동네 러브버그 많아?"
- "중랑구 러브버그 현황 알려줘"
- "러브버그 지도에서 동안구 제보량 확인해줘"
- "현재 위치로 러브버그 많다고 제보해줘"

## Prerequisites

- 인터넷 연결
- Node.js 18+
- 이 저장소의 `lovebug-report` npm package 또는 동일 로직
- 제보 제출 시: 사용자가 제공한 현재 좌표(`lng`, `lat`), GPS 정확도, 구 코드(`gu_code`), 안정적인 익명 device hash

## Public access path discovered

### Primary source: lovebug.com public map JSON

- site: `https://xn--2i0bt2q2wd1wb.com/`
- gu score: `GET https://xn--2i0bt2q2wd1wb.com/api/map/gu-score`
- weekly report count: `GET https://xn--2i0bt2q2wd1wb.com/api/map/weekly-report-count`
- cluster snapshot: `GET https://xn--2i0bt2q2wd1wb.com/api/map/clusters?level=sigungu&historicalYear=2026`
- area snapshot: `GET https://xn--2i0bt2q2wd1wb.com/api/map/areas?historicalYear=2026&includePolygon=false`
- boundary GeoJSON: `GET https://xn--2i0bt2q2wd1wb.com/api/map/boundaries?level=sigungu`

Discovery result: the Next.js page loads these unauthenticated JSON endpoints directly. A live smoke on 2026-06-24 returned current `gu-score`, `weekly-report-count`, `clusters`, `areas`, and `boundaries` JSON.

No `k-skill-proxy` route is used because these upstream surfaces are public and do not require an API key.

### Anonymous report surface

The site bundle calls Supabase RPC `submit_anonymous_report` for logged-out reporting:

```http
POST https://sewrbxfawkmusnyzjoab.supabase.co/rest/v1/rpc/submit_anonymous_report
Content-Type: application/json
apikey: <site anon key>
Authorization: Bearer <site anon key>
```

Body:

```json
{
  "p_gu_code": "11070",
  "p_lng": 127.09,
  "p_lat": 37.59,
  "p_accuracy_m": 25,
  "p_level": 2,
  "p_device_hash": "stable-anonymous-device-id",
  "p_context": "street",
  "p_image_url": null,
  "p_indoor": false
}
```

Official level labels:

| `p_level` | Label |
| --- | --- |
| `0` | 잠잠해요 |
| `1` | 살짝 보임 |
| `2` | 많아요 |
| `3` | 매우 많아요 |

Official context labels:

| `p_context` | Label |
| --- | --- |
| `indoor` | 실내 |
| `street` | 길거리 |
| `park` | 공원 |
| `transit` | 지하철·버스 |
| `shop` | 상가 |
| `other` | 기타 |

## Workflow

### 1. Resolve the region

Use `searchLovebugRegions` first. It combines gu score and area snapshot rows.

```js
const { searchLovebugRegions } = require("lovebug-report")

const result = await searchLovebugRegions({
  query: "중랑",
  includeAreas: true,
  limit: 5
})

console.log(result.items)
```

CLI:

```bash
node packages/lovebug-report/src/cli.js search --query 중랑 --include-areas
node packages/lovebug-report/src/cli.js list --limit 10
node packages/lovebug-report/src/cli.js find --query 동안
```

Returned gu fields include:

- `gu_code`, `gu_name`, `sido`
- `score`, `score_label`, `level`, `level_label`, `advisory`
- `counts.report`, `counts.report_24h`, `counts.spotted`, `counts.quiet`, `counts.low`, `counts.medium`, `counts.high`
- `coordinates`
- `areas[]` when `includeAreas` is enabled

### 2. Answer conservatively

State that the score is based on recent lovebug.com user reports, not government-certified pest density.

Good answer shape:

- 지역: `중랑구`
- 러브버그 스코어: `77` / `엄청 많아요, 조심!`
- 최근 제보: `14일 439건`, `24시간 105건`
- 동네 detail: area rows that matched the query
- 출처: `러브버그.com 공개 지도 JSON`

### 3. Submit a report only when required inputs are known

Do not invent coordinates or device hash. If the user asks to report but the automation environment has no current location, state that `lng`, `lat`, and GPS accuracy are required.

```js
const { reportLovebug } = require("lovebug-report")

await reportLovebug({
  guCode: "11070",
  level: "많아요",
  context: "길거리",
  lng: 127.09,
  lat: 37.59,
  accuracyM: 25,
  deviceHash: "stable-anonymous-device-id"
})
```

CLI:

```bash
node packages/lovebug-report/src/cli.js report \
  --gu-code 11070 \
  --level 많아요 \
  --context 길거리 \
  --lng 127.09 \
  --lat 37.59 \
  --accuracy 25 \
  --device-hash stable-anonymous-device-id
```

## Done when

- Region status was fetched from `러브버그.com` public JSON.
- Region ambiguity was resolved with `gu_code`/`gu_name` when needed.
- Report submission used real current coordinates and the upstream RPC returned success.
- Source URL and user-report nature were disclosed.

## Failure modes

- `ANON_DAILY_DUPLICATE`: the same anonymous device already reported that region today.
- `OUTSIDE_GU_AREA`: supplied coordinates are outside `p_gu_code`.
- `ACCURACY_TOO_LOW`: GPS accuracy is too low for the upstream validation.
- Public Next.js/Supabase bundle keys, routes, table names, or RPC names can change.
- The map is user-report-based and can lag or be noisy.
- The site may add stricter rate limits, bot checks, login requirements, or image-upload restrictions.

## Notes

- No login, CAPTCHA bypass, queue bypass, or privileged workflow automation.
- No `k-skill-proxy` because upstream is public and keyless from the user's machine.
- Image upload is not handled by this skill; pass `imageUrl` only when a site-compatible image URL already exists.
