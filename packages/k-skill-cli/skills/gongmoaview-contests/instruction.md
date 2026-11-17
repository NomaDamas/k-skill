# 공모아뷰 공모전·대외활동 조회

## What this skill does

공모아뷰가 직접 운영하는 읽기 전용 원격 MCP 서버를 호출해, 지금 접수 중인 공모전·대외활동·교육·강연 공고를 조건으로 찾고 공고 한 건을 자세히 읽는다.

- 엔드포인트: `https://www.gongmoaview.com/mcp` (Streamable HTTP MCP, 인증 불필요)
- 공모아뷰는 공모전·대외활동·교육 공고를 여러 사이트에서 모아 한곳에서 비교하는 서비스이고, 같은 공고는 하나로 묶어 올라온 사이트를 함께 보여준다
- 도구 2종 — `search_contests`(조건 검색), `get_contest`(공고 한 건 읽기). 둘 다 읽기 전용이다
- 반환값은 공고 제목·유형·주최·마감일·1등 상금·올라온 사이트 수·공모아뷰 공고 페이지 링크다
- 지원과 접수는 하지 않는다. 지원은 각 공고의 주최 측 원문에서 해야 한다

서버가 무상태라 `initialize` 핸드셰이크와 세션 ID 없이 단일 POST 로 `tools/call` 이 동작한다. MCP SDK 를 설치하지 않고 `curl` 로 호출한다.

## When to use

- "이번 주 안에 마감되는 대학생 공모전 알려줘"
- "상금이 큰 네이밍·슬로건 공모전 찾아줘"
- "서울 지역 서포터즈 대외활동 보여줘"
- "오늘 새로 올라온 공모전 있어?"
- "이 공모전 접수 기간이랑 대상, 상금, 주최 알려줘"

## When not to use

- 지원서 제출·접수 대행 — 이 서버는 읽기 전용이다. 지원은 공고 원문(주최 측)에서 한다
- 이미 마감된 공고 — 접수 중인 공고만 다룬다
- 채용 공고 — 취업·창업 분야 공모전은 있어도 채용 공고 사이트가 아니다. 채용은 `daangn-jobs-search` 등 채용 스킬을 쓴다
- 공모아뷰가 모으지 않는 사이트의 공고 — 결과에 없으면 없다고 답한다

## Endpoint contract

- POST 만 쓴다. GET 은 405 다.
- 요청 본문은 JSON-RPC 2.0 한 개(JSON 객체)다. 배열(배치)은 받지 않는다.
- `Accept` 헤더에 `application/json` 과 `text/event-stream` 을 둘 다 넣는다. MCP 규격 관례이고 서버는 JSON 으로 응답한다.
- `initialize`, `notifications/initialized`, `Mcp-Session-Id` 는 필요 없다.
- `User-Agent` 를 `k-skill-gongmoaview/1.0` 으로 보낸다. 공모아뷰 쪽에서 k-skill 경유 트래픽을 구분해서 본다.
- 한 번에 최대 20건, 요청 본문은 20KB 까지다. 요청이 너무 잦으면 공모아뷰가 제한할 수 있으니 같은 질의를 반복 호출하지 않는다.

기본 호출:

```bash
curl -fsS --max-time 30 https://www.gongmoaview.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-gongmoaview/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_contests","arguments":{"type":"contest","target":["univ"],"due":"7","sort":"due","limit":10}}}'
```

응답의 `result.content[0].text` 가 사람이 읽는 목록이다. 한 줄이 공고 하나이고 `제목 — 유형 · 주최 · 마감 · 1등 상금 · 출처 N곳 · 공모아뷰 링크` 순서다. 응답에 `structuredContent` 는 없다.

공고 한 건 읽기 (`id` 는 검색 결과 링크 `/contests/123-제목` 의 숫자):

```bash
curl -fsS --max-time 30 https://www.gongmoaview.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-gongmoaview/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_contest","arguments":{"id":23821}}}'
```

MCP 클라이언트에 직접 등록해도 된다. 이 경로에서는 서버가 보내는 instructions 도 함께 전달된다.

```bash
claude mcp add --transport http gongmoaview https://www.gongmoaview.com/mcp
codex mcp add gongmoaview --url https://www.gongmoaview.com/mcp
```

## 도구 선택

| 사용자 발화 | 도구 | 인자 |
| --- | --- | --- |
| "공모전 찾아줘", "마감 임박한", "상금 큰" 등 조건 검색 | `search_contests` | 아래 인자 표 (전부 선택) |
| "이 공고 자세히", 접수 기간·대상·상금·주최 확인 | `get_contest` | `id` (필수, 정수) |

`search_contests` 인자 (전부 선택):

| 인자 | 타입 | 설명 |
| --- | --- | --- |
| `q` | string | 검색어 (제목·주최), 60자까지 |
| `type` | string | `contest` 공모전, `outside` 대외활동, `educate` 교육·강연 |
| `field` | string[] | 분야 코드, 여러 개 가능 |
| `target` | string[] | 대상 코드, 여러 개 가능 |
| `due` | string | 마감 조건 |
| `area` | string[] | 지역 코드, 여러 개 가능 |
| `sort` | string | `due` 마감 임박 순(기본), `new` 최근 등록 순, `prize` 상금 높은 순, `sources` 여러 사이트에 올라온 순 |
| `fresh` | string | `today` 또는 `yesterday` — 그날 새로 들어온 공고만 |
| `limit` | integer | 1~20, 기본 10 |

