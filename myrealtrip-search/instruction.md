# 마이리얼트립 검색

## 이 스킬이 하는 일

마이리얼트립 공식 개발자센터의 MCP 문서에 공개된 엔드포인트를 사용해 여행 검색을 수행한다.

- MCP 엔드포인트: `https://mcp-servers.myrealtrip.com/mcp`
- 문서: <https://docs.myrealtrip.com/#/api/mcp/overview>
- 연결 가이드: <https://docs.myrealtrip.com/#/api/mcp/setup>
- 인증: 문서 기준 별도 인증 없음

지원 범위:

- 국내선/국제선 항공권 검색
- 항공권 날짜별 최저가 캘린더와 프로모션 항공사 조회
- 숙소 검색 및 상세/객실/리뷰/편의시설 조회
- 투어·티켓·액티비티 검색, 상세, 날짜별 옵션/가격/예약 가능 여부 조회
- 현재 한국 시간(KST) 조회

## 동작 방식

```
Claude Code / Codex / Hermes Agent
  → myrealtrip-search/scripts/myrealtrip_mcp.py
    → https://mcp-servers.myrealtrip.com/mcp (Streamable HTTP MCP)
      ├─ searchDomesticFlights / searchInternationalFlights
      ├─ flightsFareCalendar / getPromotionAirlines
      ├─ searchStays / getStayDetail
      ├─ getCategoryList / searchTnas / getTnaDetail / getTnaOptions
      └─ getCurrentTime
```

이 스킬은 화면 scraping이 아니라 마이리얼트립이 공개한 MCP 서버를 직접 호출한다. 따라서 DOM 선택자나 브라우저 자동화에 의존하지 않는다.

## 사용할 때

- "마이리얼트립에서 제주 항공권 찾아줘"
- "다음 주 오사카 가는 최저가 항공권 봐줘"
- "부산 해운대 호텔 2박 검색해줘"
- "이 호텔 객실 타입이랑 취소정책 자세히 봐줘"
- "오사카 유니버설 스튜디오 티켓 가격 확인해줘"
- "도쿄 디즈니랜드 날짜별 옵션 확인해줘"
- "항공권 특가 항공사 있어?"

## 사용하지 않을 때

- 실제 예약/결제/로그인이 필요한 경우
- 마이리얼트립 계정의 예약 내역이나 개인화 데이터가 필요한 경우
- 항공권·숙소·투어 외의 파트너 API 수익/예약 내역 조회가 목적일 때
- 가격·재고를 법적/회계적 증빙 수준으로 확정해야 할 때

## 준비 사항

Python MCP SDK가 필요하다. 없으면 설치한다.

```bash
python3 -m pip install mcp
```

기본 엔드포인트는 공식 문서의 URL이다. 필요할 때만 환경변수로 바꾼다.

```bash
export MYREALTRIP_MCP_ENDPOINT="https://mcp-servers.myrealtrip.com/mcp"
```

Hermes Agent에 MCP 서버로 직접 등록하려면 다음 설정을 쓸 수 있다.

```yaml
mcp_servers:
  myrealtrip:
    url: "https://mcp-servers.myrealtrip.com/mcp"
```

CLI별 공식 연결 명령은 문서 기준 다음과 같다.

```bash
claude mcp add --transport http myrealtrip https://mcp-servers.myrealtrip.com/mcp
codex mcp add myrealtrip --url https://mcp-servers.myrealtrip.com/mcp
gemini mcp add -t http -s user myrealtrip https://mcp-servers.myrealtrip.com/mcp
```

## 사용 흐름

### 1. 요청 유형을 분류한다

- 국내 항공: 출발지와 도착지가 모두 한국 도시/공항이면 `searchDomesticFlights`
- 국제 항공: 목적지가 해외면 `searchInternationalFlights`
- 날짜 유연 항공 최저가: `flightsFareCalendar` 후 실제 검색 도구로 재확인
- 숙소 목록: `searchStays`
- 특정 숙소 상세/객실/리뷰/편의시설: `searchStays`로 `gid` 확보 후 `getStayDetail`
- 투어·티켓·액티비티 목록: `searchTnas`
- 도시별 카테고리 필터가 필요하면 `getCategoryList` 후 `searchTnas`
- 특정 투어 상세: `searchTnas` 결과의 `gid`, `url`로 `getTnaDetail`
- 날짜별 실제 옵션/가격/가능 여부: `getTnaOptions`

### 2. 도구 목록과 입력 스키마를 확인한다

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py tools
```

### 3. 항공권 검색

국내선은 두 공항이 모두 한국일 때만 사용한다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call searchDomesticFlights \
  --arg origin=GMP \
  --arg destination=CJU \
  --arg departDate=2026-05-20 \
  --arg maxResults=10
```

국제선은 해외 목적지일 때 사용한다. 사용자가 출발 공항을 말하지 않으면 인천(`ICN`)을 기본값으로 둔다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call searchInternationalFlights \
  --json '{"tripType":"ROUND_TRIP","origin":"ICN","destination":"KIX","departDate":"2026-06-10","returnDate":"2026-06-14","passengers":{"adults":1,"children":0,"infants":0},"maxResults":5}'
```

날짜가 유동적인 최저가 요청은 캘린더를 먼저 본다. 캘린더 가격은 캐시/추정값이므로, 최종 답변 전에 실제 검색 도구로 후보 날짜를 다시 확인한다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call flightsFareCalendar \
  --arg from=ICN \
  --arg to=NRT \
  --arg departureDate=2026-06-01 \
  --arg period=4 \
  --arg maxResults=30
```

