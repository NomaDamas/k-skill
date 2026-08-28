# hrdkorea-qualification-search — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec hrdkorea-qualification-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path hrdkorea-qualification-search <relative-path>` only when another tool explicitly requires a filesystem path.

# 국가자격 시험 일정 조회

한국산업인력공단 공식 국가자격 API로 시행년도·자격구분·종목 기준 시험 일정을 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec hrdkorea-qualification-search scripts/hrdkorea_qualification_search.py -- \
  exam-schedule --year 2026 --qualgb-cd T
```

프록시 route는 `GET /v1/hrdkorea/qualification/{operation}`이며 `exam-schedule`과 `qualification-items`를 지원한다. 공식 API 설명: <https://www.data.go.kr/data/15074408/openapi.do>.

운영자 키는 `DATA_GO_KR_API_KEY`로 proxy 서버에만 보관한다. 시험 일정은 공식 공고 조회이며 접수·결제·좌석 예약을 수행하지 않는다.