`field` 코드: `idea` 기획·아이디어, `design` 디자인·건축, `art` 미술·음악, `video` 영상·사진, `writing` 문학·논문, `naming` 네이밍·슬로건, `it` IT·과학, `marketing` 광고·마케팅, `startup` 취업·창업, `supporters` 서포터즈·기자단, `volunteer` 봉사·체험, `etc` 기타

`target` 코드: `kid` 초등 이하, `teen` 중·고생, `univ` 대학(원)생, `adult` 일반, `biz` 기업

`due` 값: `3` 3일 이내, `7` 7일 이내, `30` 30일 이내, `month` 한 달쯤 남음

`area` 코드: `nation` 전국·온라인, `seoul` 서울, `gyeonggi` 경기, `incheon` 인천, `gangwon` 강원, `daejeon` 대전, `sejong` 세종, `chungbuk` 충북, `chungnam` 충남, `gwangju` 광주·전남, `jeonbuk` 전북, `daegu` 대구, `gyeongbuk` 경북, `busan` 부산, `ulsan` 울산, `gyeongnam` 경남, `jeju` 제주, `unknown` 별도 확인 필요

코드는 위 표에 없는 값을 추측해서 쓰지 않는다. 서버는 알 수 없는 `type`·`due`·`sort` 를 조용히 무시하므로 오타가 나도 오류 없이 조건만 빠진다. 불확실하면 `https://www.gongmoaview.com/llms.txt` 나 `tools/list` 로 현재 값을 확인한다.

```bash
curl -fsS --max-time 30 https://www.gongmoaview.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-gongmoaview/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Workflow

1. 요청을 조건(유형·분야·대상·마감·지역·정렬)으로 바꾼다. "이번 주"는 `due: "7"` 로 근사하고, 정확한 마감일은 결과의 마감 날짜로 판단한다. 지역 언급이 없으면 `area` 를 넣지 않는다.
2. `search_contests` 로 호출한다. 결과가 너무 많으면 `limit` 을 줄이고 조건을 좁힌다. 결과가 없으면 조건을 줄여 다시 한 번만 호출한다.
3. 상위 3~5건을 제목·주최·마감일·1등 상금·공모아뷰 링크로 정리한다.
4. 사용자가 한 건을 더 알고 싶어 하면 결과 링크 `/contests/<숫자>-제목` 의 숫자를 `id` 로 `get_contest` 를 호출한다.
5. 답변에 "공모아뷰" 를 출처로 밝히고, 결과의 공모아뷰 공고 링크를 그대로 건다.

## Response style

- **출처로 "공모아뷰" 를 밝힌다.** 이 서버가 결과 끝에 같은 문구를 붙여 보낸다.
- 공고 제목은 결과의 제목을 그대로 쓴다. 의역하거나 줄이지 않는다.
- 공고 링크는 결과의 공모아뷰 공고 페이지 주소를 그대로 쓴다. 원문 사이트 주소를 추측해서 만들지 않는다. 주최 측 원문은 `get_contest` 결과에 나올 때만 안내한다.
- 마감 시각(몇 시까지)은 공모아뷰 요약에 없는 경우가 많다. 날짜만 알려주고, 시각은 원문에서 확인하라고 안내한다.
- 지원 자격, 2위 이하 상금, 제출 규격처럼 요약에 없는 조건은 추측하지 않고 원문에서 확인하라고 안내한다.
- 접수는 공모아뷰가 아니라 각 공고의 주최 측 원문에서 한다고 알린다.
- "출처 N곳" 은 같은 공고가 올라온 사이트 수이고, 주최 측과는 무관하다.

## Failure modes

- `405 Method Not Allowed` — GET 을 썼다. POST 로 바꾼다.
- `413` — 요청 본문이 20KB 를 넘었다. 인자를 줄인다.
- `403` — `Origin` 헤더를 넣었는데 공모아뷰 주소가 아니다. 서버용 호출에서는 `Origin` 을 보내지 않는다.
- JSON-RPC `error` `-32700`/`-32600` — JSON 이 아니거나 객체 하나가 아니다. 본문을 고친다.
- `result.isError: true` — `get_contest` 의 번호에 해당하는 접수 중 공고가 없다(마감됐거나 번호가 틀림). 검색으로 다시 찾는다.
- 결과 0건 — 조건에 맞는 접수 중 공고가 없다. 조건을 줄이거나 없다고 답한다. 재시도 루프를 만들지 않는다.
- 연결 실패·5xx — 공모아뷰 서버 문제다. 재시도 루프를 만들지 않고 지금 조회할 수 없다고 알린다.

## Privacy

- 인증·로그인·개인화가 없는 공개 조회 전용이다. 시크릿을 요구하지 않는다.
- 사용자의 개인정보를 보내지 않는다. 검색 조건(유형·분야·마감 등)만 보낸다.
- 검색어와 결과를 영구 저장하지 않는다.

## Done when

- 요청을 조건으로 바꿔 `search_contests` 를 호출했다.
- 상위 후보를 제목·주최·마감일·1등 상금·공모아뷰 링크로 정리했다.
- 출처로 "공모아뷰" 를 밝혔다.
- 한 건을 요청받았다면 `get_contest` 로 접수 기간·대상·상금·주최를 알렸다.
- 접수는 주최 측 원문에서 해야 한다고 안내했다.
- 실패 시 재시도 루프 없이 원인을 알렸다.