특가/할인 항공사 요청은 프로모션 항공사를 먼저 확인한다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call getPromotionAirlines
```

### 4. 숙소 검색과 상세 조회

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call searchStays \
  --json '{"keyword":"부산 해운대","checkIn":"2026-06-10","checkOut":"2026-06-12","adultCount":2,"childCount":0,"isDomestic":true,"order":"recommended","minReviewRating":4.0}'
```

사용자가 특정 숙소의 객실, 가격, 편의시설, 리뷰, 취소정책을 묻거나 "자세히"를 요청하면 `searchStays` 결과의 `gid`로 상세를 이어서 호출한다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call getStayDetail \
  --json '{"gid":123456,"checkIn":"2026-06-10","checkOut":"2026-06-12","adultCount":2,"childCount":0}'
```

### 5. 투어/티켓/액티비티 검색과 옵션 확인

도시별 카테고리 필터를 쓰려면 카테고리 값을 추측하지 말고 먼저 조회한다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call getCategoryList --arg city=Osaka
```

검색어는 한국어가 가장 잘 맞는다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call searchTnas \
  --arg query="오사카 유니버설 스튜디오" \
  --arg perPage=5
```

상세는 검색 결과의 `gid`와 `url`을 같이 넘긴다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call getTnaDetail \
  --json '{"gid":"123456","url":"https://www.myrealtrip.com/offers/123456"}'
```

날짜별 예약 가능 여부와 실제 가격은 `getTnaOptions`로 확인한다.

```bash
python3 myrealtrip-search/scripts/myrealtrip_mcp.py call getTnaOptions \
  --json '{"gid":"123456","url":"https://www.myrealtrip.com/offers/123456","selectedDate":"2026-06-10"}'
```

## 사용 가능한 도구

| 도구명 | 용도 | 주요 입력 |
|--------|------|-----------|
| `getCurrentTime` | 현재 KST 조회 | 없음 |
| `searchDomesticFlights` | 국내선 항공권 검색 | `origin`, `destination`, `departDate`, `returnDate`, `passengers`, `cabinClass`, `maxResults` |
| `searchInternationalFlights` | 국제선 항공권 검색 | `origin`, `destination`, `departDate`, `returnDate`, `passengers`, `cabinClass`, `directFlightOnly`, `preferredAirline` |
| `flightsFareCalendar` | 날짜별 최저가 캘린더 | `from`, `to`, `departureDate`, `period`, `international`, `transfer` |
| `getPromotionAirlines` | 프로모션 항공사 조회 | 없음 |
| `searchStays` | 숙소 목록 검색 | `keyword`, `checkIn`, `checkOut`, `adultCount`, `childCount`, `isDomestic`, 가격/평점/시설 필터 |
| `getStayDetail` | 숙소 상세/객실/리뷰/편의시설 | `gid`, `checkIn`, `checkOut`, `adultCount`, `childCount` |
| `getCategoryList` | 도시별 TNA 카테고리 조회 | `city` |
| `searchTnas` | 투어/티켓/액티비티 검색 | `query`, `page`, `perPage`, `category`, `sort` |
| `getTnaDetail` | TNA 상품 상세 | `gid`, `url` |
| `getTnaOptions` | 날짜별 예약 가능 여부와 실제 가격 | `gid`, `url`, `selectedDate` |

## 응답 형식

래퍼는 MCP `CallToolResult`를 JSON으로 출력한다. 보통 `content[].text`에 사람이 읽을 수 있는 검색 결과가 들어온다.

```json
{
  "content": [
    {
      "type": "text",
      "text": "검색 결과 ..."
    }
  ],
  "isError": false
}
```

답변할 때는 원문을 그대로 길게 붙이지 말고 다음 기준으로 정리한다.

- 항공: 항공사, 출발/도착 시각, 총 소요시간, 직항/경유, 가격, 예약 URL
- 숙소: 숙소명, 지역, 1박/총액 가격, 평점, 핵심 장점, 상세 확인 필요 여부
- 투어/TNA: 상품명, 시작가, 평점/리뷰, 포함사항 핵심, 날짜별 옵션 확인 결과, URL
- 후보가 많으면 상위 3~5개만 비교
- 가격·좌석·재고·예약 가능 여부는 실시간 변동 가능하다고 명시

## 실패 상황과 대응

- `Python package 'mcp' is required`: `python3 -m pip install mcp` 후 재시도한다.
- MCP 엔드포인트 연결 실패: `MYREALTRIP_MCP_ENDPOINT` 오타, 네트워크, upstream 장애를 확인한다.
- 빈 결과: 날짜/지역/인원/공항코드를 바꿔 재검색한다.
- 항공 검색 실패: 국내/국제 도구 선택이 맞는지 확인한다. 해외 목적지는 반드시 `searchInternationalFlights`다.
- 숙소 상세 실패: `searchStays` 결과의 `gid`가 최신인지 확인하고 같은 날짜로 다시 검색한다.
- TNA 옵션 실패: `getTnaOptions`에는 `searchTnas` 결과의 `gid`와 `url`, `YYYY-MM-DD` 날짜가 모두 필요하다.
- 캘린더 가격 불일치: `flightsFareCalendar`는 캐시/추정값이므로 실제 검색 결과를 우선한다.
- 예약/결제 요청: 자동화하지 말고 예약 URL을 제공해 사용자가 직접 진행하게 한다.

## 완료 기준

- 요청 유형에 맞는 MCP 도구를 선택했다.
- 필요한 날짜, 인원, 공항/도시, `gid`/`url` 등 필수 입력을 확보했다.
- 실제 MCP 호출 결과를 바탕으로 상위 후보를 요약했다.
- 가격·재고·예약 가능 여부의 변동 가능성을 안내했다.
- 예약/결제는 자동화하지 않고 마이리얼트립 URL을 제공했다.
