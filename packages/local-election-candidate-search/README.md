# local-election-candidate-search

Public Korean local election candidate lookup client for the `local-election-candidate-search` k-skill.

## Source

- Official public surface: 중앙선거관리위원회 선거통계시스템 통합검색 `https://info.nec.go.kr/search/searchCandidate.xhtml`
- Request method: unauthenticated `POST` with `searchKeyword=<exact candidate name>`.
- The NEC page states that integrated search looks up historical/recent preliminary candidates, candidates, and elected persons by exact name.

This client calls the public NEC HTML surface directly from the user's machine. No proxy, API key, login, CAPTCHA bypass, registration, or filing automation is used.

## Usage

```js
const { searchCandidates } = require("local-election-candidate-search")

const result = await searchCandidates({
  name: "오세훈",
  election: "시도지사",
  region: "서울",
  limit: 5
})
```

CLI:

```bash
local-election-candidate-search 오세훈 --election 시도지사 --region 서울 --limit 5
local-election-candidate-search 김동연 --date 2014 --election 기초의원
local-election-candidate-search 이재명 --all
```

## Returned fields

Each item includes parsed candidate/profile and election fields when present: `name`, `hanja`, `birth_date`, `gender`, `election_date`, `election_name`, `election_code`, `election_type`, `party`, `district`, `votes`, `vote_share`, `job`, `education`, and `career`.

By default, the client filters to local-election-related NEC election codes: 시·도지사(3), 구·시·군의 장(4), 시·도의회의원(5), 구·시·군의회의원(6), 광역비례(8), 기초비례(9), 교육감(11). Use `--all` / `localOnly:false` to include non-local races from NEC integrated search.

`summary.upstream_result_limit` records how many NEC rows were requested before local client-side filters were applied. When election/date/region/local filters are active, the client fetches up to 100 upstream rows first and then applies the user-facing `limit` after exact-name matching, filtering, and deduplication.

## Boundaries and failure modes

- NEC integrated search works best with exact Korean candidate names and may return homonyms; use `--election`, `--date`, and `--region` to narrow results.
- The upstream is HTML, so parser warnings are returned for empty results, maintenance pages, NetFunnel queues, login prompts, or unexpected markup changes.
- If the fetched upstream page reaches the 100-row cap while client-side filters are active, the result includes a warning that additional matches may require pagination.
- This package does not automate NEC detail popups, file downloads, account login, CAPTCHA, political filing, or any privileged workflow.
