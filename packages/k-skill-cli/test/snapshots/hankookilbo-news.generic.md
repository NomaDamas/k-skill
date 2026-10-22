# hankookilbo-news — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 한국일보 뉴스 조회

## What this skill does

한국일보가 운영하는 공식 원격 MCP 서버를 직접 호출해 기사 메타데이터를 조회한다.

- 엔드포인트: `https://mcp.hankookilbo.com/mcp` (Streamable HTTP MCP, 인증 불필요)
- 공식 MCP Registry 등재명: `com.hankookilbo.mcp/hankookilbo-mcp`
- 도구 10종 — 편집 헤드라인, 많이 본, 꼼꼼히 본, 시간대 추천, 최신, 섹션별 편집 추천, 주제 검색, 섹션 목록, 오늘의 운세, MBTI 운세
- 반환값은 기사 메타데이터다: 기사 ID, 제목, 원문 URL, 썸네일 URL, 발행시각, 기사 유형, 원문 접근성, 짧은 발췌(`excerpt`)
- 기사 본문 전문은 반환하지 않는다

서버가 무상태라 `initialize` 핸드셰이크와 세션 ID 없이 단일 POST 로 `tools/call` 이 동작한다. MCP SDK 를 설치하지 않고 `curl` 로 호출한다.

## When to use

- "한국일보 헤드라인 보여줘"
- "한국일보에서 많이 본 기사"
- "오늘 한국일보 정치면 추천 기사"
- "한국일보에 이 사건 기사 있어?"
- "오늘의 운세", "MBTI 운세" (한국일보 지면 기준)
- 한국일보가 무엇을 머리기사로 올렸는지, 즉 편집 판단 자체가 필요할 때

## When not to use

- 언론사를 가리지 않는 일반 뉴스 키워드 검색 — 이 서버는 한국일보 기사만 반환한다
- 기사 본문 전문이 필요할 때 — 이 스킬은 메타데이터만 반환한다. 본문은 `item.url` 원문에서만 볼 수 있다
- 한국경제(한경)나 다른 언론사 기사 — 이 서버는 종합일간지 한국일보 전용이다
- 로그인 뒤에만 보이는 기사의 본문 — `item.view_type` 이 `LoginWall` 이면 원문 열람에 로그인이 필요하다
- 주식·환율 시세, 실시간 데이터 — 이 서버는 기사만 다룬다

## Endpoint contract

- POST 만 쓴다. GET·PUT·DELETE·OPTIONS 는 405 다.
- `Accept` 헤더에 `application/json` 과 `text/event-stream` 을 **둘 다** 넣는다. MCP Streamable HTTP 규격이 클라이언트에 요구하는 사항이고, 서버 응답이 나중에 SSE 로 바뀌어도 깨지지 않는다. `Accept` 를 아예 빼면 406 이다.
- `initialize`, `notifications/initialized`, `Mcp-Session-Id` 는 필요 없다.
- `User-Agent` 를 `k-skill-hankookilbo/1.0` 으로 보낸다. 한국일보 쪽에서 k-skill 경유 트래픽을 분리 관측한다.

기본 호출:

```bash
curl -fsS --max-time 35 https://mcp.hankookilbo.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-hankookilbo/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_top_headlines","arguments":{}}}'
```

기사 목록은 `result.structuredContent.items` 에 들어온다. `result.content[0].text` 는 사람이 읽는 요약본이다. 목록을 정리할 때는 `structuredContent` 를 쓴다.

```bash
curl -fsS --max-time 35 https://mcp.hankookilbo.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-hankookilbo/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_popular_news","arguments":{"section_cd":"economy","page_size":5}}}' \
  | python3 -c 'import json,sys
for i in json.load(sys.stdin)["result"]["structuredContent"]["items"]:
    print(i["published_at"], "|", i["title"], "|", i["url"])'
```

MCP 클라이언트에 직접 등록해도 된다. 이 경로에서는 서버가 보내는 instructions 도 함께 전달된다.

```bash
claude mcp add --transport http hankookilbo https://mcp.hankookilbo.com/mcp
codex mcp add hankookilbo --url https://mcp.hankookilbo.com/mcp
```

## 도구 선택

