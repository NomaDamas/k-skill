# geeknews-search — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# GeekNews Search

## What this skill does

GeekNews 공개 RSS/Atom 피드(`https://feeds.feedburner.com/geeknews-feed`)를 사용해 최신 글을 읽기 전용으로 조회한다.

- 최신 글 목록 조회
- 제목/요약/작성자 기준 검색
- 항목 id/link 기준 상세 확인

## When to use

- "긱뉴스 오늘 뭐 올라왔어?"
- "긱뉴스에서 Claude 관련 글 찾아줘"
- "이 GeekNews 글 요약/링크 확인해줘"

## Inputs

- 기본: 별도 인증 없이 public feed만 사용
- 목록 조회: `limit`
- 검색: `query`, 선택 `limit`
- 상세 조회: `id` 또는 링크/토픽 번호 일부

## Official surface

- GeekNews RSS/Atom feed: `https://feeds.feedburner.com/geeknews-feed`
- GeekNews home: `https://news.hada.io`

## Workflow

### 1) List recent entries

```bash
python3 scripts/geeknews_search.py list --limit 10
```

### 2) Search the feed conservatively

```bash
python3 scripts/geeknews_search.py search --query Claude --limit 5
```

검색은 제목, 요약, 작성자, 링크/id 기준으로만 동작한다.

### 3) Inspect a specific item

```bash
python3 scripts/geeknews_search.py detail --id 28439
```

상세 조회는 RSS 피드에 포함된 `content`/요약과 원문 링크를 함께 돌려준다.

## Done when

- 최신 GeekNews 글 목록을 바로 보여줄 수 있다.
- 키워드 검색 결과에서 제목/링크/작성자/요약을 정리할 수 있다.
- 특정 항목의 RSS 기반 내용을 보수적으로 확인하고 원문 링크를 함께 제시할 수 있다.

## Failure modes

- FeedBurner/GeekNews feed가 일시적으로 응답하지 않을 수 있다.
- RSS 피드가 제공하는 범위를 넘는 전체 본문/댓글/투표 정보는 포함되지 않는다.
- HTML 요약은 feed 원문 기준이라 일부가 잘릴 수 있다.

## Notes

- v1은 RSS-first, read-only 범위다.
- 비공식 API나 로그인 세션에 의존하지 않는다.
- 테스트/오프라인 검증 시 `--feed-file` 로 저장된 Atom XML을 넣을 수 있다.
