# 국가데이터처 KOSIS 통계 조회 가이드

대상 사이트는 **국가데이터처**(구 통계청)가 운영하는 **KOSIS(국가통계포털)** 공식 Open API `https://kosis.kr/openapi/` 이다. 이 기능은 한국 공식 통계 자료의 **조회 자동화**만 수행한다.

## 이 기능으로 할 수 있는 일

- 키워드로 KOSIS 통계표 검색 (`statisticsSearch.do`)
- 통계표 메타데이터(분류·항목·단위) 조회 (`statisticsData.do?method=getMeta`)
- 통계표 데이터 셀 조회 (`statisticsParameterData.do`)
- 사용자별로 KOSIS에 등록한 대용량 자료 조회 (`statisticsBigData.do`)
- JSON 또는 사람이 읽기 좋은 텍스트 출력

이 기능은 **조회 전용 자동화**이다. 통계 작성, 데이터 변경, 대시보드 등록, 사용자별 통계자료(`userStatsId`) 신규 등록은 하지 않는다.

## 먼저 필요한 것

- Python 3.9+ (stdlib only, 외부 패키지 없음)
- 일반 `search`/`meta`/`data`: 기본 hosted `k-skill-proxy` 접근
- `bigdata` 또는 `--direct`: KOSIS Open API 인증키 (무료, https://kosis.kr/openapi/ 에서 회원가입 후 활용신청)
- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인

```bash
python3 kosis-stats/scripts/run_kosis_stats.py --help
```

## 필요한 환경변수

- 일반 `search`/`meta`/`data`: 없음
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 사용
- `KSKILL_KOSIS_API_KEY` — `bigdata` 또는 `--direct` 전용

### Credential resolution order (`bigdata` 또는 `--direct` 전용)

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

일반 조회 helper는 proxy URL만 읽고, KOSIS 인증키는 proxy 서버에서만 주입한다. `bigdata`/`--direct` 호출만 `KSKILL_KOSIS_API_KEY` 환경변수와 위 secrets 파일을 읽는다.

## 처음 실행 순서

처음 쓰는 사용자는 proxy 기반 검색 → 메타 → 작은 슬라이스 순으로 점검한다. 사용자 KOSIS 키는 일반 조회에 필요 없다.

```bash
python3 kosis-stats/scripts/run_kosis_stats.py search --query "1인 가구" --text
python3 kosis-stats/scripts/run_kosis_stats.py meta --table-id DT_1JC1501 --text
python3 kosis-stats/scripts/run_kosis_stats.py data \
  --table-id DT_1ES4I001S --prd-se Y --start 2020 --end 2023 --text
```

발급 절차와 호출 한도, 에러 코드는 [`kosis-stats/references/kosis-openapi-guide.md`](../../kosis-stats/references/kosis-openapi-guide.md) 에 정리되어 있다.

## 입력값

서브커맨드: `search`, `meta`, `data`, `bigdata`. 공통 출력 옵션은 **서브커맨드 뒤에** 둔다.

- `search`
  - `--query "키워드"`
  - `--result-count N` (1-5000, 기본 20)
  - `--start-count N` (페이징, 기본 1)
- `meta`
  - `--org-id 101` (기본 101=통계청)
  - `--table-id DT_1IN0001`
  - `--meta-type TBL|ITM|OBJ` (기본 TBL)
- `data`
  - `--org-id 101`
  - `--table-id DT_1IN0001`
  - `--prd-se M|Q|S|Y|F|IR`
  - `--start YYYY[MM|QQ|HH]`, `--end YYYY[MM|QQ|HH]`
  - `--itm-id ALL`
  - `--obj-l 1=ALL --obj-l 2=00` (반복)
- `bigdata`
  - `--user-stats-id <KOSIS 등록 ID>`
  - `--format json|sdmx|csv` (xls는 바이너리라 helper 미지원 — 필요 시 KOSIS 웹에서 직접 다운로드)
  - `--prd-se`, `--new-est-prd-cnt`

공통 옵션:

- `--text` / `--json` (기본 JSON)
- `--dry-run` (인증키 없이 URL/파라미터만 출력)
- `--timeout N` (기본 30)
- `--proxy-base-url URL` (기본 hosted proxy 대신 self-host/alternate proxy 사용)
- `--direct` (proxy를 우회하고 `KSKILL_KOSIS_API_KEY` 로 KOSIS 직접 호출)

## 기본 흐름

1. 일반 조회는 기본 hosted proxy를 사용한다. self-host를 쓰면 `KSKILL_PROXY_BASE_URL`을 설정한다.
2. `search` 로 후보 통계표를 본다.
3. `meta` 로 분류·단위·주기를 확인한다.
4. `data` 로 작은 슬라이스를 먼저 받는다.
5. 한도 초과(코드 `31`/`41`)면 기간/분류를 분할하거나 `bigdata` 로 전환한다.
6. 결과 요약 시 `org_id`, `tbl_id`, 기간, 단위, endpoint URL을 함께 적는다.

## 검증 방식

메인테이너가 일반 조회를 검토하기 위해 별도 KOSIS 인증키를 새로 발급받을 필요는 없다.

- CI/리뷰 검증: `./scripts/validate-skills.sh`, `python3 -m py_compile ...`, `--help`, `--dry-run`, 단위 테스트(`python3 -m unittest discover -s kosis-stats/tests`).
- 실제 direct 조회 검증: 기여자 또는 이미 KOSIS 키를 가진 사용자가 `--direct`로 선택 실행한다. Proxy live smoke는 배포 proxy에 `KOSIS_API_KEY`가 설정된 뒤 수행한다.
- PR에는 호출 endpoint, 파라미터, 응답 행 수 같은 비민감 요약만 남긴다. 인증키와 개인 조회 세부 내역은 공유하지 않는다.

## 예시

키워드 검색:

```bash
python3 kosis-stats/scripts/run_kosis_stats.py search --query "1인 가구" --text
```

JSON 검색:

```bash
python3 kosis-stats/scripts/run_kosis_stats.py search --query "고령" --result-count 50 --json
```

테이블 메타데이터:

```bash
python3 kosis-stats/scripts/run_kosis_stats.py meta --table-id DT_1IN0001 --text
```

연간 데이터 작은 슬라이스:

```bash
python3 kosis-stats/scripts/run_kosis_stats.py data \
  --table-id DT_1ES4I001S --prd-se Y --start 2020 --end 2023 --json
```

월간 데이터:

```bash
python3 kosis-stats/scripts/run_kosis_stats.py data \
  --table-id DT_1J22001 --prd-se M --start 202401 --end 202412 --json
```

분류 필터:

```bash
python3 kosis-stats/scripts/run_kosis_stats.py data \
  --table-id DT_1B040A3 --prd-se Y --start 2024 --end 2024 \
  --obj-l 1=ALL --json
```

대용량 자료 (사전 등록한 `userStatsId` 필요):

```bash
python3 kosis-stats/scripts/run_kosis_stats.py bigdata \
  --user-stats-id "<KOSIS에서 등록한 ID>" \
  --format json --new-est-prd-cnt 5
```

URL/파라미터만 확인 (인증키 없이):

```bash
python3 kosis-stats/scripts/run_kosis_stats.py search --query "인구" --dry-run --text
```

## 주의할 점

- 분당 1,000건 호출 한도. 반복 호출 시 호출 간 sleep을 둔다.
- 1회 응답 40,000셀 한도. 초과하면 코드 `31`/`41` 반환 → 쿼리 분할 또는 `bigdata` 사용.
- `bigdata` 의 `userStatsId` 는 KOSIS 웹에서 사용자가 직접 등록해야 하며, 이 helper로 자동 등록하지 않는다. `openapisample/...` 같은 타인 등록 ID는 인증되지 않아 코드 `11` 을 반환한다.
- 2026-03-05 이후 HTTPS 전용. 모든 URL은 `https://`.
- KOSIS는 가끔 따옴표 없는 키의 비표준 JSON을 반환한다. helper가 자동 보정한다.

## 흔한 문제 해결

- `missing required environment variable: KSKILL_KOSIS_API_KEY`: `bigdata` 또는 `--direct` 호출에서만 발생한다. 환경변수가 현재 shell에 주입됐는지 확인한다. 없다면 https://kosis.kr/openapi/ 에서 발급한다.
- `KOSIS error 10` (인증키 누락) / `11` (만료): 키를 재확인하거나 갱신한다. `bigdata` 호출에서 `11` 이 뜨면 해당 `userStatsId` 가 본인 KOSIS 계정에 등록되어 있지 않을 가능성이 높다.
- `KOSIS error 20` (필수 분류 누락): 표마다 필수 차원 수가 다르다. `meta --table-id <ID> --meta-type OBJ` 로 차원 수를 확인하고(OBJ가 비어 있으면 `--meta-type ITM`), `--obj-l 1=<코드> --obj-l 2=<코드>` 형태로 모두 지정한 뒤 재호출한다. 예: `data --table-id DT_1J22001 --prd-se M --start 202401 --end 202401 --obj-l 1=ALL` → 코드 20 → meta 확인 → `--obj-l 1=T10 --obj-l 2=0` 추가 → 성공.
- `KOSIS error 21` (잘못된 요청 변수): `org_id`/`tbl_id`/`prdSe`/`startPrdDe` 형식과 분류 인덱스를 재확인한다. 표에 존재하지 않는 `objL3=ALL` 같은 인덱스는 거부된다. tblId 의심 시 `search --query <키워드>` 로 정확한 ID를 다시 찾는다.
- `KOSIS error 30` (결과 없음): 키워드 또는 기간 필터를 완화한다.
- `KOSIS error 31` / `41` (한도 초과): 기간을 좁히거나(예: 5년 → 1년) 분류 ALL 을 특정 코드로 바꾼다(예: `--obj-l 1=ALL` → `--obj-l 1=11` 서울만). 그래도 부족하면 `bigdata` 로 전환한다. 행정구역 코드는 시도 2자리, 시군구 5자리 관례.
- `KOSIS error 40` (호출 한도): 분당 1,000건 한도 도달. 잠시 대기.
- `KOSIS error 50` (서버 오류): 1~2초 대기 후 재시도.
- `argparse: unrecognized arguments: --text`: `--text`/`--json`/`--dry-run`/`--timeout` 은 서브커맨드(`search`/`meta`/`data`/`bigdata`) **뒤에** 둔다.
