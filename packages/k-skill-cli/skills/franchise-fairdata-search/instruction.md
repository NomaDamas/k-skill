# 공정위 가맹정보(FairData) 프랜차이즈 조회

## What this skill does

공정거래위원회 데이터포털 FairData가 안내하는 **가맹정보 오픈API**(공공데이터포털 data.go.kr 데이터셋)를 조회해, 프랜차이즈 **브랜드·가맹본부 공시 사실**을 정리한다.

- `brands` — 브랜드명 부분일치로 브랜드관리번호·가맹본부관리번호·업종·주요상품·가맹사업개시일 조회
- `hq` — 가맹본부 상호명으로 가맹본부 목록 조회(+ `--detail` 시 대표자·주소·기업규모·브랜드수 상세)
- `stores` — 브랜드의 지역별 **가맹점수·직영점수**
- `changes` — 브랜드의 **가맹점 변경현황**(연초/신규/계약종료/계약해지/연말/평균영업일수)
- `sales` — 브랜드의 **연간·면적당 평균매출 범위값**(공정위가 편차 5% 구간으로 공개)
- `report` — 위 항목을 브랜드 단위로 모은 **창업 검토용 사실 리포트**
- `datasets` — 사용하는 데이터셋 endpoint와 필드 라벨 출력(네트워크/키 불필요)

**조회 전용**이다. 점수·등급·위험 판정·매출 추정·전망은 이 스킬의 범위가 아니다.

## 의미 경계

- `biz-health-check`는 **사업자등록번호 기반 일반 실사**(국세청·국민연금·금융위·조달·인허가)이고, 프랜차이즈 본부·브랜드 공시는 다루지 않는다. 이 스킬은 그 반대편(가맹사업 공시)만 다룬다.
- 매출은 공정위가 공개하는 **범위값**이며 정확한 금액도, 미래 예측도 아니다. `k-dart`(공시), `korean-stock-search`(시세)와도 목적이 다르다.

## When to use

- "○○치킨 브랜드 가맹점 몇 개야? 직영점은?"
- "이 프랜차이즈 본부 대표자·기업규모 알려줘"
- "작년 대비 신규·계약해지 얼마나 됐어?"
- "브랜드 평균매출 범위 공시 확인해줘"

## Official access path

1. 진입점: FairData `데이터 > 공공데이터 안내·신청 > 오픈API이용안내` <https://fairdata.go.kr/ext/data/openApiGuidance.do>
2. FairData는 오픈API **인증키를 공공데이터포털(data.go.kr)에서 발급**받도록 안내한다. FairData 개방데이터 목록(`POST /ext/data/selectOpenDtls.do`)에서 가맹정보 API를 고르면 각 항목이 data.go.kr 데이터셋으로 연결된다.
3. 실제 호출은 data.go.kr 게이트웨이의 공정위 서비스로 한다.

```text
GET https://apis.data.go.kr/1130000/<Service>/<operation>
    ?serviceKey=<data.go.kr 인증키>
    &pageNo=<n>
    &numOfRows=<n>
    &resultType=json
    &jngBizCrtraYr=<가맹사업기준년도>     # 목록/상세 계열
    &brandMnno=<브랜드관리번호>            # 브랜드 상세 계열
    &jnghdqrtrsMnno=<가맹본부관리번호>     # 가맹본부 상세 계열
```

화면 scraping이나 비공식 endpoint로 우회하지 않는다.

### 데이터셋

