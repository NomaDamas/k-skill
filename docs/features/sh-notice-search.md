# SH 청약·주택 공고문 조회 가이드

서울주택도시개발공사(SH, `i-sh.co.kr`)가 운영하는 **공고 및 공지** 게시판을 검색·상세 조회한다. SH는 LH 처럼 공공데이터포털에 안정적인 공고 Open API 가 열려 있지 않기 때문에, 프록시 서버가 공식 SH HTML 게시판을 직접 읽고 정규화한다. 본 스킬은 read-only 조회만 다룬다.

## 이 기능으로 할 수 있는 일

- SH 공고/공지 게시판의 최신 목록 조회 (장기전세·행복주택·매입임대·공공원룸 등 SH 가 직접 게시하는 공고)
- 공고 제목 키워드 검색 (예: `행복주택`, `장기전세`, `미리내집`, `당첨자`)
- 본문 키워드 검색 (`srchTp=content`)
- 공고 상세: 본문 텍스트, 등록일, 조회수, 첨부파일명, 미리보기 링크

## 가장 중요한 규칙

기본 경로는 `https://k-skill-proxy.nomadamas.org/v1/sh-notice/...` 이며, 사용자는 별도 인증 키를 준비할 필요가 없다. SH 사이트는 인증 없이 공개되어 있다.

본 스킬은 **SH 게시판 전용**이다. LH(한국토지주택공사) 공고는 `lh-notice-search` 스킬을, GH(경기)·iH(인천) 등 다른 지방 주택공사 공고는 본 스킬에서 다루지 않는다. SH `seq` 는 SH 게시글 번호이며 LH `pan_id` 와 다른 ID 체계다.

## 먼저 필요한 것

- 인터넷 연결
- `curl` 또는 HTTP 호출이 가능한 도구

## 지원 엔드포인트

| Route | 설명 |
| --- | --- |
| `GET /v1/sh-notice/search` | 공고 목록 조회. 모든 파라미터 선택사항. |
| `GET /v1/sh-notice/detail` | 공고 상세 + 본문 + 첨부 미리보기 링크. `seq` 필수. |

### `/v1/sh-notice/search` 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `q` / `keyword` / `srchWord` | string | (없음) | 검색어. 최대 100자 |
| `srchTp` / `searchType` | string | 키워드가 있으면 `title` | `title`/`제목` 또는 `content`/`내용`. 검색어가 있고 비우면 자동으로 제목 검색이 적용된다 |
| `page` | int | 1 | 페이지 (최대 1000) |
| `pageSize` / `limit` | int | 10 | 페이지당 건수. **SH 게시판이 한 페이지에 최대 10건만 응답하므로 값은 10으로 캡된다.** 더 많은 결과는 `page` 를 증가시켜 조회한다 |
| `multiItmSeq` | digits | 2 | SH 게시판 분류. `2` = 공고 및 공지 |

### `/v1/sh-notice/detail` 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `seq` / `noticeSeq` / `id` | digits | ✅ | SH 게시글 번호. 목록 응답의 `seq` |
| `multiItmSeq` | digits | (선택) | 기본 `2` |

## 기본 흐름

1. 사용자 요청에서 키워드와 게시판 분류 의도를 추출한다.
2. 키워드만 있으면 `srchTp` 가 자동으로 `title` 로 처리된다는 점을 활용해 `/v1/sh-notice/search` 를 호출한다.
3. 결과 상위 3~5건만 간결히 보여주고, 제목·담당부서·등록일·조회수·공식 상세 링크를 포함한다.
4. 사용자가 더 깊이 알고 싶어하면 `seq` 로 `/v1/sh-notice/detail` 을 호출해 본문 요약과 첨부 미리보기 링크를 제시한다.
5. 공식 사이트(`detail_url`)와 미리보기 링크(`preview_url`)는 항상 함께 제시한다.

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"

# 행복주택 공고 최근 3건 (제목 검색이 자동 적용됨)
curl -fsS --get "${BASE%/}/v1/sh-notice/search" \
  --data-urlencode 'q=행복주택' \
  --data-urlencode 'pageSize=3'

# 본문에서 '당첨자' 가 들어간 공고 검색
curl -fsS --get "${BASE%/}/v1/sh-notice/search" \
  --data-urlencode 'q=당첨자' \
  --data-urlencode 'srchTp=content'

# 특정 공고 상세 보기
curl -fsS --get "${BASE%/}/v1/sh-notice/detail" \
  --data-urlencode 'seq=303994'
```

## 응답 정책

- 공식 SH 사이트(`www.i-sh.co.kr`) 정보만 사용한다.
- 마감일이 별도 필드로 제공되지 않는 게시판 구조다. 본문/첨부 공고문에 있는 접수기간은 상세 본문을 읽고 별도 추출·요약해야 한다.
- 첨부 원문 확인에는 `preview_url` (공식 SH 미리보기 변환 URL) 을 우선 사용한다. 직접 다운로드 URL 은 SH 사이트 흐름이 바뀔 수 있어 제공하지 않는다.

## 실패 모드

- `seq` 또는 `multiItmSeq` 가 숫자가 아니면 `400 bad_request`.
- 검색어가 100자를 초과하면 `400 bad_request`.
- SH 사이트가 일시 장애이거나 HTML 구조가 바뀌면 `502 upstream_error` 또는 빈 결과가 내려올 수 있다.
- SH 게시판은 `srchTp` 없이 `srchWord` 만 보내면 키워드를 무시하고 전체 목록을 돌려주는 특성이 있어, 프록시가 자동으로 `srchTp=1` (제목 검색) 으로 폴백한다.

## 사용하지 않는 경우

- LH(한국토지주택공사) 전용 공고 → `lh-notice-search` 사용
- GH(경기)·iH(인천) 등 다른 지방공사 공고
- 청약 신청 자동화/제출, 로그인 필요한 마이페이지 업무
- 개별 자격 심사, 당첨 예측, 가점 계산
