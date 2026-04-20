---
name: library-book-search
description: Use when the user asks to search Korean library books, book details, library holdings, or whether a Korean public library owns a book via k-skill-proxy Data4Library routes.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Library Book Search (Data4Library)

## What this skill does

국립중앙도서관의 **도서관 정보나루(Data4Library)** Open API를 `k-skill-proxy`가 중계하는 HTTP API로 조회한다.

- 키워드로 도서를 검색한다.
- ISBN으로 상세 서지·대출정보를 확인한다.
- ISBN + 지역코드로 해당 도서를 소장한 도서관 목록을 찾는다.
- 도서관 코드 + ISBN으로 특정 도서관의 소장/대출 가능 여부를 확인한다.

## When to use

- "역사 관련 책 도서관 정보나루에서 찾아줘"
- "이 ISBN 소장한 서울 도서관 찾아줘"
- "정독도서관에 이 책 있는지 확인해줘"
- "도서관 도서 조회 가능해?"

## Prerequisites

- 인터넷 연결
- `curl` 사용 가능 환경
- `k-skill-proxy`에 `DATA4LIBRARY_AUTH_KEY`가 설정된 배포(기본 hosted 또는 self-host)에 접근 가능할 것

## Credential requirements

사용자에게 필요한 시크릿은 없으며, `DATA4LIBRARY_AUTH_KEY`는 프록시 서버에서만 관리한다.

- 사용자 측 **필수 시크릿 없음**.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA4LIBRARY_AUTH_KEY` 는 **프록시 서버** 환경에만 둔다. 사용자에게 인증키를 요구하거나 응답에 노출하지 않는다.

## Proxy base URL

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
BASE="${BASE%/}"
```

## Workflow

### 1) Collect the intent and minimal inputs

사용자 요청에 따라 필요한 값만 묻는다.

- 키워드 도서 검색: `keyword`만 있으면 시작한다.
- 상세 조회: ISBN(10자리 또는 13자리)이 필요하다.
- 소장 도서관 조회: ISBN + 광역 지역코드(`region`)가 필요하다. 시군구 상세코드(`dtl_region`)가 있으면 같이 쓴다.
- 특정 도서관 소장 확인: 도서관 코드(`libraryCode`) + ISBN이 필요하다.

도서관 코드나 지역코드가 없으면 먼저 `library-search`로 후보를 보거나, 사용자에게 알고 있는 도서관명·지역을 더 물어본다. 이름만으로 확정되지 않으면 임의로 하나를 고르지 않는다.

### 2) Search books (`/v1/data4library/book-search`)

```bash
curl -fsS --get "${BASE}/v1/data4library/book-search" \
  --data-urlencode "keyword=역사" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "pageSize=10"
```

별칭: `q`, `query`, `page`, `limit`도 허용된다.

응답의 `response.docs[].doc`에서 주로 볼 필드:

- `bookname` — 도서명
- `authors` — 저자
- `publisher` — 출판사
- `publication_year` — 출판연도
- `isbn13` — 상세/소장 조회에 쓸 ISBN

### 3) Fetch book detail (`/v1/data4library/book-detail`)

```bash
curl -fsS --get "${BASE}/v1/data4library/book-detail" \
  --data-urlencode "isbn13=9788971998557" \
  --data-urlencode "loaninfoYN=Y"
```

- `loaninfoYN=Y`를 주면 upstream이 제공하는 인기 대출 지역·연령·대출건수 같은 추가 정보를 함께 요청한다.
- 상세 응답이 비어 있으면 ISBN 오타, 미수집 도서, upstream 지연 가능성을 안내한다.

### 4) Find libraries that hold a book (`/v1/data4library/libraries-by-book`)

```bash
curl -fsS --get "${BASE}/v1/data4library/libraries-by-book" \
  --data-urlencode "isbn=9788971998557" \
  --data-urlencode "region=11" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "pageSize=10"
```

- `region`은 도서관 정보나루 지역코드다. 예: 서울특별시 코드가 필요한 경우 `11`처럼 숫자 코드를 사용한다.
- `dtl_region`이 있으면 더 좁힌다.
- 결과가 여러 개면 도서관명·주소·홈페이지·전화번호(응답에 있는 경우)를 요약해 보여 주고, 실시간 대출가능 여부는 별도 `book-exists`로 확인한다.

### 5) Check one library's holding (`/v1/data4library/book-exists`)

```bash
curl -fsS --get "${BASE}/v1/data4library/book-exists" \
  --data-urlencode "libraryCode=111001" \
  --data-urlencode "isbn13=9788971998557"
```

- `hasBook`, `loanAvailable` 등 upstream 응답 필드를 그대로 해석한다.
- 대출 가능 여부는 도서관 시스템 동기화 지연이 있을 수 있으므로, 최종 방문 전 도서관 홈페이지/전화 확인을 권한다.

### 6) Optional: library list (`/v1/data4library/library-search`)

```bash
curl -fsS --get "${BASE}/v1/data4library/library-search" \
  --data-urlencode "region=11" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "pageSize=10"
```

## Summarize for the user

- 도서명, 저자, 출판사, 출판연도, ISBN을 먼저 정리한다.
- 소장 도서관 목록은 사용자의 지역·이동 가능성을 기준으로 상위 후보만 보여 준다.
- JSON 전체를 길게 붙이지 말고, 필요한 필드와 다음 단계(상세 조회/소장 확인/도서관 선택)를 제안한다.

## Upstream reference

- 도서관 정보나루 Open API 활용방법: `https://www.data4library.kr/apiUtilization`

## Failure modes

- 프록시에 `DATA4LIBRARY_AUTH_KEY` 미설정 → `503` / `upstream_not_configured`
- 키워드·ISBN·지역코드·도서관 코드 누락 → `400` / `bad_request`
- ISBN 자리수 오류 → 하이픈을 제외한 ISBN-10(마지막 X 허용) 또는 ISBN-13으로 다시 요청
- 도서관 코드/지역코드 불명확 — 사용자에게 후보를 보여 주고 선택 받기
- Data4Library API 일시 장애·호출 제한·데이터 미수집

## Notes

- 기본 posture는 read-only 조회다. 예약, 대출, 개인정보 기반 도서관 로그인 자동화는 하지 않는다.
- `DATA4LIBRARY_AUTH_KEY`는 프록시 서버 전용이다. 사용자 측에는 시크릿이 없다.
- 프록시가 upstream `authKey`와 `format=json`을 주입하므로, 사용자가 넘긴 `authKey`/`format`은 신뢰하지 않는다.