| 용도 | 데이터셋 | 게이트웨이 Service / operation | 필수 파라미터 |
|---|---|---|---|
| 브랜드 목록 | 15125467 | `FftcBrandRlsInfo2_Service` / `getBrandinfo` | `jngBizCrtraYr` |
| 가맹본부 등록 목록 | 15125441 | `FftcJnghdqrtrsRgsInfo2_Service` / `getjnghdqrtrsListinfo` | `jngBizCrtraYr` |
| 가맹본부 일반 정보 상세 | 15125450 | `FftcJnghdqrtrsGnrlDtl3_Service` / `getjnghdqrtrsGnlinfo2` | `jngBizCrtraYr`, `jnghdqrtrsMnno` |
| 브랜드 가맹점·직영점 | 15125490 | `FftcBrandFrcsDropInfo3_Service` / `getbrandFrcsDmsstus2` | `jngBizCrtraYr`, `brandMnno` |
| 브랜드 가맹점 변경현황 | 15125491 | `FftcBrandFrcsChghst2_Service` / `getbrandFrcsFlctnstus` | `jngBizCrtraYr`, `brandMnno` |
| 단위면적당 평균 매출액 | 15125494 | `FftcBrandFrcsUnitAvrSalInfo3_Service` / `getbrandFrcsBzmnAvrgsls2` | `jngBizCrtraYr`, `brandMnno` |
| 브랜드 비교 목록 | 15125517 | `FftcBrandCompInfo2_Service` / `getbrandCompListinfo` | `jngBizCrtraYr`, `brandMnno` |

브랜드/가맹본부 **이름 필터 파라미터는 upstream에 없으므로**, 이 helper는 기준년도 목록을 `pageNo`로 넘기며 브랜드명(`brandNm`)·가맹본부 상호명(`jnghdqrtrsConmNm`)을 클라이언트에서 공백 무시·대소문자 무시 부분일치로 찾는다. 따라서 이름 검색 비용은 그 해 브랜드 수에 비례한다(`--max-pages`, `--num-of-rows`로 조절).

## Credential requirements

- `KSKILL_FAIRDATA_API_KEY` — 공공데이터포털에서 발급한 **Decoding(일반) 인증키**. helper가 URL 인코딩한다.
- 호환 fallback: `DATA_GO_KR_API_KEY`.
- 파일 fallback: `~/.config/k-skill/secrets.env`(0600)의 같은 키. `KSKILL_SECRETS_PATH`로 경로 override 가능.
- 키는 환경변수/로컬 dotenv에서만 읽는다. **소스·URL 로그·캐시·채팅에 남기지 않으며 `--dry-run`은 `serviceKey=REDACTED`로 가린다.** CLI 인자로 키를 받지 않는다.
- 공공데이터포털에서 아래 데이터셋 각각에 **활용신청**이 되어 있어야 한다: 15125467, 15125441, 15125450, 15125490, 15125491, 15125494, 15125517. 미신청이면 `PERMISSION_DENIED(20)`/`SERVICE_ACCESS_DENIED`가 온다.
- 이 PR은 `k-skill-proxy` route를 추가하지 않는다. hosted proxy 경유는 후속 작업(프록시가 키를 보관하고 동일 게이트웨이를 중계)으로 남겨둔다. 현재는 BYOK 직접 호출만 지원한다.

## Inputs

- `brands`: `--name` 브랜드명(부분일치), 선택 `--limit`(기본 20)
- `hq`: `--name` 가맹본부 상호명(부분일치), 선택 `--detail`, `--limit`
- `stores`/`changes`/`sales`: `--brand-mnno` 또는 `--brand`(이름으로 관리번호 자동 해석)
- `report`: `--brand` 또는 `--brand-mnno`, 선택 `--all`, `--limit`
- 공통: `--year`(4자리, 기본 작년), `--dry-run`, `--text`, `--api-base`, `--secrets-path`, `--timeout`, `--num-of-rows`, `--max-pages`

## CLI examples

```bash
npx -y @nomadamas/k-skill@0 exec franchise-fairdata-search scripts/franchise_fairdata_search.py -- brands --name "테스트치킨"
npx -y @nomadamas/k-skill@0 exec franchise-fairdata-search scripts/franchise_fairdata_search.py -- hq --name "테스트에프앤비" --detail --text
npx -y @nomadamas/k-skill@0 exec franchise-fairdata-search scripts/franchise_fairdata_search.py -- report --brand "테스트치킨" --year 2023
npx -y @nomadamas/k-skill@0 exec franchise-fairdata-search scripts/franchise_fairdata_search.py -- stores --brand-mnno BRD_20080100006 --year 2023 --text
npx -y @nomadamas/k-skill@0 exec franchise-fairdata-search scripts/franchise_fairdata_search.py -- datasets
```

