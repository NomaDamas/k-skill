# customs-cargo-clearance — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec customs-cargo-clearance scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path customs-cargo-clearance <relative-path>` only when another tool explicitly requires a filesystem path.

# 수입화물 통관 진행 조회

관세청 UNI-PASS 화물통관진행정보 공식 API를 통해 화물관리번호 또는 Master/House B/L 기준 통관 이벤트와 현재 상태를 조회한다. 통관 결과를 관세 신고·법률 판단·납부 완료로 해석하지 않는다.

## Workflow

```bash
npx -y @nomadamas/k-skill@0 exec customs-cargo-clearance scripts/customs_cargo_clearance.py -- \
  --hbl-no HBL123 --bl-year 2024
```

프록시 route는 `GET /v1/customs/cargo-clearance`다. `cargMtNo` 또는 `hblNo`/`mblNo`와 `blYear`를 사용한다. 기본 upstream은 <https://unipass.customs.go.kr/>이며 3년 이내 데이터만 조회 가능하다.

운영자 키는 `DATA_GO_KR_API_KEY`로 proxy 서버에만 주입한다. 키는 PR·issue·chat에 넣지 않는다.

## Failure modes

- `400 bad_request`: 식별자 누락 또는 B/L 연도 형식 오류.
- `503 upstream_not_configured`: proxy 운영자 키 미설정.
- `502 upstream_forbidden`: UNI-PASS 활용신청·키·quota 문제.
- `504 upstream_timeout`: 공식 API 시간 초과.
