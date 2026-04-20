# 도서관 도서 조회 가이드

## 이 기능으로 할 수 있는 일

도서관 정보나루(Data4Library) Open API를 `k-skill-proxy` 경유로 호출해 한국 공공도서관 도서 정보를 조회한다.

- 키워드 기반 도서 검색
- ISBN 기반 도서 상세 조회
- ISBN + 지역코드 기반 소장 도서관 조회
- 도서관 코드 + ISBN 기반 특정 도서관 소장/대출 가능 여부 조회

## 가장 중요한 규칙

사용자에게 필요한 시크릿은 없으며, `DATA4LIBRARY_AUTH_KEY`는 프록시 서버에서만 관리한다.

1. 사용자는 **`DATA4LIBRARY_AUTH_KEY`를 들고 있지 않는다.** `k-skill-proxy`만 upstream `authKey`를 붙인다.
2. 공개 read-only 조회만 한다. 도서관 로그인, 예약, 대출 자동화는 하지 않는다.
3. 도서관명·지역명이 애매하면 후보를 보여 주고 사용자가 선택하게 한다.

## 먼저 필요한 것

- 인터넷 연결
- 프록시 base URL (기본: `https://k-skill-proxy.nomadamas.org`)
- 프록시 서버 환경변수 `DATA4LIBRARY_AUTH_KEY` (self-host 운영자만 필요)

## 기본 조회 흐름

### 1) 도서 검색

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/book-search' \
  --data-urlencode 'keyword=역사' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'pageSize=10'
```

`keyword` 대신 `q`/`query`, `pageNo`/`pageSize` 대신 `page`/`limit`도 쓸 수 있다. 결과에서 `bookname`, `authors`, `publisher`, `publication_year`, `isbn13`을 확인한다.

### 2) 도서 상세 조회

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/book-detail' \
  --data-urlencode 'isbn13=9788971998557' \
  --data-urlencode 'loaninfoYN=Y'
```

`loaninfoYN=Y`는 upstream이 제공하는 대출 관련 추가 정보를 함께 요청한다.

### 3) 소장 도서관 조회

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/libraries-by-book' \
  --data-urlencode 'isbn=9788971998557' \
  --data-urlencode 'region=11' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'pageSize=10'
```

`region`은 도서관 정보나루 지역코드다. 상세 지역코드가 있으면 `dtl_region`을 추가한다.

### 4) 특정 도서관 소장/대출 가능 여부 확인

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/book-exists' \
  --data-urlencode 'libraryCode=111001' \
  --data-urlencode 'isbn13=9788971998557'
```

### 5) 도서관 목록 조회(선택)

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/library-search' \
  --data-urlencode 'region=11' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'pageSize=10'
```

## 프록시 응답 공통 메타

프록시는 JSON 응답에 다음 메타를 덧붙인다.

- `query`: 정규화된 요청값
- `proxy.name`: 프록시 이름
- `proxy.cache.hit`: 캐시 hit 여부
- `proxy.cache.ttl_ms`: 캐시 TTL
- `proxy.requested_at`: 요청 시각

## 파라미터 요약

| 엔드포인트 | 필수 쿼리 | 선택 쿼리 |
| --- | --- | --- |
| `/v1/data4library/book-search` | `keyword`(`q`, `query`) | `pageNo`, `pageSize` |
| `/v1/data4library/book-detail` | `isbn13` | `loaninfoYN=Y|N` |
| `/v1/data4library/libraries-by-book` | `isbn`, `region` | `dtl_region`, `pageNo`, `pageSize` |
| `/v1/data4library/book-exists` | `libraryCode`, `isbn13` | - |
| `/v1/data4library/library-search` | - | `region`, `dtl_region`, `libraryCode`, `pageNo`, `pageSize` |

## 자주 보는 필드

- `bookname`: 도서명
- `authors`: 저자
- `publisher`: 출판사
- `publication_year`: 출판연도
- `isbn13`: ISBN
- `libCode`: 도서관 코드
- `libName`: 도서관명
- `address`: 도서관 주소
- `hasBook`, `loanAvailable`: 특정 도서관 소장/대출 가능 여부(응답에 있는 경우)

## 실패/주의 사항

- `DATA4LIBRARY_AUTH_KEY`가 프록시 서버에 없으면 `503 upstream_not_configured`가 반환된다.
- ISBN은 하이픈을 제거했을 때 ISBN-10(마지막 X 허용) 또는 ISBN-13이어야 한다.
- Data4Library 데이터와 개별 도서관 대출 상태는 동기화 지연이 있을 수 있다. 방문 전 도서관 홈페이지나 전화로 최종 확인을 권한다.
- 지역코드·도서관 코드가 불명확하면 임의로 고르지 말고 후보를 제시한다.

## 참고 링크

- 도서관 정보나루 Open API 활용방법: `https://www.data4library.kr/apiUtilization`
- 프록시 구현·엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
