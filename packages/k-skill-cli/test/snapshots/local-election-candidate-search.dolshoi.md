# local-election-candidate-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# Local Election Candidate Search

## What this skill does

중앙선거관리위원회(NEC) 선거통계시스템의 공개 통합검색에서 후보자 이름을 조회하고, 지방선거 관련 후보자 이력만 기본으로 정리한다. 후보자명, 한자명, 생년월일/성별, 선거일, 선거명, 선거종류, 정당, 선거구, 득표, 직업, 학력, 경력 등을 반환한다.

## When to use

- 사용자가 “지방선거 후보”, “시도지사 후보”, “기초의원 후보”, “교육감 후보” 등을 이름/지역/선거일 기준으로 찾아 달라고 할 때
- 중앙선관위 선거통계시스템에서 공개된 후보자 이력을 확인해야 할 때
- 동명이인이 있을 수 있어 후보자명 + 선거종류/지역/연도 필터가 필요한 때

## Public access path

Chosen path: NEC integrated candidate search.

- Entry page: `https://info.nec.go.kr/search/searchCandidate.xhtml`
- Method: unauthenticated public `POST`
- Required form field: `searchKeyword=<정확한 후보자 성명>`
- Helper package: `local-election-candidate-search`

Why this path: the visible NEC UI explicitly exposes candidate-name integrated search across recent and historical elections, and it returns the candidate result cards in server-rendered HTML. It is more stable than scraping per-election menu pages because it does not require selecting every city/town/constituency combo first.

## Workflow

1. Use the package CLI from this repository or installed workspace:

```bash
npx local-election-candidate-search 오세훈 --election 시도지사 --region 서울 --limit 5
```

2. Narrow ambiguous/homonym results:

```bash
npx local-election-candidate-search 김동연 --date 2014 --election 기초의원 --region 동작
```

3. Include non-local races only when the user asks for all NEC integrated-search matches:

```bash
npx local-election-candidate-search 이재명 --all --limit 20
```

## Inputs

- Candidate name: exact Korean name; required.
- `--election`: one of `시도지사`, `기초단체장`, `광역의원`, `기초의원`, `광역비례`, `기초비례`, `교육감`.
- `--date` / `--year`: `YYYY`, `YYYYMMDD`, or `YYYY.MM.DD`.
- `--region`: free text filter against parsed district/region text.
- `--limit`: max rows, capped at 100.
- `--all`: include non-local election results.

## Outputs

Return concise JSON. Each `items[]` row may include:

- `name`, `hanja`, `birth_date`, `gender`
- `election_date`, `election_name`, `election_code`, `election_type`
- `party`, `district`, `votes`, `vote_share`, `elected`
- `job`, `education`, `career[]`
- upstream code fields such as `city_code`, `sgg_city_code`, `town_code`

`summary.upstream_result_limit` shows the NEC row count requested before local client-side filters. Filtered searches request up to 100 upstream rows first, then apply exact-name matching, local/election/date/region filters, deduplication, and the final `--limit`.

## Failure modes

- `no candidate results`: NEC returned no matching card or filters removed all matches.
- `unexpected NEC search HTML`: upstream may be in maintenance, NetFunnel queue, login/blocked state, or markup changed.
- `NEC search page was capped`: filtered results are based on the maximum fetched page and may require upstream pagination for exhaustive coverage.
- Homonyms: the same name can appear across many elections; always show election date/type/district and apply user-provided filters.
- Future elections: candidate registration data may be incomplete until NEC publishes it.

## Done when

- Results are sourced from `info.nec.go.kr` public HTML.
- Local-election filtering is applied unless the user requested `--all`.
- Any warnings/failure modes are shown instead of silently claiming no results.
