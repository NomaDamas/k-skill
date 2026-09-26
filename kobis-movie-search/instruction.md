# KOBIS 영화정보·박스오피스 조회

## What this skill does

영화진흥위원회 KOBIS(영화관입장권통합전산망) Open API로 영화·박스오피스 공개
데이터를 **조회 전용**으로 가져온다.

- `daily` — 일별 박스오피스 (순위·관객수·매출액·스크린수)
- `weekly` — 주간 박스오피스 (`weekGb`: 월~일 / 금~일 / 월~목)
- `movies` — 영화 목록 검색 (영화명·감독명·개봉일·제작연도·제작국가·유형)
- `movie` — 영화 상세 메타데이터 (감독·배우·장르·등급·제작사·상영시간)
- `people` — 영화인 검색
- `company` — 영화사 검색

예매·결제·취소·신고 같은 **부작용은 이 스킬의 범위가 아니다.** 조회 결과만
전달한다.

## When to use

- "어제 박스오피스 1위 뭐야?"
- "2026년 8월 1일 일별 박스오피스 top 10 보여줘"
- "지난주 주간 박스오피스 알려줘"
- "영화 '광해' KOBIS 상세정보 요약해줘"
- "감독 봉준호 영화 목록 찾아줘"
- "배우 이병헌 필모그래피 KOBIS에서 조회해줘"
- "영화사 CJ ENM 정보 검색해줘"

## When not to use

- CGV/메가박스/롯데시네마 **지점·상영시간표·잔여석** → `korean-cinema-search`
- 예매·결제·좌석 선점 → 이 스킬 범위 밖 (공식 예매 표면에서 사용자가 직접 진행)
- 평점·리뷰·OTT 스트리밍 제공 여부 → KOBIS 데이터 아님
- 실시간 흥행 예측·투자 판단 → 공식 데이터 조회만 한다

## Prerequisites

- Python 3.9+ (표준 라이브러리만 사용, 외부 패키지 없음)
- **KOBIS API 키** (BYOK). 발급 절차:
  1. https://www.kobis.or.kr/kobisopenapi 회원가입/로그인
  2. 키 발급/관리 메뉴에서 API Key 발급
  3. `KSKILL_KOBIS_API_KEY` 환경변수 또는 `~/.config/k-skill/secrets.env`에 저장
- 영화진흥위원회_영화정보 DB(data.go.kr 3076402)는 KOBIS OpenAPI와 **별개 서비스**다.
  이 스킬은 data.go.kr 활용신청을 요구하지 않는다. 필요하면 사용자가 별도로 활용신청한다.

절대 하지 말 것: 키를 repo·GitHub Actions·채팅·셸 인자에 남기지 않는다. 이
스킬은 `KSKILL_` 접두사 규칙을 따르고 키를 출력하지 않는다.

## Access path and fallback order

1. **기본 경로 (직접 호출, BYOK)** — KOBIS OpenAPI를 사용자 키로 직접 호출한다.
   `KSKILL_KOBIS_API_KEY`(환경변수) → `~/.config/k-skill/secrets.env` 순서로 키를 읽는다.

   ```bash
   npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
     daily --target-dt 20260801 --limit 10 --text
   ```

2. **프록시 경유 (후보)** — upstream이 키를 요구하므로 AGENTS.md의 free API proxy
   policy에 따라 좁은 allowlist + cache + rate limit를 갖는 k-skill-proxy route가
   후보가 될 수 있다. 이 스킬은 프록시 코드를 추가하지 않는다. route가 배포되면
   `KSKILL_KOBIS_BASE_URL`(또는 `--base-url`)에 **프록시가 KOBIS 서비스를 노출하는
   전체 base**(프록시가 정하는 prefix 포함)를 지정한다. helper는 그 base 뒤에
   `<service>.json`을 붙여 호출하고 키를 보내지 않으며, upstream 키는 프록시가 주입한다.

   ```bash
   # 예: 프록시가 /v1/kobis prefix로 노출하는 경우
   KSKILL_KOBIS_BASE_URL="https://k-skill-proxy.nomadamas.org/v1/kobis" \
     npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
     daily --target-dt 20260801 --text
   ```

3. **공식 화면 확인** — API가 빈 결과거나 장애면 https://www.kobis.or.kr/kobisopenapi
   에서 같은 조건을 수동 확인하도록 안내한다.

프록시 route가 아직 없다면 경로 1(BYOK 직접 호출)이 실제 동작 경로다.

## Commands

