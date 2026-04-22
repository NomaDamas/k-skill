---
name: lh-notice-search
description: Search official LH 청약 (Korea Land & Housing Corporation lease/subscription) 공고 lists through k-skill-proxy. Use when a user asks about 청년/행복/영구/국민/매입/전세임대, 분양주택, 신혼희망타운 공고 marketed on apply.lh.or.kr.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# LH 청약 공고문 조회

## What this skill does

한국토지주택공사(LH)가 `apply.lh.or.kr` 로 공고하는 **임대주택·분양주택·주거복지(신혼희망타운 등)·토지·상가 공고**를 공공데이터포털(`data.go.kr`)의 공식 LH 공고 Open API로 조회한다. 요청은 `k-skill-proxy` 의 `/v1/lh-notice/*` 라우트로 보내고, 결과는 공고 목록·공고 상세(주택형별 공급 정보)로 정리한다.

본 스킬은 사회초년생, 청년, 신혼부부처럼 **LH 공고 존재 자체를 모르는 사용자**가 공고 마감 전에 공고문을 빠르게 찾을 수 있도록 돕는다.

## When to use

- "LH 영구임대 공고 지금 뭐 올라와 있어?"
- "신혼희망타운 공고 요즘 나온 거 정리해줘"
- "부산광역시 LH 임대주택 공고중인 것 보여줘"
- "전세임대 공고 중 마감 임박한 거 찾아줘"
- "공고번호 2015122300019828 상세 정보 보여줘"
- "행복주택 청년 모집 공고 요약해줘"

## When not to use

- 개별 사용자의 자격 심사, 당첨 예측, 가점 계산
- 청약 신청 자동화/자동 제출 (본 스킬은 read-only 조회다)
- 청약통장·주택도시기금 계좌 업무 (해당 범위는 LH 공고와 별개다)
- SH(서울주택도시공사)·GH(경기주택도시공사)·iH(인천도시공사) 전용 공고 (본 스킬은 LH 공고만 다룬다)

## Inputs

- `panSs` (또는 `status`): 공고 상태. `공고중`, `접수중`, `접수마감`, `당첨자발표`, `추정공고` 중 하나. 비우면 전체.
- `uppAisTpCd` (또는 `category`): 주택 대분류. `01`(토지), `05`(분양주택), `06`(임대주택), `13`(주거복지·신혼희망타운), `22`(상가).
- `aisTpCd`: 세부 분류 코드 (숫자). 예: `09`=영구임대, `10`=행복주택, `17`=전세임대.
- `cnpCdNm` (또는 `region`): 지역명. 예: `서울특별시`, `부산광역시`, `전국`.
- `panNm` (또는 `q`, `keyword`): 공고명 부분 검색 키워드. 예: `행복주택`, `청년`, `든든주택`.
- `panNtStDt` (또는 `startDate`): 공고 게시일 시작. YYYY-MM-DD / YYYYMMDD / YYYY.MM.DD 모두 허용.
- `clsgDt` (또는 `endDate`): 접수 마감일 종료. 날짜 포맷 동일.
- `page` (기본 1, 최대 1000), `pageSize` (기본 50, 최대 1000).

상세 조회 (`/v1/lh-notice/detail`) 는 `panId`, `ccrCnntSysDsCd`, `splInfTpCd` 세 값 모두 필수다. 이 값은 목록 응답의 `pan_id`, `ccr_cnnt_sys_ds_cd`, `spl_inf_tp_cd` 를 그대로 쓰면 된다.

## Prerequisites

- 인터넷 연결
- `curl` (또는 동일한 HTTP 호출이 가능한 도구)

사용자에게 필요한 시크릿은 없다. 공공데이터포털 `DATA_GO_KR_API_KEY` 는 `k-skill-proxy` 서버 쪽에만 둔다.

## Default path

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값, 없으면 기본 `https://k-skill-proxy.nomadamas.org` 를 사용한다.

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
BASE="${BASE%/}"
```

## Supported endpoints

### 공고 목록 조회

```
GET /v1/lh-notice/search
```

필터는 선택사항이다. 필터 없이 호출하면 최근 공고를 상태 무관하게 최대 50건 돌려준다. 마감 임박한 공고만 보고 싶다면 `panSs=공고중` 과 `clsgDt` 로 구간을 좁힌다.

### 공고 상세 조회

```
GET /v1/lh-notice/detail?panId={공고ID}&ccrCnntSysDsCd={연계시스템코드}&splInfTpCd={공급정보유형코드}
```

상세 응답은 `notice`(공고 요약) + `supply_infos`(주택형/필지/상가호 별 공급 정보 배열) 를 돌려준다.

## Example requests

### 목록 — 부산 영구임대 공고중

```bash
curl -fsS --get "${BASE}/v1/lh-notice/search" \
  --data-urlencode 'panSs=공고중' \
  --data-urlencode 'uppAisTpCd=06' \
  --data-urlencode 'cnpCdNm=부산광역시' \
  --data-urlencode 'pageSize=20'
```

### 목록 — 키워드 "행복주택" 으로 접수중

```bash
curl -fsS --get "${BASE}/v1/lh-notice/search" \
  --data-urlencode 'q=행복주택' \
  --data-urlencode 'status=접수중'
