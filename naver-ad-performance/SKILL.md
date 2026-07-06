---
name: naver-ad-performance
description: 네이버 검색광고(키워드광고)의 노출수·클릭수·광고비·CTR·CPC·전환수를 조회한다. 캠페인/광고그룹/키워드 목록, 기간별 성과, 연관키워드·월간 조회수 도구 포함. 읽기 전용, 로컬 실행 전용.
license: MIT
metadata:
  category: marketing
  locale: ko-KR
  phase: v1
---

# 네이버 검색광고 성과 조회

## What this skill does

네이버 검색광고 API(HMAC-SHA256 서명 인증)를 감싸서 광고 계정의 성과 지표를 조회한다. **읽기 전용**이며 입찰가·캠페인·키워드를 바꾸는 쓰기 작업은 하지 않는다.

- 캠페인/광고그룹/키워드 목록 조회
- 기간별 성과(노출수·클릭수·광고비·CTR·CPC·평균노출순위·전환수) 조회
- 연관키워드·월간 조회수·경쟁정도 조회 (키워드 도구)
- 키 셋업 여부와 네이버 API 도달성 진단(`doctor`)

## When to use

- "네이버 광고 노출수/클릭수/광고비/CTR 보여줘"
- "이번달 캠페인 성과 어때"
- "이 키워드 CTR·CPC 얼마야"
- "연관키워드랑 월간 조회수 뽑아줘"
- "네이버 검색광고 키 셋업이 됐는지 확인해줘"

## When not to use

- **클라우드 샌드박스 환경**: 네이버 검색광고 API는 로컬 egress가 필요하다. 클라우드 실행 에이전트(허용 도메인 목록 방식)에서는 도달하지 못할 수 있다 — 먼저 `doctor`로 확인한다.
- **입찰가 변경, 캠페인/키워드 생성·수정·삭제**: 이 스킬은 조회 전용이다. 광고 운영에 영향을 주는 쓰기 작업은 이 스킬 범위 밖이며 구현돼 있지 않다.
- 네이버 검색(블로그/뉴스/쇼핑) 결과 조회는 `naver-blog-research`, `naver-news-search`, `naver-shopping-search` 스킬을 쓴다 — 이 스킬과는 다른 API다.

## Prerequisites

- Python 3.9+
- 네이버 검색광고 계정 (searchad.naver.com) → **도구 > API 사용 관리**에서 API 키/시크릿 발급
- 환경변수 3개: `NAVER_AD_API_KEY`, `NAVER_AD_SECRET_KEY`, `NAVER_AD_CUSTOMER_ID`

키는 사용자가 직접 발급해 credential resolution order(`docs/security-and-secrets.md`)에 따라 공급한다. 에이전트가 값을 대신 입력하지 않는다.

## Workflow

### 1. 진단

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py doctor
```

키 3개 존재 여부와 `api.searchad.naver.com` 도달 가능 여부를 보여준다. `reachable: false`면 로컬(클로드 코드/코덱스 CLI) 환경에서 다시 실행하도록 안내한다.

### 2. 구조 조회 (id가 필요할 때)

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py campaigns
python3 naver-ad-performance/scripts/naver_ad_performance.py adgroups --campaign <nccCampaignId>
python3 naver-ad-performance/scripts/naver_ad_performance.py keywords --adgroup <nccAdgroupId>
```

### 3. 성과 조회 (핵심)

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py stats --ids <id1,id2> --since 2026-06-01 --until 2026-06-30
python3 naver-ad-performance/scripts/naver_ad_performance.py stats --ids <id> --since 2026-06-01 --until 2026-06-30 --by day
```

`ids`는 캠페인/광고그룹/키워드 id를 콤마로 구분해 섞어 넣을 수 있다. `--since`/`--until`을 생략하면 네이버 기본 기간(최근)으로 조회된다.

### 4. 키워드 도구

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py keywordtool --keywords "제주여행,게스트하우스"
```

## Signing (참고)

요청마다 `X-Timestamp`(ms epoch), `X-API-KEY`, `X-Customer`, `X-Signature` 헤더가 필요하다.

```
message   = "{timestamp}.{method}.{uri_path_only}"   # 쿼리스트링 제외, method는 대문자
signature = base64(HMAC_SHA256(message, SECRET_KEY))
```

## Output fields

`stats`: `impCnt`(노출수), `clkCnt`(클릭수), `salesAmt`(광고비), `ctr`(CTR, 없으면 클릭수/노출수로 계산), `cpc`(CPC, 없으면 광고비/클릭수로 계산), `avgRnk`(평균노출순위), `ccnt`(전환수). 각 행에 한글 라벨(`labels`)을 덧붙인다.

`keywordtool`: `relKeyword`(연관키워드), `monthlyPcQcCnt`/`monthlyMobileQcCnt`(월간 PC/모바일 조회수), `compIdx`(경쟁정도) 등.

## Scope (읽기 전용 — 이 경계를 넘지 않는다)

허용: `/ncc/campaigns`, `/ncc/adgroups`, `/ncc/keywords`, `/stats`, `/keywordstool` GET 조회.

금지 (구현하지 않음): 입찰가 변경, 캠페인/광고그룹/키워드 생성·수정·삭제, 예산 변경, 상태(운영중지 등) 토글. 돈이 직접 나가는 쓰기 작업과 조회를 안전 경계로 분리하기 위해 의도적으로 뺐다. 쓰기 기능이 필요해지면 별도 스킬/별도 승인 흐름으로 분리한다.

## Failure modes

| 증상 | 원인 |
|---|---|
| `missing required env var(s): ...` | 환경변수 미설정. 정확히 어떤 이름이 빠졌는지 출력됨 |
| HTTP 401 | 서명 실패 — 키 값 또는 시스템 시계 확인 |
| HTTP 403 | 이 `customer_id`에 조회 권한 없음 |
| HTTP 404 | campaign/adgroup id가 잘못됨 |
| HTTP 429 | 호출 한도 초과 — 잠시 후 재시도 |
| `egress unreachable` | 클라우드 샌드박스 등에서 네이버로 나가는 네트워크가 막힘 — 로컬 실행 필요 |

## Done when

- `stats` 명령이 지정한 id·기간에 대해 노출수·클릭수·광고비·CTR·CPC를 반환한다.
- 입찰가/캠페인/키워드를 바꾸는 어떤 요청도 보내지 않았다.
- 키가 없을 때 우회하지 않고 정확한 환경변수 이름을 안내했다.

## Notes

- 대용량 기간 리포트(TSV 비동기 생성, `/stat-reports`)는 이번 v1 범위 밖이다. 필요해지면 별도로 추가한다.
- 참고 구현: [`NariP/naver-searchad`](https://github.com/NariP/naver-searchad) (MIT) — 서명 방식과 명령 설계를 참고했다.