### 일별 / 주간 박스오피스

```bash
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  daily --target-dt 20260801 --limit 10 --text
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  weekly --target-dt 20260801 --week-gb 0 --text
```

`--target-dt`는 `YYYYMMDD`. weekly `--week-gb`는 `0`(월~일)/`1`(금~일)/`2`(월~목).

### 영화 검색 / 상세

```bash
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  movies --query 광해 --text
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  movies --director 봉준호 --limit 20 --text
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  movie --movie-code 20124079 --text
```

`movies`는 영화명(`--query`)·감독명(`--director`) 등 최소 하나의 조건이 필요하다.
`movie`는 숫자 KOBIS 영화코드가 필요하다.

### 영화인 / 영화사 검색

```bash
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  people --query 이병헌 --text
npx -y @nomadamas/k-skill@0 exec kobis-movie-search scripts/kobis_movie_search.py -- \
  company --query CJ --text
```

`--text` 없이 실행하면 구조화 JSON(`result`, `command`, `rows`, `source`)을 출력한다.
`result`는 결과가 있으면 `ok`, 없으면 `empty`다.

### 입력 / 출력

| command | 필수 입력 | 주요 출력 필드 |
| --- | --- | --- |
| `daily` | `--target-dt` | rank, movie_cd, movie_nm, open_dt, audi_cnt, audi_acc, sales_amt, scrn_cnt, show_cnt |
| `weekly` | `--target-dt` | 위와 동일 (주간 집계) |
| `movies` | `--query`/`--director` 등 | movie_cd, movie_nm, prdt_year, open_dt, genre_alt, directors, companys |
| `movie` | `--movie-code` | movie_nm, show_tm, genres, directors, actors, audits, companys |
| `people` | `--query` | people_cd, people_nm, rep_role_nm, filmo_names |
| `company` | `--query` | company_cd, company_nm, company_part_names, filmo_names |

## Data source

- upstream base: `https://www.kobis.or.kr/kobisopenapi/webservice/rest`
- endpoint: `<base>/<service>.json?key=<API_KEY>&<params>`
- JSON 응답 envelope: `boxOfficeResult` / `movieListResult` / `movieInfoResult` /
  `peopleListResult` / `companyListResult`
- `KSKILL_KOBIS_BASE_URL` 또는 `--base-url`로 self-host 프록시·HTTP fallback을 지정할 수 있다.

## Failure modes

| 상황 | 동작 |
| --- | --- |
| API 키 없음 | upstream 미호출, `KSKILL_KOBIS_API_KEY` 설정 안내 (exit 1) |
| API 키 무효 (`faultInfo`) | 키 재확인·재발급 안내 (exit 1) |
| 일일 호출 한도 초과 (`초과`/quota) | 잠시 후 재시도 안내 (exit 1) |
| 빈 결과 (목록 키 없음/빈 배열) | `result: "empty"` — 날짜·검색어·영화코드 확인 안내 |
| 영화 상세 `movieInfo` 없음 | 미등록/개봉 전 영화 가능성 안내 (exit 1) |
| `--target-dt` 형식 오류 | `YYYYMMDD` 8자리 요구 (exit 1) |
| `--movie-code` 형식 오류 | 숫자 KOBIS 영화코드 요구 (exit 1) |
| HTTP 401/403 | 키 인증 실패로 보고 안내 (exit 1) |
| 그 외 HTTP 오류/타임아웃 | upstream 장애·네트워크 점검 안내 (exit 1) |
| 비 JSON(HTML 등) 응답 | 차단·점검 또는 잘못된 endpoint 가능성 안내 (exit 1) |
| 예상 밖 응답 구조 | upstream 변경 가능성 안내 (exit 1) |

## Notes

- 결과는 KOBIS 공식 데이터를 그대로 전달하고 해석·전망을 덧붙이지 않는다.
- 박스오피스는 기준일(`showRange`)과 집계 기준을 함께 표시한다.
- 순위·관객수는 KOBIS 통합전산망 집계 기준이며, 다른 매체 수치와 다를 수 있다.

## Done when

- 요청에 맞는 `daily`/`weekly`/`movies`/`movie`/`people`/`company`를 선택했다.
- 실제 응답의 필드로 결과를 정리하고 출처(KOBIS OpenAPI, 기준일)를 함께 표시했다.
- 빈 결과·키 오류·quota·장애를 명시적 실패로 구분해 안내했다.
- 예매·결제 등 부작용 없이 조회 결과만 제공했다.
