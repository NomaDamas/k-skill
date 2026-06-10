# 한국 법령 검색 가이드

## 이 기능으로 할 수 있는 일

- `korean-law-mcp` 로 법령명 검색
- 특정 법령의 조문 본문 조회
- 판례 / 유권해석 / 자치법규 검색
- MCP 또는 CLI 경로 중 현재 환경에 맞는 방식 선택
- 기존 경로 장애 시 `법망` fallback으로 이어가기

## 가장 중요한 규칙

한국 법령 관련 검색/조회가 필요할 때는 **`korean-law-mcp`를 먼저 사용**합니다.
기존 서비스가 동작하지 않을 때만 승인된 fallback 표면인 **`법망`(`https://api.beopmang.org`)** 으로 전환합니다.
별도 repo package, 별도 python package, 임의 크롤러를 새로 만들지 않습니다.

## 먼저 필요한 것

- 인터넷 연결
- `node` 18+
- `npm install -g korean-law-mcp` (로컬 CLI/로컬 MCP server 경로일 때)
- remote MCP endpoint를 쓸 MCP 클라이언트
- `법망` fallback (`https://api.beopmang.org`) 에 접근할 수 있는 네트워크

무료 API key 발급처: `https://open.law.go.kr`

로컬 CLI 또는 로컬 MCP server 경로는 `LAW_OC` 가 필요하다.
remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결한다.

```bash
npm install -g korean-law-mcp
export LAW_OC=your-api-key

korean-law list
korean-law help search_law
```

로컬 설치가 막히면 먼저 `https://korean-law-mcp.fly.dev/mcp` remote endpoint를 사용한다. 그 경로도 응답하지 않거나 서비스 장애가 나면 `법망`(`https://api.beopmang.org`) MCP/REST를 fallback으로 사용한다.

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

위 remote 예시는 upstream 문서 기준으로 사용자 `LAW_OC` 를 따로 넣지 않는다. 사용자 쪽에서 준비할 것은 `url` 등록뿐이다.

## fallback: 법망

기존 `korean-law-mcp` 경로가 동작하지 않을 때만 `법망`을 사용한다.

### MCP fallback

```json
{
  "mcpServers": {
    "beopmang": {
      "url": "https://api.beopmang.org/mcp"
    }
  }
}
```

### REST fallback 예시

```bash
curl "https://api.beopmang.org/api/v4/law?action=search&q=관세법"
curl "https://api.beopmang.org/api/v4/tools?action=overview&law_id=001706"
curl "https://api.beopmang.org/api/v4/law?action=get&law_id=001706&article=제750조"
```

## 기본 흐름

1. 질의가 법령/판례/행정해석/자치법규 중 어디에 가까운지 분류한다.
2. 법령명만 찾으면 `search_law` 를 먼저 쓴다.
3. 특정 조문이 필요하면 `search_law` 또는 `search_all` 로 식별자(`mst`)를 확인한 뒤 `get_law_text` 를 호출한다.
4. 판례는 `search_precedents`, 유권해석은 `search_interpretations`, 자치법규는 `search_ordinance` 를 우선 사용한다.
5. 범주가 애매하면 `search_all` 로 시작한다.
6. `korean-law-mcp` 경로가 설치/네트워크/서비스 장애로 막히면 `법망` fallback으로 전환한다.
7. fallback 검색 결과가 0건이어도 바로 "관련 규범이 없다"고 단정하지 말고 검색어와 범주를 다시 확인한다.

## CLI 예시

```bash
korean-law search_law --query "관세법"
korean-law get_law_text --mst 160001 --jo "제38조"
korean-law search_precedents --query "부당해고"
```

## 판례 검색과 본문 조회

판례는 `korean-law-mcp` 의 `search_precedents` 로 먼저 검색하고, 본문이 필요하면 판례 ID로 상세 본문을 가져온다.

```bash
# 1) 키워드 검색
korean-law search_precedents --query "부당해고"

# 2) 사건번호로 검색 (지원 시)
korean-law search_precedents --query "2017다12345"

# 3) 검색 결과의 판례 ID/일련번호로 본문(상세) 조회
korean-law get_precedent_text --id <판례일련번호>
```

`search_precedents` 는 법제처 Open API의 **판례 목록 조회**(`http://www.law.go.kr/DRF/lawSearch.do?target=prec`)를 감싸는 우선 경로다. 본문은 upstream `get_precedent_text` 또는 공식 **판례 본문 조회**(`http://www.law.go.kr/DRF/lawService.do?target=prec&ID=<판례일련번호>`)로 가져온다. `lawService.do?target=prec` 은 `법망` 같은 fallback이 아니라 공식 본문 조회 경로다.

지원 필터: `query`(검색어), 법원(court), 사건번호(case number), 데이터출처명(source name), 선고일자/날짜(date), 정렬(sort). 활성 도구·엔드포인트가 실제 지원하는 필터만 넘기고, 요약 전에 반환 메타데이터를 확인한다.

실패 모드:

- 로컬 경로에서 `LAW_OC` 가 없으면 확보 방법만 안내하고 임의 크롤링으로 넘어가지 않는다.
- remote MCP/공식 API가 응답하지 않거나 rate limit/timeout이면 원인을 밝히고, 그때만 `법망` fallback으로 전환한다.
- 검색 결과가 0건이어도 "관련 판례가 없다"고 단정하지 말고 검색어·법원·사건번호·선고일자·출처명을 바꿔 다시 시도한다.
- 일부 출처는 본문을 HTML로만 제공하거나 본문을 제공하지 않을 수 있다. 본문을 못 가져오면 목록 메타데이터(사건번호·법원·선고일자·출처·요지)까지만 제공하고 본문이 없다는 점을 명시한다.
- 판례는 검색·요약·인용까지만 하고 승소 가능성·소송 전략 같은 법률 자문성 결론은 내리지 않는다.

## 운영 팁

- `화관법` 같은 약칭은 `search_law` / `search_all` 로 정식 법령명을 먼저 확인한다.
- 조문 번호가 헷갈리면 `get_law_text` 전에 법령 식별자부터 다시 확인한다.
- 로컬 CLI/MCP 경로를 쓰는데 `LAW_OC` 가 없으면 credential resolution order에 따라 확보를 안내한다.
- remote MCP endpoint를 쓰면 사용자 `LAW_OC` 없이 `url` 등록 상태만 확인한다.
- 기존 `korean-law-mcp` 경로가 실패하면 `https://api.beopmang.org/mcp` 또는 `/api/v4/law?action=search` 경로를 fallback으로 쓴다.
- 요약은 할 수 있지만 법률 자문처럼 단정적으로 결론을 내리지는 않는다.

## 라이브 확인 메모

2026-04-01 기준 smoke test 에서 아래 명령은 실제로 정상 동작했다.

- `korean-law list`
- `korean-law help search_law`

즉, `korean-law-mcp` CLI 설치와 기본 명령 진입은 검증했다. 실제 법령 검색은 로컬 CLI/MCP 경로라면 `LAW_OC` 가 준비된 환경에서 바로 이어서 사용할 수 있고, remote MCP endpoint는 사용자 `LAW_OC` 없이 URL 등록만으로 붙일 수 있다. 기존 경로 장애 시에는 `법망` fallback을 사용할 수 있다.
