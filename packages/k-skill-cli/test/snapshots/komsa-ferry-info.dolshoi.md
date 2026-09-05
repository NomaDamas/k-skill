# komsa-ferry-info — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec komsa-ferry-info scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path komsa-ferry-info <relative-path>` only when another tool explicitly requires a filesystem path.

# KOMSA 연안여객선 정보 조회

## What this skill does

한국해양교통안전공단(KOMSA) MTIS Open API를 통해 연안여객선 운항 일정, 선박 제원, 기항지, 면허항로, 운항항로, 운항상태를 조회한다. 예매·결제·로그인 자동화는 하지 않는다.

## Public access path

기본 경로는 hosted/self-host `k-skill-proxy`의 좁은 read-only route다.

- 공식 포털: <https://mtisopenapi.komsa.or.kr/>
- 운항 일정: `https://mtisopenapi.komsa.or.kr/eopt/api/oprt-schd-info`
- 운항노선: `https://mtisopenapi.komsa.or.kr/eopt/api/oprt-line-info`
- 선박 제원: `https://mtisopenapi.komsa.or.kr/eopt/api/psnshp-spec`
- 프록시: `GET /v1/komsa/ferry/{dataset}`

지원 dataset은 `schedules`, `vessels`, `ports`, `license-routes`, `operation-routes`, `status`다. upstream `serviceKey`는 프록시 서버의 `KOMSA_MTIS_API_KEY` 또는 `KSKILL_KOMSA_MTIS_API_KEY`로만 주입한다.

## Workflow

Helper 실행:

```bash
npx -y @nomadamas/k-skill@0 exec komsa-ferry-info scripts/komsa_ferry_info.py -- \
  schedules --date 20260824 --vessel 섬사랑12호 --limit 10
```

프록시를 직접 확인하려면:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/komsa/ferry/schedules" \
  --data-urlencode "date=20260824" \
  --data-urlencode "vessel=섬사랑12호" \
  --data-urlencode "limit=10"
```

입력은 날짜(`YYYYMMDD` 또는 `YYYY-MM-DD`), 선박명/코드, 항로명/코드, 기항지명/코드, 페이지와 결과 수를 사용한다. 응답의 `items`는 공식 원문 필드를 보존하며, 일정 응답에는 출항일자·시각·출발지·도착지·항로·운항상태가 포함될 수 있다.

## Done when

- 공식 MTIS route를 통해 선택한 dataset을 조회했다.
- 결과에 조회 dataset, 페이지, 결과 수와 공식 upstream 출처를 함께 표시했다.
- 데이터가 5분 주기로 갱신될 수 있음을 밝히고, 운항정보를 예매 가능 좌석이나 결제 결과로 해석하지 않았다.

## Failure modes

- `400 bad_request`: 허용되지 않은 dataset, 잘못된 날짜, 페이지 또는 결과 수.
- `503 upstream_not_configured`: 프록시 운영자에게 `KOMSA_MTIS_API_KEY` 설정이 필요하다.
- `502 upstream_error` / `502 upstream_invalid_response`: MTIS 인증 오류, quota 초과, upstream 장애 또는 응답 형식 변경.
- `504 upstream_timeout`: 공식 API가 시간 내 응답하지 않음.
- `total_count = 0`: 날짜·항로·선박 조건에 맞는 결과 없음.

MTIS OpenAPI 이용신청/키 발급은 공식 포털 회원가입·로그인 후 진행한다. 키를 채팅, 저장소, GitHub Actions에 넣지 않는다.
