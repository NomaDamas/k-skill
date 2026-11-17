---
title: 공모아뷰 공모전·대외활동 조회 가이드
description: 공모아뷰 공식 원격 MCP 서버를 인증 없이 curl 로 직접 호출해 접수 중인 공모전·대외활동·교육 공고를 검색하고 조회하는 방법
---

# 공모아뷰 공모전·대외활동 조회 가이드

## 이 기능으로 할 수 있는 일

- 접수 중인 공모전·대외활동·교육·강연 공고를 유형·분야·대상·마감 시기·지역·검색어로 검색
- 마감 임박 순·최근 등록 순·상금 높은 순·여러 사이트에 올라온 순으로 정렬
- 오늘·어제 새로 들어온 공고만 보기
- 공고 한 건의 접수 기간·대상·상금·주최와 그 공고가 올라온 사이트 확인

## 가장 중요한 규칙

기본 경로는 `https://www.gongmoaview.com/mcp` 이고 **인증이 필요 없다**. 공모아뷰가 직접 운영하는 공개 읽기 전용 MCP 서버이므로 `k-skill-proxy` 를 경유하지 않고 사용자 머신에서 바로 호출한다.

서버가 무상태라 `initialize` 핸드셰이크와 세션 ID 없이 단일 POST 로 `tools/call` 이 동작한다. 따라서 MCP SDK 없이 `curl` 만 쓴다.

이 스킬은 **공고 정보 조회만** 한다. 지원서 제출이나 접수 대행은 하지 않으며, 지원은 각 공고의 주최 측 원문에서 해야 한다. 공모아뷰는 공고를 직접 주최하거나 접수하지 않는다.

## 먼저 필요한 것

- 인터넷 연결
- `curl`
- 응답 확인용 `python3` (선택)

## 지원 도구

| 도구 | 설명 | 필수 인자 |
| --- | --- | --- |
| `search_contests` | 접수 중 공고를 조건으로 검색 (한 번에 최대 20건) | 없음 |
| `get_contest` | 공고 한 건의 접수 기간·대상·상금·주최 읽기 | `id` |

두 도구 모두 `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false` 로 선언돼 있다.

## 기본 호출

```bash
curl -fsS --max-time 30 https://www.gongmoaview.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-gongmoaview/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_contests","arguments":{"type":"contest","target":["univ"],"due":"7","sort":"due","limit":10}}}'
```

결과 목록을 보기 좋게 출력하는 예시:

```bash
curl -fsS --max-time 30 https://www.gongmoaview.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-gongmoaview/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_contests","arguments":{"type":"outside","field":["supporters"],"area":["seoul"],"limit":5}}}' \
  | python3 -c 'import json,sys
print(json.load(sys.stdin)["result"]["content"][0]["text"])'
```

공고 한 건 읽기 (`id` 는 검색 결과 링크 `/contests/123-제목` 의 숫자):

```bash
curl -fsS --max-time 30 https://www.gongmoaview.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'User-Agent: k-skill-gongmoaview/1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_contest","arguments":{"id":23821}}}'
```

MCP 클라이언트에 직접 등록할 수도 있다.

```bash
claude mcp add --transport http gongmoaview https://www.gongmoaview.com/mcp
codex mcp add gongmoaview --url https://www.gongmoaview.com/mcp
```

## 검색 인자

| 인자 | 설명 |
| --- | --- |
| `q` | 검색어 (제목·주최), 60자까지 |
| `type` | `contest` 공모전, `outside` 대외활동, `educate` 교육·강연 |
| `field` | 분야 코드 배열: `idea` `design` `art` `video` `writing` `naming` `it` `marketing` `startup` `supporters` `volunteer` `etc` |
| `target` | 대상 코드 배열: `kid` 초등 이하, `teen` 중·고생, `univ` 대학(원)생, `adult` 일반, `biz` 기업 |
| `due` | `3` `7` `30` 일 이내, `month` 한 달쯤 남음 |
| `area` | 지역 코드 배열: `nation` `seoul` `gyeonggi` `incheon` `gangwon` `daejeon` `sejong` `chungbuk` `chungnam` `gwangju` `jeonbuk` `daegu` `gyeongbuk` `busan` `ulsan` `gyeongnam` `jeju` `unknown` |
| `sort` | `due`(기본) `new` `prize` `sources` |
| `fresh` | `today` 또는 `yesterday` |
| `limit` | 1~20, 기본 10 |

서버는 알 수 없는 `type`·`due`·`sort` 값을 오류 없이 무시한다. 코드 값은 `https://www.gongmoaview.com/llms.txt` 나 `tools/list` 로 확인한다.

## 응답 구조

- `result.content[0].text` — 사람이 읽는 결과. `structuredContent` 는 없다
- 검색 결과 한 줄: `제목 — 유형 · 주최 · 마감 날짜 · 1등 상금(만원) · 출처 N곳 · 공모아뷰 공고 링크`
- 결과 끝에 "출처: 공모아뷰" 문구와 전체 목록 주소 `https://www.gongmoaview.com/contests` 가 붙는다
- `get_contest` 는 접수 기간·대상·상금·주최와 그 공고가 올라온 사이트를 마크다운으로 돌려준다
- 번호에 해당하는 접수 중 공고가 없으면 `result.isError: true` 다

## 운영 팁

- 답변에는 "공모아뷰" 를 출처로 밝히고 결과의 공모아뷰 공고 링크를 그대로 건다.
- 마감 시각(몇 시까지)은 요약에 없는 경우가 많다. 날짜만 전달하고 시각은 원문 확인을 안내한다.
- 접수는 각 공고의 주최 측 원문에서 한다. 원문 주소를 추측해서 만들지 않는다.
- "이번 주 마감"은 `due: "7"` 로 근사하고 정확한 날짜는 결과의 마감일로 판단한다.
- 같은 질의를 반복 호출하지 않는다. 요청이 너무 잦으면 공모아뷰가 제한할 수 있다.

## 실패 모드

- `405`: GET 등 POST 가 아닌 메서드
- `413`: 요청 본문이 20KB 초과
- `403`: 공모아뷰 주소가 아닌 `Origin` 헤더를 보냄
- JSON-RPC `-32700`/`-32600`: JSON 이 아니거나 객체 하나가 아님
- `result.isError: true`: `get_contest` 의 번호에 해당하는 접수 중 공고 없음
- 결과 0건: 조건에 맞는 공고 없음. 조건을 줄여 한 번만 다시 시도
- 연결 실패·5xx: 서버 문제. 재시도 루프 금지

## 출처/참고

- 공모아뷰 공식 MCP 엔드포인트: https://www.gongmoaview.com/mcp
- 서버 카드: https://www.gongmoaview.com/.well-known/mcp/server-card.json
- 코드표와 서비스 설명: https://www.gongmoaview.com/llms.txt
- 서버 소개 저장소: https://github.com/aview03/GongmoaView-MCP
- MCP Streamable HTTP 전송 규격: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
