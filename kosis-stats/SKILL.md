---
name: kosis-stats
description: 국가데이터처가 운영하는 KOSIS(국가통계포털, kosis.kr) Open API로 한국 공식 통계표를 검색하고 메타데이터·데이터·대용량 자료를 조회한다. Use when the user asks for 한국 공식 통계 (인구, 가구, 물가, 고용 등) 수치 조회, not for analysis or visualization.
license: MIT
metadata:
  category: data
  locale: ko-KR
  phase: v1
---

# KOSIS Stats

## What this skill does

국가데이터처(구 통계청)가 운영하는 KOSIS(국가통계포털) Open API `https://kosis.kr/openapi/` 로 한국 공식 통계 자료를 조회 자동화한다.

이 스킬은 **조회 전용**이다. 통계 작성, 데이터 변경, 대시보드 등록, 사용자별 통계 자료 등록은 범위에 포함하지 않는다.

지원 endpoint:

- `statisticsSearch.do` — 키워드로 통계표 검색
- `statisticsData.do?method=getMeta` — 통계표 메타데이터 (분류·항목·단위)
- `statisticsParameterData.do` — 통계표 데이터 셀 조회 (기간/분류 필터)
- `statisticsBigData.do` — 대용량 자료 (사전 등록한 `userStatsId` 필요)
- `statisticsList.do` — 통계목록 카테고리 트리 탐색 (주제별/기관별/국제통계/북한통계 등)
- `statisticsExplData.do` — 통계설명 (조사목적·주기·대상·법적근거·공표방법 등 27개 항목)
- `pkNumberService.do` — 통계주요지표 (1,473개 핵심 지표의 개념·산정방법·출처)

## When to use

- "1인 가구 비율 통계 찾아줘"
- "KOSIS에서 고령인구 비율 시도별 데이터 가져와"
- "DT_1IN0001 표 메타데이터 보여줘"
- "최근 5년치 소비자물가지수 KOSIS에서 뽑아줘"
- "국내통계 주제별로 어떤 카테고리가 있어?" (`list`)
- "인구총조사 조사목적·조사주기 알려줘" (`explain`)
- "인구밀도 지표 산정방법 보여줘" (`indicator`)

## When not to use

- 실시간 시세나 거래소 데이터를 원하는 경우 (KOSIS는 공식 통계용)
- 데이터 시각화·분석·보고서 작성이 주 목적인 경우 (이 스킬은 raw 데이터 조회만)
- 통계 작성·등록·수정이 필요한 경우
- 대용량 자료를 받기 위해 사용자별 자료(`userStatsId`)를 새로 등록해야 하는 경우 (KOSIS 웹에서 직접 등록)

## Prerequisites

