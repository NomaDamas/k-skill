---
name: naver-news-search
description: 네이버 검색 Open API 뉴스 검색(news.json)을 k-skill-proxy 경유로 조회해 최신 뉴스 기사 제목·발행시각·링크·요약을 보수적으로 정리한다. 사용자는 별도 API 키 발급 없이 호출한다.
license: MIT
metadata:
  category: information
  locale: ko-KR
  phase: v1
---

# Naver News Search

## What this skill does

`k-skill-proxy`가 네이버 검색 Open API 뉴스 검색(`openapi.naver.com/v1/search/news.json`)을 호출해 최근 뉴스 기사 후보를 정규화된 JSON 으로 돌려준다.

- 검색어 기반 최신 뉴스 후보 목록을 정리한다.
- 기사 제목, 본문 요약(description), 발행 시각(`pub_date`/`pub_date_iso`), 네이버 뉴스 링크(`link`), 원문 링크(`original_link`)를 제공한다.
- Naver 가 응답에 섞어주는 `<b>` 하이라이트 태그와 HTML entity(`&amp;`, `&quot;`, `&lt;` 등)는 proxy 쪽에서 미리 제거한다.
- 사용자 로그인·개인화·회원 전용 뉴스는 지원하지 않는다.

## When to use

- "오늘 삼성전자 관련 뉴스 찾아줘"
- "최근 AI 규제 관련 기사 최신순으로 5개만"
- "네이버 뉴스에서 금리 인상 기사 요약해줘"
- "이 사건 기사 링크 정리해줘"

## When not to use

- 특정 언론사 내부 유료 기사, 로그인 뒤에만 보이는 기사
- 기사 본문 전체가 필요한 경우 (API 는 요약 description 만 제공)
- 주식/환율/부동산 실시간 시세 (뉴스 API 는 기사만 다룬다)
- 차단/CAPTCHA 우회가 필요한 경로

## Required inputs

검색어(`q` / `query`)가 없으면 먼저 물어본다.

권장 질문:

> 찾을 네이버 뉴스 검색어를 알려주세요. 예: "삼성전자 실적", "인공지능 규제", "금리 인상"

단어 2글자 미만이면 의미가 불분명하므로 되묻는다.

## Proxy endpoint

기본값은 public/read-only/no-auth 프록시다. 사용자는 **네이버 개발자 센터 Client ID/Secret 을 발급받지 않아도 된다**. upstream key(`NAVER_SEARCH_CLIENT_ID` / `NAVER_SEARCH_CLIENT_SECRET`)는 프록시 서버에서만 주입한다.

```bash
curl -fsS --get "${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}/v1/naver-news/search" \
  --data-urlencode 'q=삼성전자 실적' \
  --data-urlencode 'display=10' \
  --data-urlencode 'sort=date'
```

쿼리 파라미터:

- `q` 또는 `query` — 검색어. 2글자 이상.
- `display` — 반환 건수. 기본 10, 범위 1~100.
- `start` — 검색 시작 위치(1-indexed). 기본 1, 최대 1000. **`start + display - 1` 은 1000 을 넘을 수 없다**: 예를 들어 `start=1000 & display=100` 은 `1099`번째 아이템을 요구하므로 proxy가 업스트림 호출 전에 `400 bad_request`("start + display exceeds Naver's 1000-item search window")로 거절한다. 아주 오래된 기사를 찾으려면 검색어를 좁히는 것이 낫다.
- `sort` — `sim`(유사도 순, 기본값) 또는 `date`(최신순). 그 외 값은 `sim` 으로 fallback.

응답 주요 필드:

- `items[].title` — `<b>` 태그·HTML entity 가 제거된 기사 제목
- `items[].description` — `<b>` 태그·HTML entity 가 제거된 기사 요약
- `items[].link` — 네이버 뉴스 redirect 링크
- `items[].original_link` — 원문 뉴스 링크(빈 문자열이면 `null`)
- `items[].pub_date` — 원본 RFC822 형식 발행 시각
- `items[].pub_date_iso` — 파싱된 ISO-8601(UTC) 발행 시각. 파싱 실패시 `null`
- `meta.extraction` — 항상 `naver-openapi`
- `meta.total`, `meta.start`, `meta.display`, `meta.last_build_date`, `meta.sort`

## Workflow

1. 검색어를 확인한다. (없거나 2글자 미만이면 먼저 물어본다)
2. 사용자가 "최신순"을 원하면 `sort=date`, 그 외에는 `sort=sim` 으로 호출한다.
3. `GET /v1/naver-news/search` 를 호출한다.
4. `items` 가 있으면 상위 3~5건을 제목, 발행 시각(KST 기준으로 재포맷해도 좋다), 요약, 링크로 짧게 정리한다.
5. 발행 시각은 `pub_date_iso` 기준으로 오늘/어제 표기를 붙여도 된다. (KST = UTC+9)
6. `items` 가 비었거나 `upstream_error` 가 나면 재시도하지 말고 검색어를 좁혀 다시 물어본다.

## Response style

- 기사 제목/요약은 API 가 돌려준 원문만 인용한다. 원문에 없는 해설은 덧붙이지 않는다.
- 기사 발행 시각은 "KST 기준 {YYYY-MM-DD HH:mm}" 또는 "{n}시간 전" 정도로 짧게 표시한다.
- 원문 링크(`original_link`)가 있으면 우선 노출하고, 없으면 `link`(네이버 뉴스 redirect)를 안내한다.
- 서로 다른 언론사가 같은 사건을 다루면 링크 2~3개를 병렬로 제시해 사용자가 비교할 수 있게 한다.
- `description` 은 요약이므로, 팩트로 단정하지 말고 "기사 요약에 따르면"이라고 전한다.

## Failure modes

- `400 bad_request` — 검색어 누락, 2글자 미만, 허용되지 않는 파라미터, 혹은 `start + display - 1 > 1000` 조합(네이버 1000-item search window 초과). 에러 메시지를 그대로 사용자에게 노출한다.
- `503 upstream_not_configured` — 프록시 서버에 `NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET` 가 없는 경우. 운영자가 키를 등록해야 한다. 사용자에게는 "잠시 후 다시 시도해 주세요" 정도로 안내한다.
- `401 upstream_error` — 프록시 서버의 Client ID/Secret 이 잘못된 경우(`errorCode: 024`). 운영자가 재발급해야 한다.
- `429 upstream_error` — 네이버 검색 API 일일 쿼터(25,000 호출/일) 초과(`errorCode: 010`). 재시도 루프는 금지. 잠시 후 다시 시도하도록 안내한다.
- `502 upstream_error` — 네이버 API 5xx 또는 응답 JSON 파싱 실패.
- upstream 차단이나 장애 발생 시 재시도하지 않는다. cache + rate limit 만으로 대응하고, 사용자에게는 현재 조회 불가능함을 분명히 말한다.

## Privacy

- 검색어/결과를 영구 저장하지 않는다.
- 기사 본문은 요청하지 않는다. description(API 가 주는 요약)만 사용한다.
- 특정 인물·사건을 비방·추측하는 서술은 하지 않는다. 기사 원문만 전달한다.

## Done when

- 검색어를 확인했다.
- 최소 1건 이상의 기사를 제목·요약·발행 시각·링크로 정리해서 돌려주거나, 왜 결과가 없는지 설명했다.
- 발행 시각은 KST 기준으로 표시했다.
- 네이버 API 쿼터 상태·차단 발생 여부·재시도 금지 원칙을 지켰다.
- 로그인/개인화/차단 우회 범위를 벗어나지 않았다.
