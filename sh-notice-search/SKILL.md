---
name: sh-notice-search
description: Search official SH 서울주택도시개발공사 공고/공지 lists and details through k-skill-proxy. Use when a user asks about SH, 서울주택도시공사/서울주택도시개발공사, i-sh, 서울 행복주택/임대/공공원룸/장기전세 공고 or 당첨자 발표.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# SH 청약·주택 공고문 조회

## What this skill does

서울주택도시개발공사(SH, `i-sh.co.kr`)의 공식 **공고 및 공지** 게시판을 조회한다. 요청은 `k-skill-proxy` 의 `/v1/sh-notice/*` 라우트로 보내고, 결과는 목록·상세·첨부 미리보기 링크로 정리한다.

SH 사이트는 LH처럼 공공데이터포털 전용 공고 API가 안정적으로 열려 있지 않아, 프록시가 공식 SH HTML 게시판을 읽고 정규화한다. 본 스킬은 read-only 조회만 한다.

## When to use

- "SH 행복주택 공고 올라온 거 있어?"
- "서울주택도시공사 장기전세 공고 찾아줘"
- "i-sh 공공원룸 당첨자 발표 확인해줘"
- "SH 공고 303994 상세 보여줘"
- "서울 공공임대 공고 최근 것 정리해줘"

## When not to use

- LH 공고 전용 조회 → `lh-notice-search` 사용
- GH·iH 등 다른 지방공사 공고
- 청약 신청 자동화/제출, 로그인 필요한 마이페이지 업무
- 개별 자격 심사, 당첨 예측, 가점 계산

## Inputs

목록 조회:

- `q` / `keyword` / `srchWord`: 검색어. 예: `행복주택`, `장기전세`, `공공원룸`, `당첨자`. 최대 100자.
- `srchTp` / `searchType`: `title`/`제목` 또는 `content`/`내용`. 검색어가 있고 비워두면 자동으로 제목 검색(`title`)으로 처리한다. SH 게시판은 `srchTp` 없이 `srchWord`만 보내면 키워드를 무시하고 전체 목록을 돌려주기 때문이다.
- `page`: 페이지 번호. 기본 `1`.
- `pageSize`: 반환 개수. 기본 `10`, 최대 `10`. SH 게시판이 한 번 호출에 최대 10건만 내려주기 때문에, 더 많은 결과를 보려면 `page` 를 증가시킨다.
- `multiItmSeq`: SH 게시판 분류(숫자). 기본 `2`(공고 및 공지).

상세 조회:

- `seq`: 목록 응답의 `seq` 값. 숫자 필수.
- `multiItmSeq`: 기본 `2`.

## Default path

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값, 없으면 기본 `https://k-skill-proxy.nomadamas.org` 를 사용한다.

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
BASE="${BASE%/}"
```

## Supported endpoints

### 공고 목록 조회

```http
GET /v1/sh-notice/search
```

예시:

```bash
curl -fsS --get "${BASE}/v1/sh-notice/search" \
  --data-urlencode 'q=행복주택' \
  --data-urlencode 'srchTp=title' \
  --data-urlencode 'pageSize=10'
```

필터 없이 호출하면 SH 공고/공지 최신 목록을 돌려준다.

### 공고 상세 조회

```http
GET /v1/sh-notice/detail?seq={게시글번호}
```

예시:

```bash
curl -fsS --get "${BASE}/v1/sh-notice/detail" \
  --data-urlencode 'seq=303994'
```

## Response shape

### 목록 응답

```json
{
  "items": [
    {
      "seq": "304022",
      "number": "1606",
      "title": "전산작업에 따른 서비스(신한인증서) 이용 안내",
      "department": "시스템운영부",
      "registered_date": "2026-05-08",
      "views": 97,
      "is_new": true,
      "detail_url": "https://www.i-sh.co.kr/app/lay2/program/S48T1581C563/www/brd/m_247/view.do?multi_itm_seq=2&seq=304022"
    }
  ],
  "summary": {
    "page": 1,
    "page_size": 10,
    "returned_count": 10,
    "total_count": 1606
  },
  "query": {
    "srch_word": "행복주택",
    "srch_tp": "1",
    "multi_itm_seq": "2"
  },
  "proxy": {
    "name": "k-skill-proxy",
    "cache": { "hit": false, "ttl_ms": 300000 }
  }
}
```

### 상세 응답

```json
{
  "notice": {
    "seq": "303994",
    "title": "행복주택 예비당첨자 게시",
    "registered_date": "2026-05-07",
    "views": 1972,
    "content_text": "2022년 2차 행복주택 예비17차 ...",
    "attachments": [
      {
        "filename": "2022년 2차 행복주택 예비 17차 당첨자명단.pdf",
        "file_seq": "1",
        "preview_url": "https://www.i-sh.co.kr/app/com/util/htmlConverter.do?..."
      }
    ],
    "detail_url": "https://www.i-sh.co.kr/app/lay2/program/S48T1581C563/www/brd/m_247/view.do?multi_itm_seq=2&seq=303994"
  },
  "query": { "seq": "303994", "multi_itm_seq": "2" },
  "proxy": { "...": "..." }
}
```

## Response policy

- 공식 SH 사이트(`www.i-sh.co.kr`) 정보만 사용한다.
- 목록 결과는 상위 3~5건만 간결히 보여주고, 제목·담당부서·등록일·조회수·공식 링크를 포함한다.
- 상세 조회에서는 본문 요약과 첨부파일명을 우선 보여준다. 첨부 원문 확인이 중요하면 `preview_url` 을 함께 제시한다.
- 마감일이 별도 필드로 제공되지 않는 게시판 구조다. 본문/첨부 공고문에 있는 접수기간은 상세 본문을 읽고 별도 추출·요약해야 한다.
- SH 공고는 LH 공고와 ID 체계가 다르다. `seq` 는 SH 게시글 번호이며 LH `pan_id` 가 아니다.

## Failure modes

- `seq` 가 없거나 숫자가 아니면 `400 bad_request`. `multiItmSeq` 도 숫자만 허용된다.
- 검색어가 100자를 넘으면 `400 bad_request`.
- SH 사이트가 일시 장애이거나 HTML 구조가 바뀌면 `502 upstream_error` 또는 빈 결과가 내려올 수 있다.
- 첨부 원문 확인에는 공식 미리보기 링크(`preview_url`)를 우선 사용한다. 직접 다운로드 URL은 SH 사이트 흐름이 바뀔 수 있어 제공하지 않는다.

## Done when

- 사용자의 키워드/공고 유형 의도에 맞춰 `/v1/sh-notice/search` 를 호출했다.
- 결과에 제목, 담당부서, 등록일, 공식 상세 링크가 포함되어 있다.
- 상세가 필요하면 목록의 `seq` 로 `/v1/sh-notice/detail` 을 호출해 본문과 첨부파일을 확인했다.