`--dry-run`은 네트워크 호출 없이 요청 URL만(`serviceKey=REDACTED`) 출력하므로 키 없이 확인할 수 있다.

## Output

기본은 구조화 JSON이고 `--text`는 사람용 요약이다. 주요 키:

- 상단: `command`, `result`(`ok`/`empty`/`dry_run`/`error`), `source`, `year`, `checked_at`, `coverage.datasets`, `coverage.notes`
- `brands`/`hq`: `rows`(upstream 필드 원문), `meta`(`pages_fetched`, `total_count`), `query`
- `stores`/`changes`/`sales`: `brand_mnno`, `resolution`, `section.status`(`ok`/`empty`/`error`)
- `report`: `reports[]` — 각 항목에 `brand`, `summary`(stores/changes/sales 집계), `sections`(stores/changes/sales/compare/hq_detail), `failures[]`
- `datasets`: `datasets`와 `field_labels`(upstream 코드 → 한글 의미)

필드는 안정성을 위해 **upstream 코드(camelCase)** 를 그대로 유지하고 `FIELD_LABELS`/`--datasets`로 의미를 표시한다. `stores` 집계는 조회된 지역/업종 행의 단순 합이며 upstream 공식 총계가 아니다(`summary.stores.totals_basis`에 명시).

## Fallback order

1. `--brand-mnno`가 있으면 이름 검색 없이 바로 상세 데이터셋을 호출한다.
2. `--brand`만 있으면 `brand_list`(15125467)를 페이지로 넘기며 이름을 해석한 뒤 상세를 호출한다.
3. `report`는 브랜드별 stores → changes → sales → compare → (가능하면) hq_detail 순으로 시도하고, **일부 데이터셋 실패는 나머지를 막지 않는다**(`failures`에 사유 기록).
4. 0건/`NODATA_ERROR(03)`이면 `empty`로 명시한다. 기준년도를 바꾸거나 `--brand-mnno` 직접 지정을 안내한다.
5. 인증/쿼터/차단 오류에는 비공식 대체 데이터를 쓰지 않는다.

## Failure modes

- 키 없음: 네트워크 호출 전에 `KSKILL_FAIRDATA_API_KEY` 설정 안내로 종료(exit 1).
- `20`/`SERVICE_ACCESS_DENIED`: 데이터셋 활용신청 또는 키 권한 없음.
- `22`/`LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS`: 일일 호출 한도 초과. 다음 날 또는 트래픽 증설.
- `30`/`SERVICE_KEY_IS_NOT_REGISTERED`: 등록되지 않은 키. 키 값·Decoding 키 여부 확인.
- `31`/`DEADLINE_HAS_EXPIRED`: 키 사용기간 만료. 포털에서 갱신.
- `10`/`INVALID_REQUEST_PARAMETER`: 연도(4자리)·관리번호 형식 확인.
- `03`/`NODATA_ERROR`: 해당 기준년도/브랜드 공시 없음(빈 결과).
- 응답이 JSON이 아님: 점검·차단·게이트웨이 오류 가능성. 캐시하지 않는다.
- 연결 실패/타임아웃: 네트워크 또는 data.go.kr 상태 확인 후 재시도.
- 빈 이름 매칭: 이름 표기 차이. `--year` 변경 또는 `--brand-mnno` 직접 지정.

## Done when

- 요청한 브랜드/가맹본부가 기준년도 목록에서 해석되어 관리번호가 확정됐다.
- 요청한 지표(가맹점수·직영점수·평균매출 범위·계약/해지 등)를 출처·기준년도와 함께 제공했거나, 명시적 실패 모드로 중단했다.
- 점수·등급·전망을 만들지 않았고, 키를 출력·로그에 남기지 않았다.

## Official surfaces

- FairData 오픈API이용안내: <https://fairdata.go.kr/ext/data/openApiGuidance.do>
- 공공데이터포털: <https://www.data.go.kr>
- 데이터셋: `15125467`, `15125441`, `15125450`, `15125490`, `15125491`, `15125494`, `15125517`
- 게이트웨이: `https://apis.data.go.kr/1130000/...`
