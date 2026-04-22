---
title: 네이버 뉴스 검색 가이드
description: k-skill-proxy 경유 네이버 검색 Open API 뉴스 검색으로 최신 기사 제목/요약/링크를 조회하는 방법
---

# 네이버 뉴스 검색 가이드

## 이 기능으로 할 수 있는 일

- 검색어 기반 네이버 뉴스 기사 후보 목록 조회
- 기사 제목, 본문 요약, 원문 링크, 네이버 뉴스 링크 정리
- 발행 시각(ISO-8601) 기준 최신순/관련도순 정렬
- `<b>` 하이라이트 태그와 HTML entity 를 proxy 쪽에서 제거한 깨끗한 텍스트 사용

## 가장 중요한 규칙

기본 경로는 `https://k-skill-proxy.nomadamas.org/v1/naver-news/search` 이다. 사용자는 **네이버 개발자 센터 Client ID/Secret 을 발급받을 필요가 없다**. upstream key(`NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET`)는 프록시 서버에서만 주입한다.

네이버 검색 Open API 는 전체 검색 카테고리(뉴스/블로그/쇼핑 등) 를 합쳐 **하루 25,000 호출** 제한이 있다. 재시도 루프로 낭비하지 않는다.

본 스킬은 **기사 메타데이터와 요약만** 다룬다. 기사 본문 전체, 유료 기사, 로그인 필요 기사는 다루지 않는다.

## 먼저 필요한 것

