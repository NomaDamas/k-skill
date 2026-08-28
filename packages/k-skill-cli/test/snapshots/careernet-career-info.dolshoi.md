# careernet-career-info — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec careernet-career-info scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path careernet-career-info <relative-path>` only when another tool explicitly requires a filesystem path.

# 커리어넷 진로·직업정보 조회

커리어넷 직업백과 공식 API로 직업명 검색과 직업 상세 정보를 조회한다. 결과는 진로 참고자료이며 개인의 적성·진로를 단정하지 않는다.

```bash
npx -y @nomadamas/k-skill@0 exec careernet-career-info scripts/careernet_career_info.py -- \
  search --keyword 개발자 --limit 10
```

상세 조회:

```bash
npx -y @nomadamas/k-skill@0 exec careernet-career-info scripts/careernet_career_info.py -- \
  detail --seq 123
```

proxy route는 `GET /v1/careernet/career/search`와 `/detail`이며 upstream API key는 `CAREERNET_API_KEY` 또는 `KSKILL_CAREERNET_API_KEY`로 proxy 서버에만 보관한다.

공식 가이드: <https://www.career.go.kr/cnet/front/openapi/openApiJobCenter.do>
