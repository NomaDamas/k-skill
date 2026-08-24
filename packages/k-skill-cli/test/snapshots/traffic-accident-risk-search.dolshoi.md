# traffic-accident-risk-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec traffic-accident-risk-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path traffic-accident-risk-search <relative-path>` only when another tool explicitly requires a filesystem path.

# 교통사고 다발지역·통계 조회

한국도로교통공단 TAAS의 연도별 교통사고 다발지역과 지역 통계를 `k-skill-proxy`로 조회한다. 실시간 사고 신고, 보험·과실·법률·의료 판단은 지원하지 않는다.

## Workflow

```bash
npx -y @nomadamas/k-skill@0 exec traffic-accident-risk-search scripts/traffic_accident_risk_search.py -- \
  hotspots --category child --year 2024 --sido 11 --gugun 680
```

지원 category는 `child`, `bicycle`, `oldman`, `pedstrians`, `school-child`, `motorcycle`, `risk-area`다. 지역코드와 연도는 명시적으로 입력한다. `nearby`는 반환된 경도·위도를 반경 필터링하며 주소를 자동 지오코딩하지 않는다.

공식 출처: <https://opendata.koroad.or.kr/>. TAAS 데이터는 조회 연도의 공개 통계이며 현재 도로상황을 의미하지 않는다.

## Failure modes

- `400 bad_request`: 허용되지 않은 category, 잘못된 연도·지역코드·페이지.
- `503 upstream_not_configured`: proxy 운영자에게 `KOROAD_API_KEY`가 필요하다.
- `502 upstream_error`/`upstream_invalid_response`: 인증, quota, upstream 장애 또는 schema 변경.
- `total_count=0`: 조건에 맞는 공개 통계 없음.
