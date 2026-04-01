# 한국 법령 검색 가이드

## 이 기능으로 할 수 있는 일

- `korean-law-mcp` 로 법령명 검색
- 특정 법령의 조문 본문 조회
- 판례 / 유권해석 / 자치법규 검색
- MCP 또는 CLI 경로 중 현재 환경에 맞는 방식 선택

## 가장 중요한 규칙

한국 법령 관련 검색/조회가 필요할 때는 **반드시 `korean-law-mcp`를 사용**합니다.  
별도 repo package, 별도 python package, 임의 크롤러를 새로 만들지 않습니다.

## 먼저 필요한 것

- 인터넷 연결
- `node` 18+
- `npm install -g korean-law-mcp`
- `LAW_OC` 환경변수

무료 API key 발급처: `https://open.law.go.kr`

```bash
npm install -g korean-law-mcp
export LAW_OC=your-api-key

korean-law list
korean-law help search_law
```

로컬 설치가 막히면 `https://korean-law-mcp.fly.dev/mcp` remote endpoint를 사용해도 된다. 다만 이 경우에도 **`korean-law-mcp` 경로만** 사용한다.

## MCP 연결 예시

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

remote endpoint 예시:

```json
{
  "mcpServers": {
    "korean-law": {
      "url": "https://korean-law-mcp.fly.dev/mcp"
    }
  }
}
```

## 기본 흐름

1. 질의가 법령/판례/행정해석/자치법규 중 어디에 가까운지 분류한다.
2. 법령명만 찾으면 `search_law` 를 먼저 쓴다.
3. 특정 조문이 필요하면 `search_law` 또는 `search_all` 로 식별자(`mst`)를 확인한 뒤 `get_law_text` 를 호출한다.
4. 판례는 `search_precedents`, 유권해석은 `search_interpretations`, 자치법규는 `search_ordinance` 를 우선 사용한다.
5. 범주가 애매하면 `search_all` 로 시작한다.
6. 한국 법령 검색은 항상 `korean-law-mcp` 로 끝까지 처리한다.

## CLI 예시

```bash
korean-law search_law --query "관세법"
korean-law get_law_text --mst 160001 --jo "제38조"
korean-law search_precedents --query "부당해고"
```

## 운영 팁

- `화관법` 같은 약칭은 `search_law` / `search_all` 로 정식 법령명을 먼저 확인한다.
- 조문 번호가 헷갈리면 `get_law_text` 전에 법령 식별자부터 다시 확인한다.
- `LAW_OC` 가 없으면 credential resolution order에 따라 확보를 안내하고, 다른 검색 경로로 우회하지 않는다.
- 요약은 할 수 있지만 법률 자문처럼 단정적으로 결론을 내리지는 않는다.

## 라이브 확인 메모

2026-04-01 기준 smoke test 에서 아래 명령은 실제로 정상 동작했다.

- `korean-law list`
- `korean-law help search_law`

즉, `korean-law-mcp` CLI 설치와 기본 명령 진입은 검증했다. 실제 법령 검색은 `LAW_OC` 가 준비된 환경에서 바로 이어서 사용할 수 있다.