- Python 3.9+ (stdlib only, 외부 패키지 없음)
- 일반 `search`/`meta`/`data`/`list`/`explain`/`indicator`: `k-skill-proxy`의 KOSIS route가 있는 hosted/self-host 프록시에 접근 가능할 것
- `bigdata` 또는 `--direct`: KOSIS Open API 인증키 (무료, https://kosis.kr/openapi/ 에서 회원가입 후 활용신청)

```bash
python3 kosis-stats/scripts/run_kosis_stats.py --help
```

## Required environment variables

- 일반 `search`/`meta`/`data`/`list`/`explain`/`indicator`: 없음. 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted proxy를 사용한다.
- `KSKILL_KOSIS_API_KEY` — `bigdata` 또는 `--direct`로 KOSIS를 직접 호출할 때만 필요하다.

발급 절차와 호출 한도, 에러 코드 등 자세한 내용은 [`references/kosis-openapi-guide.md`](references/kosis-openapi-guide.md) 참고.

### Credential resolution order (`bigdata` 또는 `--direct` 전용)

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

기본 경로에 저장하는 것은 fallback일 뿐, 강제가 아니다.
일반 조회 helper는 proxy URL만 읽고, KOSIS 인증키는 proxy 서버에서만 주입한다. `bigdata`/`--direct` 호출만 `KSKILL_KOSIS_API_KEY` 환경변수와 위 secrets 파일을 읽는다.
`list`/`explain`/`indicator`는 `search`/`meta`/`data`와 마찬가지로 proxy 경유로 동작한다.

## Inputs

서브커맨드: `search`, `meta`, `data`, `bigdata`, `list`, `explain`, `indicator`.

공통 옵션:

- `--text`: 사람용 요약
- `--json`: 구조화 결과 (기본값)
- `--dry-run`: 인증키 없이 요청 URL/파라미터만 출력
- `--timeout N`: HTTP 타임아웃 초 단위 (기본 30)
- `--proxy-base-url URL`: 기본 hosted proxy 대신 self-host/alternate proxy 사용
- `--direct`: proxy를 우회하고 `KSKILL_KOSIS_API_KEY` 로 KOSIS 직접 호출

서브커맨드별 입력:

- `search`
  - `--query "키워드"`
  - `--result-count N` (1-5000, 기본 20)
  - `--start-count N` (페이징 시작, 기본 1)
- `meta`
  - `--org-id 101` (기본 101=통계청)
  - `--table-id DT_1IN0001`
  - `--meta-type TBL|ITM|OBJ` (기본 TBL)
- `data`
  - `--org-id 101`
  - `--table-id DT_1IN0001`
  - `--prd-se M|Q|S|Y|F|IR` (수록 주기)
  - `--start YYYY[MM|QQ|HH]`, `--end YYYY[MM|QQ|HH]`
  - `--itm-id ALL` (항목 ID, 기본 ALL)
  - `--obj-l 1=ALL --obj-l 2=00` (분류 필터, 반복 가능)
- `bigdata`
  - `--user-stats-id <KOSIS 등록 ID>`
  - `--format json|sdmx|csv` (xls는 바이너리라 helper 미지원 — 필요 시 KOSIS 웹에서 직접 다운로드)
  - `--prd-se`, `--new-est-prd-cnt` (선택)
- `list`
  - `--vw-cd MT_ZTITLE|MT_OTITLE|MT_GTITLE01|MT_GTITLE02|MT_CHOSUN_TITLE|MT_HANKUK_TITLE|MT_STOP_TITLE|MT_RTITLE|MT_BUKHAN|MT_TM1_TITLE|MT_TM2_TITLE|MT_ETITLE` (필수)
  - `--parent-id <LIST_ID>` (하위 카테고리 탐색, 기본 빈 문자열=최상위)
- `explain`
  - `--stat-id <통계조사ID>` (단독) 또는 `--org-id 101 --table-id DT_1IN0001` (조합, 둘 중 하나 필수)
  - `--meta-itm All|statsNm,statsKind,...` (기본 All)
- `indicator`
  - `--jipyo-id 160` (필수, 지표ID)
  - `--service 1|2|3` (기본 1: 1=개념, 2=산정방법·출처, 3=전체설명)
  - `--page-no N`, `--num-of-rows N` (페이징)

## Workflow

### 1. Ensure proxy access is available

일반 `search`/`meta`/`data` 는 기본 hosted `k-skill-proxy`를 사용하므로 사용자 KOSIS 키가 필요 없다. self-host를 쓰면 `KSKILL_PROXY_BASE_URL`을 설정한다.

`bigdata` 또는 `--direct`가 필요할 때만 `KSKILL_KOSIS_API_KEY` 를 credential resolution order에 따라 확보한다. 시크릿이 없다는 이유로 다른 통계 사이트나 비공식 경로를 찾지 않는다.

### 2. Search for candidate tables

질문을 먼저 한국어 키워드로 좁히고 `search` 로 후보 통계표를 본다.

```bash
python3 kosis-stats/scripts/run_kosis_stats.py search --query "1인 가구" --text
```

출력에서 `[ORG_ID/TBL_ID]`를 골라 다음 단계에 사용한다.

### 3. Inspect the table meta before fetching data

데이터를 받기 전에 분류/단위/주기를 확인한다.

```bash
python3 kosis-stats/scripts/run_kosis_stats.py meta --table-id DT_1JC1501 --text
```

### 4. Fetch a small bounded slice first

`--prd-se`, `--start`, `--end`, `--obj-l` 으로 범위를 좁혀 작은 슬라이스를 먼저 조회한다.

```bash
python3 kosis-stats/scripts/run_kosis_stats.py data \
  --table-id DT_1JC1501 --prd-se Y --start 2020 --end 2022 \
  --obj-l 1=ALL --json
```

표마다 필수 분류 차원 수가 다르다. **default `--obj-l 1=ALL` 만으로는 부족한 표가 많다.** KOSIS가 코드 `20` (필수요청변수값 누락 objL)을 돌려주면, `meta --table-id <ID> --meta-type ITM --json` 으로 ITM 안에 들어 있는 `OBJ_ID`(분류 차원)와 코드를 확인한 뒤 `--obj-l 1=<코드> --obj-l 2=<코드>` 형태로 필요한 차원을 모두 지정한다. (많은 표가 OBJ 메타는 비어 있고 분류가 ITM 안에 들어 있음.)

40,000셀을 초과하면 KOSIS는 에러 코드 `31` 또는 `41` 을 반환한다. 기간을 좁히거나(예: 5년→1년) 분류 필터의 ALL 을 특정 코드로 바꿔(예: `--obj-l 1=11` 서울만) 호출을 분할한다. 그래도 부족하면 사용자별 통계자료(`userStatsId`)를 등록해 `bigdata` 서브커맨드를 사용한다.

행정구역 코드 관례: `C1` 코드는 보통 시도가 2자리(`11` 서울, `26` 부산 등), 시군구가 5자리다. `data --json` 응답의 `C1` 필드를 확인해 원하는 단위만 후속 처리에서 필터한다.

### 5. (Optional) Use bigdata for large datasets

`bigdata` 는 KOSIS 웹에서 미리 등록한 `userStatsId` 가 필요하다. 미등록 상태면 사용자에게 등록 안내만 하고 멈춘다.

```bash
python3 kosis-stats/scripts/run_kosis_stats.py bigdata \
  --user-stats-id "openapisample/101/DT_1IN1502/2/1/20191106094026_1" \
  --format json --new-est-prd-cnt 5
```

### 6. Cite the source

응답을 요약할 때는 `org_id`, `tbl_id`, 기간, 단위(`UNIT_NM`), 그리고 endpoint URL을 함께 적는다.

## Done when

- 사용자 질문에 대응하는 통계표 ID(`org_id`/`tbl_id`)가 명확하다.
- 메타데이터를 1회 이상 조회해 분류·단위·주기를 확인했다.
- 작은 슬라이스부터 단계적으로 데이터를 받았다.
- 결과에 출처(table id, 기간, 단위, endpoint)를 명시했다.
- 한도 초과 시 분할 또는 `bigdata` 안내로 처리했다.

## Failure modes

- `KSKILL_KOSIS_API_KEY` 누락: `bigdata` 또는 `--direct` 호출에서만 발급 안내 메시지와 함께 종료(exit 1)
- KOSIS 에러 코드 `10`/`11`: 인증키 누락/만료 → 키 점검. `bigdata` 에서 `11` 이 나오면 `userStatsId` 가 본인 KOSIS 계정에 등록된 것이 아닐 가능성이 크다.
- 코드 `20`: 필수 분류 누락 → `meta --meta-type OBJ` (또는 비어 있으면 `ITM`) 으로 필요한 차원 수와 코드를 확인하고 `--obj-l 1=... --obj-l 2=...` 모두 지정 후 재시도
- 코드 `21`: 잘못된 요청 변수 → `org_id`/`tbl_id`/기간 형식 재확인. tblId 의심 시 `search` 로 정확한 ID 다시 찾기
- 코드 `30`: 결과 없음 → 키워드를 더 짧게 또는 다른 표현으로 바꾸거나 기간/분류 완화. **meta 호출에서 30 이 나오면** 표가 해당 메타 타입을 지원하지 않는 경우이므로 다른 `--meta-type` 시도
- 코드 `31`/`41`: 한도 초과 → 기간 좁히기, 분류 ALL 을 특정 코드로 바꾸기, 또는 `bigdata` 사용
- 코드 `40`: 분당 1,000건 호출 한도 → 잠시 대기
- 코드 `50`: KOSIS 서버 오류 → 1~2초 후 재시도
- 비표준 JSON: KOSIS는 따옴표 없는 키를 가끔 반환한다. helper는 자동 보정한다.
- 응답에 `UNIT_NM` 누락: 일부 표는 KOSIS 응답에 단위가 비어 있다. helper text 출력의 `[summary]` 라인에 `unit=(KOSIS 응답에 UNIT_NM 미포함)` 으로 명시되며, 단위는 `meta` 응답이나 KOSIS 웹 화면에서 별도 확인한다.
- HTTPS 전용 (2026-03-05 이후): URL은 항상 `https://`. HTTP 요청은 차단된다.

### 회복 시나리오 예시

- 코드 20 회복: `data --table-id DT_1J22001 --prd-se M --start 202401 --end 202401` → 코드 20 → `meta --table-id DT_1J22001 --meta-type ITM --json` 으로 차원 확인 → `data ... --obj-l 1=T10 --obj-l 2=0` 재호출 → 성공
- 코드 31 회복: `data --table-id DT_1B26001 --prd-se Y --start 2020 --end 2024 --obj-l 1=ALL --obj-l 2=ALL --obj-l 3=ALL` → 코드 31 → `... --start 2024 --end 2024 --obj-l 1=11 --obj-l 2=ALL --obj-l 3=ALL` (서울만) 재호출 → 성공

## Maintainer review notes

메인테이너가 이 스킬을 검토하기 위해 KOSIS 인증키를 새로 발급받을 필요는 없다.
일반 조회는 `k-skill-proxy`가 KOSIS 인증키를 서버 쪽에서 주입한다. `bigdata` 와 `--direct`만 개인 KOSIS 키가 필요하다.

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `python3 -m py_compile kosis-stats/scripts/run_kosis_stats.py kosis-stats/tests/test_run_kosis_stats.py`
- `python3 kosis-stats/scripts/run_kosis_stats.py --help`
- `python3 kosis-stats/scripts/run_kosis_stats.py search --query 인구 --dry-run` (URL/파라미터 출력만)
- `PYTHONPATH=kosis-stats/scripts python3 -m unittest discover -s kosis-stats/tests -p 'test_*.py' -v`
- `npm run ci`

실제 direct live smoke는 기여자 또는 이미 KOSIS 키가 있는 사용자가 선택적으로 수행한다. Proxy live smoke는 배포 proxy에 `KOSIS_API_KEY`가 설정된 뒤 수행한다. PR에는 호출 endpoint, 파라미터, 응답 행 수 같은 비민감 요약만 남기고 인증키와 개인 조회 세부 내역은 공유하지 않는다.

## Safety notes

- 조회 전용 스킬이다.
- 사용자별 통계자료(`userStatsId`) 등록, 데이터 수정, KOSIS 웹 자동화는 하지 않는다.
- 일반 조회 인증키는 proxy 서버에서만 다룬다. direct/bigdata 인증키는 환경변수 또는 `~/.config/k-skill/secrets.env` 로만 다룬다.
- 응답 JSON에 인증키가 echo 되지 않도록 helper는 `--dry-run` 시에도 키를 `<DRY-RUN>` 으로 대체한다.