| 사용자 발화 | 도구 | 인자 |
| --- | --- | --- |
| "헤드라인", "오늘 주요 뉴스", "제일 중요한 뉴스" | `list_top_headlines` | 없음 |
| "많이 본", "인기 뉴스", "지금 뜨는" | `list_popular_news` | `section_cd`, `page_size`, `exclude_section_cd` (전부 선택) |
| "꼼꼼히 본", "정독할 만한" | `list_most_read_news` | 없음 |
| "지금 볼만한", "출근길에 볼 뉴스" | `list_timely_news` | 없음 |
| "최신 기사", "방금 올라온" | `list_latest_news` | `page_num` (1부터, 기본 1), `page_size` (선택) |
| 섹션별 편집 추천 | `list_recommended_articles` | `section_cd` (필수), `page_size` |
| 주제·인물·사건 검색, "왜 화제야" | `search_news` | `query` (필수), `limit` |
| 섹션 코드 확인 | `list_sections` | 없음 |
| "오늘의 운세", "띠별 운세" | `get_daily_horoscope` | `date` (선택) |
| "MBTI 운세" | `get_mbti_horoscope` | `date` (선택) |

`section_cd` 값:

- `politics` 정치
- `economy` 경제
- `society` 사회
- `world` 국제
- `culture` 문화
- `sports` 스포츠
- `life` 라이프
- `people` 사람
- `local` 지역
- `opinion` 오피니언

값을 추측하지 말고 불확실하면 `list_sections` 로 확인한다.

도구 이름이나 인자가 위 표와 다르거나 불확실하면 `tools/list` 로 현재 스키마를 확인한다.

```bash
curl -fsS --max-time 35 https://mcp.hankookilbo.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-hankookilbo/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

세 가지 목록이 서로 다르다.

- `list_top_headlines` — 편집부가 비중 있게 배치한 머리기사
- `list_popular_news` — 조회수 기준 인기 순위. "많이 본"은 이쪽이다
- `list_recommended_articles` — 섹션별 편집 추천. 순위 값을 갖지 않는다

## Workflow

1. 요청을 위 표로 분류한다. 섹션이 필요한데 불확실하면 `list_sections` 를 먼저 호출한다.
2. `curl` 로 해당 도구를 호출한다.
3. `result.structuredContent.items` 상위 3~5건을 제목·발행시각·원문 링크로 정리한다.
4. `search_news` 는 응답이 30초에 가까울 수 있다. `--max-time 35` 를 주고, 타임아웃되면 재시도하지 말고 질의를 좁혀 다시 묻는다.

## Response style

- **기사 제목은 `item.title` 원문을 그대로 인용한다.** 요약·의역·말줄임·기호 변경·맞춤법 교정을 거치면 실제 보도 제목과 달라진다. `[제목](url)` 형태가 원문 표기와 가장 일치한다.
- `item.excerpt` 는 기사 도입부 일부이고 기사 전체 요약이 아니다. 발췌에 없는 해석·평가·배경·결말을 이 데이터로 단정하지 않는다.
- 본문 전문은 `item.url` 에서만 확인할 수 있다. 본문 내용을 재구성하지 않고 링크를 제시한다.
- `item.view_type` 이 `LoginWall` 이면 원문 열람에 로그인이 필요하다고 함께 알린다.
- `items` 가 비어 있지 않다는 것은 그 조건의 기사가 존재한다는 뜻이다. 목록을 임의로 누락시키지 않는다.
- 운세 도구는 운세 내용을 반환하지 않는다. 제목·발행일·원문 링크만 전달하고 운세 내용은 원문 링크로 넘긴다.
- 원문 URL 에는 서버가 `?did=mcp` 유입 파라미터를 붙여 돌려준다. 링크를 제시할 때 이 파라미터를 지우지 않는다.

## Failure modes

- `406 Not Acceptable` — `Accept` 헤더가 없다. `application/json, text/event-stream` 을 채워 재시도한다.
- `405 Method Not Allowed` — POST 가 아닌 메서드를 썼다. POST 로 바꾼다.
- `result.isError: true` — 도구 인자가 잘못됐다. `section_cd` 오타, `query` 누락을 확인한다.
- `504` — `search_news` 가 제한 시간을 넘겼다. 재시도 루프를 만들지 말고 질의를 좁힌다.
- 빈 `items` — 해당 조건의 기사가 없다. 섹션·질의를 바꿔 다시 시도하거나 없다고 답한다.
- 연결 실패 — 한국일보 측 서버 장애다. 재시도 루프를 만들지 않고 현재 조회 불가임을 분명히 말한다.

## Privacy

- 인증·로그인·개인화가 없는 공개 조회 전용이다. 시크릿을 요구하지 않는다.
- 기사 본문을 요청하거나 저장하지 않는다.
- 검색어와 결과를 영구 저장하지 않는다.

## Done when

- 요청 유형에 맞는 도구를 골랐다.
- `structuredContent.items` 기준으로 상위 후보를 제목·발행시각·원문 링크로 정리했다.
- 제목을 원문 그대로 인용하고 `[제목](url)` 링크를 제시했다.
- 본문이 필요한 요청이면 본문은 원문 링크에서만 볼 수 있다고 안내했다.
- 실패 시 재시도 루프 없이 원인을 알렸다.
