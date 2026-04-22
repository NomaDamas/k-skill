# LH 청약 공고문 조회 가이드

한국토지주택공사(LH)가 `apply.lh.or.kr` 로 공고하는 임대주택·분양주택·주거복지(신혼희망타운)·토지·상가 공고를 공공데이터포털 공식 LH 공고 Open API(`http://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/...`)로 조회한다. 프록시 서버가 `serviceKey` 주입, 캐시, 율속을 맡는다.

## 이 기능으로 할 수 있는 일

- 공고중·접수중·접수마감 등 상태별 LH 공고 목록 조회
- 지역(시/도), 공고 유형(영구임대·행복주택·전세임대·국민임대·매입임대·분양주택·신혼희망타운 등) 필터링
- 공고명 키워드 검색 (예: "행복주택", "든든주택", "청년", "신혼희망")
- 공고 게시일·접수 마감일 구간 필터
- 공고 상세(주택형별 공급 정보, 공식 링크) 확인

## 가장 중요한 규칙

기본 경로는 `https://k-skill-proxy.nomadamas.org/v1/lh-notice/...` 이다. 사용자는 **공공데이터포털 ServiceKey 를 준비할 필요가 없다**. upstream key(`DATA_GO_KR_API_KEY`)는 프록시 서버에서만 주입한다.

마감 여부는 **KST(Asia/Seoul)** 기준으로 판정한다. host local time 을 쓰지 않는다.

본 스킬은 LH 공고 전용이다. SH(서울), GH(경기), iH(인천) 등 지방 주택공사 공고는 포함되지 않는다. 사용자가 그런 공고를 찾으면 본 스킬 범위가 아님을 분명히 말한다.

## 먼저 필요한 것

- 인터넷 연결
- `curl` 또는 HTTP 호출이 가능한 도구
- (프록시 운영자 전용) `DATA_GO_KR_API_KEY` 환경변수

## 지원 엔드포인트

| Route | 설명 |
| --- | --- |
| `GET /v1/lh-notice/search` | 공고 목록 조회. 필터 전부 선택사항. |
| `GET /v1/lh-notice/detail` | 특정 공고 상세 + 주택형별 공급 정보. `panId`/`ccrCnntSysDsCd`/`splInfTpCd` 모두 필수. |

### `/v1/lh-notice/search` 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `panSs` / `status` | string | (없음) | `공고중`, `접수중`, `접수마감`, `당첨자발표`, `추정공고` |
| `uppAisTpCd` / `category` | string | (없음) | `01`=토지, `05`=분양주택, `06`=임대주택, `13`=주거복지, `22`=상가 |
| `aisTpCd` | digits | (없음) | 세부 분류 코드. 예: `09`=영구임대, `10`=행복주택, `17`=전세임대 |
| `cnpCdNm` / `region` | string | (없음) | 지역명(시/도). 예: `서울특별시`, `부산광역시`, `전국` |
| `panNm` / `q` / `keyword` | string | (없음) | 공고명 부분 검색 |
| `panNtStDt` / `startDate` | date | (없음) | 공고 게시일 시작. `YYYY-MM-DD` / `YYYYMMDD` / `YYYY.MM.DD` |
| `clsgDt` / `endDate` | date | (없음) | 접수 마감일 종료 |
| `page` | int | 1 | 페이지 (최대 1000) |
| `pageSize` / `PG_SZ` / `numOfRows` / `limit` | int | 50 | 페이지당 건수 (최대 1000) |

### `/v1/lh-notice/detail` 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `panId` | digits | ✅ | 공고 ID. 목록 응답의 `pan_id` 와 동일 |
| `ccrCnntSysDsCd` | digits | ✅ | 연계시스템 구분 코드. 목록 응답의 `ccr_cnnt_sys_ds_cd` |
| `splInfTpCd` | digits | ✅ | 공급 정보 유형 코드. 목록 응답의 `spl_inf_tp_cd` |

## 기본 흐름

1. 사용자 요청의 지역·공고 유형·상태를 추출한다.
2. 필터를 붙여 `/v1/lh-notice/search` 를 호출한다.
3. KST 오늘 날짜로 마감 여부(D-day)를 표시한다.
4. 공고 상위 3-5건(공고명 / 지역 / 공고일 / 마감일 / 상태 / 링크)을 요약한다.
5. 필요하면 `/v1/lh-notice/detail` 로 주택형별 공급 정보를 추가 조회한다.

## CLI 예시

공고중인 부산 영구임대 공고 목록:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/lh-notice/search' \
  --data-urlencode 'panSs=공고중' \
  --data-urlencode 'uppAisTpCd=06' \
  --data-urlencode 'cnpCdNm=부산광역시' \
  --data-urlencode 'pageSize=20'
```

키워드 검색 (행복주택, 접수중만):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/lh-notice/search' \
  --data-urlencode 'q=행복주택' \
  --data-urlencode 'status=접수중'
```

공고 상세:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/lh-notice/detail' \
  --data-urlencode 'panId=2015122300019828' \
  --data-urlencode 'ccrCnntSysDsCd=03' \
  --data-urlencode 'splInfTpCd=051'
```

## 응답 예시 (목록)

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
      "spl_inf_tp_cd": "051",
      "ccr_cnnt_sys_ds_cd": "03",
      "detail_url": "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300019828&..."
    }
  ],
  "summary": { "page": 1, "page_size": 20, "returned_count": 1, "total_count": 1 },
  "query": { "pan_ss": "공고중", "upp_ais_tp_cd": "06", "cnp_cd_nm": "부산광역시" },
  "proxy": { "name": "k-skill-proxy", "cache": { "hit": false, "ttl_ms": 300000 } }
}
```

## 실패 모드

- `400 bad_request`: `panSs` 값이 허용되지 않거나, 날짜 포맷이 잘못된 경우 등. 메시지를 그대로 사용자에게 노출한다.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없는 경우. 운영자가 키를 등록해야 한다.
- `502 upstream_error`: 공공데이터포털 서버 오류 또는 XML 에러 envelope. `upstream_code` 에 원본 코드가 들어간다 (예: `30` = 등록되지 않은 서비스키).
- `502 upstream_invalid_payload`: 응답이 JSON 이 아닌 경우 (보통 HTML 장애 페이지).

## Done when

- 공식 LH 공고 목록을 조회했다.
- 마감 여부를 KST 기준으로 판정해 표시했다.
- 각 결과에 공고 상세 링크(`detail_url`)를 포함했다.
- 필요한 경우 `panId`/`ccrCnntSysDsCd`/`splInfTpCd` 를 제공해 상세 조회로 이어갈 수 있도록 안내했다.

## 출처/참고

- LH 청약플러스 공고 목록: `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026`
- 공공데이터포털 LH 임대공고문 정보 API: `https://www.data.go.kr/data/15058530/openapi.do`
- 레퍼런스 오픈소스: `heereal/Bunyang_MoeumZip` (Next.js 기반 LH/SH 공고 모음집 샘플 구현)
