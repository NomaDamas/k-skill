---
name: korean-law-search
description: Use korean-law-mcp for Korean law, precedent, ordinance, and interpretation lookups. Always use korean-law-mcp when the user needs Korean legal search or retrieval.
license: MIT
metadata:
  category: legal
  locale: ko-KR
  phase: v1
---

# Korean Law Search

## What this skill does

한국 법령/조문/판례/유권해석/자치법규 조회가 필요할 때 **반드시 `korean-law-mcp`를 사용**한다.

- 법령명 검색: `search_law`
- 조문 본문 조회: `get_law_text`
- 판례 검색: `search_precedents`
- 유권해석 검색: `search_interpretations`
- 여러 카테고리가 섞인 검색: `search_all`

이 스킬은 자체 npm/python 패키지를 만들지 않는다. 한국 법령 관련 조회는 로컬 설치든 remote endpoint든 **항상 `korean-law-mcp` 경로로만 처리**한다.

## When to use

- "산업안전보건법 찾아줘"
- "관세법 제38조 보여줘"
- "부당해고 판례 찾아줘"
- "개인정보보호법 시행령 조문 확인해줘"
- "한국 법령/판례/자치법규 검색해줘"

## When not to use

- 미국/일본/EU 등 비한국 법령 검색
- 실제 법률 자문·소송 전략을 단정적으로 제공해야 하는 경우
- 법령 원문이 아니라 일반 상식 설명만 필요한 경우

## Prerequisites

- 인터넷 연결
- `node` 18+
- `npm install -g korean-law-mcp` (로컬 CLI/로컬 MCP server 경로일 때)
- MCP 클라이언트에 remote endpoint를 등록할 수 있는 환경

무료 API key: `https://open.law.go.kr`

로컬 CLI 또는 로컬 MCP server 경로는 `LAW_OC` 가 필요하다.
remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결한다.

```bash
npm install -g korean-law-mcp
export LAW_OC=your-api-key

korean-law list
korean-law help search_law
```

로컬 설치가 운영체제 정책이나 권한 때문에 막히면, 대체 구현을 만들지 말고 `korean-law-mcp` 의 remote MCP endpoint(`https://korean-law-mcp.fly.dev/mcp`)를 사용한다. 이 경우에도 **반드시 `korean-law-mcp`를 사용한 것**으로 취급한다.

## MCP client setup

Claude Desktop / Cursor / Windsurf 같은 MCP 클라이언트에는 아래처럼 연결한다.

```json
{
  "mcpServers": {
    "korean-law": {
      "command": "korean-law-mcp",
      "env": {
        "LAW_OC": "your-api-key"
      }
    }
  }
}
```

설치가 막힌 환경에서는 remote endpoint를 사용한다. 이 upstream 예시는 사용자 `LAW_OC` 없이 `url`만 등록한다.

```json
{
  "mcpServers": {
    "korean-law": {
      "url": "https://korean-law-mcp.fly.dev/mcp"
    }
  }
}
```

## CLI workflow

### 1. 법령명부터 찾기

```bash
korean-law search_law --query "관세법"
```

### 2. 특정 조문 본문 조회

```bash
korean-law get_law_text --mst 160001 --jo "제38조"
```

### 3. 판례 검색

```bash
korean-law search_precedents --query "부당해고"
```

### 4. 애매하면 통합 검색

```bash
korean-law search_all --query "개인정보 처리방침 행정해석"
```

## Response policy

- 한국 법령 관련 요청은 **항상 `korean-law-mcp`를 먼저 사용**한다.
- 약칭(`화관법`)이면 `search_law` / `search_all` 로 정식 법령명을 먼저 확인한다.
- 조문 요청이면 검색 결과의 식별자(`mst`)를 확인한 뒤 `get_law_text` 로 본문을 가져온다.
- 판례/유권해석/자치법규는 각각 전용 search tool을 우선 사용한다.
- 로컬 CLI/MCP 경로를 쓰는데 `LAW_OC` 가 없으면 credential resolution order에 따라 확보 방법을 짧게 안내하고, 임의의 크롤링/검색엔진 우회로 넘어가지 않는다.
- remote MCP endpoint를 쓰면 사용자 `LAW_OC` 없이 `url` 등록 상태만 확인한다.
- 법적 판단이 필요한 경우 `검색 결과 요약`과 `원문 출처`까지만 제공하고 법률 자문처럼 단정하지 않는다.

## Done when

- 한국 법령 관련 질의에 대해 `korean-law-mcp` 사용 경로가 선택되었다.
- 필요한 검색/조회 명령이 정해졌다.
- 법령/조문/판례/유권해석 중 맞는 도구로 결과를 조회했다.
- 로컬 경로라면 `LAW_OC` 확보 방법을 정확한 변수 이름으로 안내했다.
- remote endpoint라면 사용자 `LAW_OC` 없이 `url` 등록 상태를 확인했다.

## Notes

- upstream: `https://github.com/chrisryugj/korean-law-mcp`
- official data source: 법제처 Open API (`https://open.law.go.kr`)
- 이 저장소 안에는 한국 법령 전용 npm package나 python package를 추가하지 않는다.