- 인터넷 연결
- `curl` 또는 HTTP 호출이 가능한 도구
- (프록시 운영자 전용) `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` 환경변수 - 네이버 개발자 센터(https://developers.naver.com/apps/#/register)에서 "검색" 권한 애플리케이션을 등록하고 발급받는다

## 지원 엔드포인트

| Route | 설명 |
| --- | --- |
| `GET /v1/naver-news/search` | 네이버 뉴스 검색. 제목/요약/링크/발행시각 정규화 |

### `/v1/naver-news/search` 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `q` / `query` / `keyword` | string | (필수) | 검색어. 2글자 이상 |
| `display` / `limit` / `size` | int | 10 | 반환 건수. 1 ~ 100 으로 clamp |
| `start` / `offset` | int | 1 | 검색 시작 위치(1-indexed). 최대 1000. `start + display - 1 > 1000` 이면 proxy 가 업스트림 호출 전에 `400 bad_request` 로 거절 |
| `sort` | string | `sim` | `sim`(관련도순) 또는 `date`(최신순). 그 외 값은 `sim` fallback |

## 기본 호출

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/naver-news/search' \
  --data-urlencode 'q=삼성전자 실적' \
  --data-urlencode 'display=10' \
  --data-urlencode 'sort=date'
```

로컬 proxy:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/naver-news/search' \
  --data-urlencode 'q=인공지능 규제' \
  --data-urlencode 'display=5'
```

## 응답 예시

```json
{
  "items": [
    {
      "rank": 1,
      "title": "삼성전자 1분기 실적 발표",
      "description": "삼성전자가 올해 1분기 실적을 발표했다. 영업이익은 전년 동기 대비 증가했다.",
      "link": "https://n.news.naver.com/mnews/article/001/samsung",
      "original_link": "https://news.example.com/samsung",
      "pub_date": "Mon, 22 Apr 2026 09:30:00 +0900",
      "pub_date_iso": "2026-04-22T00:30:00.000Z",
      "source": "naver-openapi"
    }
  ],
  "query": {
    "q": "삼성전자 실적",
    "display": 10,
    "start": 1,
    "sort": "date"
  },
  "meta": {
    "query": "삼성전자 실적",
    "extraction": "naver-openapi",
    "item_count": 1,
    "total": 1234567,
    "start": 1,
    "display": 1,
    "last_build_date": "Mon, 22 Apr 2026 10:00:00 +0900",
    "sort": "date"
  },
  "upstream": {
    "url": "https://openapi.naver.com/v1/search/news.json?query=...&display=10&start=1&sort=date",
    "status_code": 200,
    "content_type": "application/json;charset=UTF-8",
    "provider": "naver-search-api"
  },
  "proxy": {
    "name": "k-skill-proxy",
    "cache": { "hit": false, "ttl_ms": 300000 },
    "requested_at": "2026-04-22T01:00:00.000Z"
  }
}
```

## 기본 흐름

1. 사용자 검색어를 확인한다. 없거나 2글자 미만이면 먼저 물어본다.
2. "최신순" 요청이면 `sort=date`, 그 외는 `sort=sim` 으로 호출한다.
3. 상위 3~5건을 제목·발행시각(KST)·요약·링크로 정리해 보여준다.
4. `original_link` 가 있으면 원문 링크를 우선 노출하고, 없으면 `link`(네이버 뉴스 redirect)를 안내한다.
5. `items` 가 비었거나 upstream 오류가 발생하면 재시도하지 말고 검색어를 좁혀 다시 물어본다.

## 실패 모드

- `400 bad_request`: 검색어 누락, 2글자 미만, 혹은 `start + display - 1 > 1000` 조합(네이버 1000-item search window 초과). 메시지를 그대로 사용자에게 노출한다.
- `503 upstream_not_configured`: 프록시 서버에 `NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET` 가 없는 경우. 운영자가 키를 등록해야 한다.
- `401 upstream_error` (`errorCode: 024`): 프록시 서버의 Client ID/Secret 잘못됨. 운영자 재발급 필요.
- `429 upstream_error` (`errorCode: 010`): 네이버 검색 API 일일 쿼터(25,000 호출/일) 초과. 재시도 루프 금지. 잠시 후 다시 시도.
- `502 upstream_error`: 네이버 API 5xx 또는 JSON 파싱 실패.
- proxy 는 upstream 실패 응답을 **캐시하지 않는다**(failure-aware cache). 다음 요청이 온전히 upstream 을 한 번 더 탄다.

## 운영 팁

- 사용자 요구가 "오늘", "최신" 이면 `sort=date` 로 호출하는 것이 보통 더 만족스럽다.
- `display` 가 클수록 네이버 API 쿼터를 빨리 소모한다. 기본 10 에서 벗어날 필요 없는 경우가 많다.
- `start + display - 1` 이 1000 을 넘는 조합(예: `start=1000&display=100`)은 proxy가 업스트림 호출 전에 `400 bad_request`(`"start + display exceeds Naver's 1000-item search window"`) 로 거절한다. 네이버 API 는 1000번째 아이템까지만 열람 가능하므로, 더 오래된 기사를 찾을 때는 검색어를 좁히는 것이 낫다.
- 뉴스 `link` 중복 제거는 쿼리 파라미터 순서, trailing slash, host 대소문자, URL fragment 를 무시한 **canonical URL** 기준으로 수행된다(`?a=1&b=2` 와 `?b=2&a=1`, `/article/42` 와 `/article/42/`, `news.example.com` 과 `NEWS.example.com`, `#comments` 같은 fragment 차이는 모두 같은 기사로 간주). 서로 다른 path(`/article/42` vs `/article/42/related`) 나 서로 다른 쿼리 값(`?a=1` vs `?a=2`)은 여전히 별개 기사로 남긴다. 실제 페이로드의 `link` 필드는 네이버가 돌려준 원문 그대로 노출한다.
- `pub_date` 는 RFC822 형식, `pub_date_iso` 는 UTC ISO-8601 이다. 사용자에게 보여줄 때는 KST(UTC+9) 로 변환한다.
- proxy route 는 public/read-only/no-auth 이며 5분 캐시 + 분당 60 회 rate limit 으로 남용을 막는다.
- 기사 원문 풀텍스트가 필요하면 이 스킬로는 얻을 수 없다. 사용자가 링크를 직접 방문하도록 안내한다.

## 출처/참고

- 네이버 검색 API 뉴스 검색 문서: https://developers.naver.com/docs/serviceapi/search/news/news.md
- 네이버 개발자 센터: https://developers.naver.com
- 레퍼런스 오픈소스: `isnow890/naver-search-mcp`, `kiyeonjeon21/naver-cli`