```

### 상세 — 특정 공고

```bash
curl -fsS --get "${BASE}/v1/lh-notice/detail" \
  --data-urlencode 'panId=2015122300019828' \
  --data-urlencode 'ccrCnntSysDsCd=03' \
  --data-urlencode 'splInfTpCd=051'
```

## Response shape

### 목록 응답

```json
{
  "items": [
    {
      "pan_id": "2015122300019828",
      "pan_nm": "2026년 상반기 부산광역시 영구임대주택 예비입주자 모집 공고",
      "upp_ais_tp_cd": "06",
      "ais_tp_cd": "09",
      "ais_tp_cd_nm": "영구임대",
      "cnp_cd_nm": "부산광역시",
      "pan_ss": "공고중",
      "pan_dt": "2026-04-21",
      "clsg_dt": "2026-05-06",
      "rcrit_pblanc_dt": null,
      "spl_inf_tp_cd": "051",
      "ccr_cnnt_sys_ds_cd": "03",
      "detail_url": "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300019828&..."
    }
  ],
  "summary": {
    "page": 1,
    "page_size": 20,
    "returned_count": 1,
    "total_count": 1
  },
  "query": {
    "pan_ss": "공고중",
    "upp_ais_tp_cd": "06",
    "cnp_cd_nm": "부산광역시"
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
    "pan_id": "2015122300019828",
    "pan_nm": "2026년 상반기 부산광역시 영구임대주택 예비입주자 모집 공고",
    "ais_tp_cd_nm": "영구임대",
    "...": "목록 응답과 동일한 필드"
  },
  "supply_infos": [
    { "HOUSE_TY": "영구임대 29㎡", "SPL_CNT": "120" },
    { "HOUSE_TY": "영구임대 39㎡", "SPL_CNT": "80" }
  ],
  "query": {
    "pan_id": "2015122300019828",
    "ccr_cnnt_sys_ds_cd": "03",
    "spl_inf_tp_cd": "051"
  },
  "proxy": { "...": "..." }
}
```

## Response policy

- 공식 LH 공고(`apply.lh.or.kr`) 정보만 사용한다. 커뮤니티 요약, 블로그 후기, 사설 부동산 정보는 섞지 않는다.
- **마감 여부는 KST 기준 현재 날짜와 `clsg_dt` 를 비교해 판정**한다. 오늘 = 마감일이면 "오늘 마감"으로 표기한다.
- 상세 응답의 `detail_url` 을 항상 함께 보여 준다. 사용자는 공고문 원본으로 바로 접근할 수 있어야 한다.
- 공고번호(`pan_id`) 를 숨기지 말고 요약에 포함한다. 이후 상세 조회에 그대로 쓴다.
- **본 스킬은 SH·GH·iH 공고를 포함하지 않는다.** 사용자가 서울시·경기도·인천시 공사 공고를 찾으면 본 스킬로는 못 찾는다는 점을 분명히 말한다.

## Keep the answer compact

사용자에게 돌려줄 때는 이렇게 압축한다.

- 필터 요약: 지역 + 공고 유형 + 상태
- 결과 건수 (`summary.total_count` 와 `returned_count`)
- 상위 3-5건 대표 공고: 공고명, 지역, 공고일, 마감일, 상태, 링크
- 마감 임박(D-3 이하) 공고는 별도로 강조
- 상세 조회 제안: "공고번호 X 상세 보고 싶으면 `lh-notice/detail` 로 조회"

## Failure modes

- 필터 값이 잘못되면 `400 bad_request` 가 돌아온다. 오류 메시지를 그대로 노출해 사용자가 교정하게 한다.
- 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없으면 `503 upstream_not_configured` 가 돌아온다.
- upstream(공공데이터포털) 이 일시 장애이면 `502 upstream_error` + `upstream_code` 를 돌려준다. 재시도는 캐시되지 않으므로 바로 다시 호출해도 된다.
- upstream 이 XML 에러 envelope(`OpenAPI_ServiceResponse`) 를 돌려주면 `502 upstream_error` + `upstream_code`(예: `30` = 등록되지 않은 서비스키) 로 변환한다.
- 응답이 JSON 이 아니면 `502 upstream_invalid_payload` 로 내려간다.

## Done when

- 사용자의 지역·공고 유형·상태 의도에 맞춰 적어도 한 번 `/v1/lh-notice/search` 를 호출했다.
- 결과에 공고명, 지역, 공고일/마감일, 상태, 공식 링크가 모두 포함되어 있다.
- 마감 여부를 KST 기준으로 판정해 표기했다.
- 필요하면 상세 조회로 이어가거나 사용자가 스스로 상세를 조회할 수 있도록 `panId`/`ccrCnntSysDsCd`/`splInfTpCd` 를 함께 안내했다.

## Notes

- 공식 LH 청약플러스 포털: `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026`
- 공공데이터포털 카탈로그: `https://www.data.go.kr/data/15058530/openapi.do` (LH 임대공고문 정보)
- upstream `panSs` 값은 한국어로 정확히 맞춰서 보낸다. 영문/공백 변형은 받지 않는다.
- 대분류/세부분류 코드 매핑 참고:
  - `06` 임대주택: `09` 영구임대, `10` 행복주택, `17` 전세임대, `08` 국민임대, `26` 매입임대 등
  - `13` 주거복지: `17` 전세임대, 신혼희망타운 등
  - `05` 분양주택, `01` 토지, `22` 상가
