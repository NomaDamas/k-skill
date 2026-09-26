# 정부24 공공서비스(혜택) 검색

## What this skill does

공공데이터포털의 **행정안전부_대한민국 공공서비스(혜택) 정보** (data.go.kr dataset `15113968`, 정부24와 동일한 실시간 정보)를 조회한다. upstream은 odcloud gateway 세 endpoint다.

- `serviceList` → `list`: 공공서비스 목록 (서비스명·소관기관·소관기관유형·사용자구분·서비스분야·수정일시 필터)
- `serviceDetail` → `detail`: 개별 서비스 상세 (서비스목적, 신청방법, 신청기한, 온라인신청사이트URL, 구비서류, 문의처, 근거 법령)
- `supportConditions` → `conditions`: 개별 서비스 지원조건 (성별·대상연령·중위소득·생애주기/가구/업종 코드)

이 helper는 조회 전용이다. `detail` 응답의 `온라인신청사이트URL`·`신청방법`·`구비서류`까지 요약해 주고, 실제 신청은 사용자가 공식 사이트에서 진행한다.

## When to use

- "청년 월세 지원 서비스 찾아줘"
- "서울 사는 30대가 신청할 수 있는 주거 지원금 알려줘"
- "국민내일배움카드 신청 방법이랑 온라인 신청 URL 알려줘"
- "여성가족부가 운영하는 한부모 지원 서비스 목록 보여줘"
- "이 서비스 지원조건(연령·소득) 확인해줘"

## When not to use

- `kstartup-search`(창업 공고), `korean-scholarship-search`(장학금), `lh-notice-search`(LH 공고)처럼 특정 기관의 모집 공고만 필요한 경우 — 이 스킬은 정부24 공공서비스 카탈로그(제도·혜택) 검색이다.
- `government-support-survey`가 모으는 기업 대상 지원사업 공고 전수조사 — 범위가 다르다.
- 마감 임박 공고 추적: 공공서비스 목록은 공고가 아니라 상시 제도 중심이고, 갱신 주기도 보장되지 않는다.
- 서비스 신청·증명서 발급·결제 같은 쓰기 동작: 이 스킬은 조회만 한다.

## Prerequisites

- 인터넷 연결, `python3` (stdlib only)
- 설치된 스킬 안의 `scripts/gov_service_search.py`

## Credential requirements

- **BYOK (기본 경로)**: `KSKILL_GOV24_API_KEY` — 공공데이터포털 `행정안전부_대한민국 공공서비스(혜택) 정보` (`15113968`) 활용신청 후 발급받은 일반 인증키. 비용 무료, 심의유형은 개발/운영 모두 자동승인이다.
  - 발급: <https://www.data.go.kr/data/15113968/openapi.do> → "활용신청" → 승인 후 마이페이지의 인증키 사용.
  - 인증키는 Encoding/Decoding 두 형태로 표시된다. helper는 **HTTP `Authorization: Infuser <키>` 헤더**만 쓰므로 **Decoding(원문) 키**를 넣는다. URL에 키를 넣지 않으므로 로그·dry-run 출력에 키가 남지 않는다.
- `KSKILL_PROXY_BASE_URL` — `--via-proxy`로 self-host/별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` (프록시 route가 배포된 뒤에만 유효).
- 프록시 운영자는 프록시 서버 환경에 두는 data.go.kr provisioning 키(기존 `DATA_GO_KR_API_KEY` 관례)에 `15113968` 활용신청 승인 상태를 추가해 둔다.

### Credential resolution order (`--via-proxy`가 아닐 때)

1. 돌쇠 credential mode에서는 provisioned `vault-run` capability를 사용하고, 없으면 `request_vault_credential`로 정부24/data.go.kr API key 입력 UI를 호출한다.
2. 그 밖의 환경에서는 이미 주입된 환경변수 → host vault → `~/.config/k-skill/secrets.env`(`0600`) 순서로 사용한다.
3. 값이 없으면 호스트의 가장 안전한 입력 표면으로 받아 vault 또는 dotenv에 저장한다. 대화창에 평문 키를 붙여넣지 않는다.

helper가 읽는 키 이름은 `KSKILL_GOV24_API_KEY`이고, self-host 사용자를 위해 `DATA_GO_KR_API_KEY`를 fallback 별칭으로만 읽는다. 키는 요청 헤더에만 실리고 URL·표준출력·에러 메시지에 남기지 않는다.

## Access path and fallback order

1. **`--via-proxy` (권장, route 배포 후)**: `k-skill-proxy`가 upstream 키를 보관하고 `/v1/gov24/*` 세 route로 중계한다. 사용자 키가 필요 없다. upstream이 키를 요구하므로 AGENTS.md의 free API proxy policy상 narrow allowlist + cache + rate limit 대상 route 후보다. **이 route는 아직 배포되지 않았을 수 있다** — helper에는 경로 계약만 구현돼 있고, `404`/`503`이면 다음 fallback을 쓴다.
   - `GET /v1/gov24/service-list`, `GET /v1/gov24/service-detail`, `GET /v1/gov24/support-conditions` (쿼리 파라미터는 아래 Inputs와 동일, `serviceKey`는 프록시 서버가 주입)
2. **BYOK 직접 호출 (기본)**: `--via-proxy` 없이 실행하면 `https://api.odcloud.kr/api/gov24/v3/<operation>`을 `Authorization` 헤더로 호출한다.
3. **키가 없을 때**: `--dry-run`으로 요청 URL/파라미터를 확정한 뒤, 사용자에게 위 발급 절차를 안내한다. 정부24 웹(<https://www.gov.kr>)의 서비스 검색 화면에서 같은 키워드로 확인하는 것은 가능하지만, 그 화면을 자동 우회·스크래핑하는 경로는 이 스킬의 범위가 아니다. CAPTCHA·본인인증은 우회하지 않는다.

## Inputs

서브커맨드: `list`, `detail`, `conditions`.

공통 옵션:

- `--page N` (기본 1, ≥ 1)
- `--per-page N` (기본 10, 1–100)
- `--text` 사람용 요약 / `--json` 구조화 결과(기본)
- `--dry-run` 네트워크 호출 없이 요청 URL/파라미터만 출력(키는 `<REDACTED>`로 대체)
- `--timeout N` HTTP 타임아웃 초 (기본 30)
- `--via-proxy` proxy 경유 (키 불필요)
- `--proxy-base-url URL` self-host/alternate proxy (기본 `KSKILL_PROXY_BASE_URL` 또는 hosted)
- `--secrets-path PATH` BYOK secrets 파일 경로 (기본 `~/.config/k-skill/secrets.env`)

`list` 필터:

- `--keyword "청년"` → `cond[서비스명::LIKE]`
- `--org "국토교통부"` → `cond[소관기관명::LIKE]`
- `--org-type "중앙부처"` → `cond[소관기관유형::LIKE]`
- `--user-type "개인"` → `cond[사용자구분::LIKE]`
- `--field "주거"` → `cond[서비스분야::LIKE]`
- `--updated-since 2026-01-01` / `--updated-until 2026-12-31` → `cond[수정일시::GTE/LTE]` (`YYYY-MM-DD`; `YYYYMMDD`·`YYYY/MM/DD`도 정규화)
- `--region "서울"` — **client-side** 필터. upstream에 지역 필드가 없어 응답 본문(지원대상·선정기준·서비스목적요약·서비스명·소관기관명)에서 지역 토큰을 찾는다.
- `--target "청년"` — **client-side** 필터. 같은 방식으로 지원대상·선정기준·서비스목적요약·서비스명에서 대상/생애주기 토큰을 찾는다.
- `--disambiguate` — 정규화한 서비스명이 같은 후보가 2건 이상이면 `disambiguation.duplicate_groups`로 묶어 보여준다.
- `--region`·`--target`은 쉼표로 여러 토큰을 주면 AND(모든 토큰이 행에 있어야 통과)다.

`detail`·`conditions` 필수 옵션:

- `--service-id "..."` → `cond[서비스ID::EQ]` (`list` 응답의 `서비스ID`)

`conditions` 매칭 옵션(선택):

- `--age 30` (0–120) — `JA0110`/`JA0111` 대상연령과 비교
- `--gender 남|여` — `JA0101`/`JA0102`와 비교
- `--income "중위소득 51~75%"` — `JA0201`–`JA0205`와 비교 (`중위소득` 접두사 생략 가능)

## Outputs

- 공통: upstream JSON envelope(`page`, `perPage`, `totalCount`, `currentCount`, `matchCount`, `data`)를 그대로 보존하고 `query`·`operation`·`checked_at`(UTC)를 덧붙인다.
- `client_filter`(list, region/target 사용 시): `{fields, upstream_returned, after_filter, note}`
- `disambiguation`(list, `--disambiguate`): `{duplicate_groups: [{normalised_name, count, candidates: [{서비스ID, 서비스명, 소관기관명, 서비스분야, 상세조회URL}]}], duplicate_rows, note}`
- `conditions`의 각 data 행: 원문 코드 필드 + `labels`(코드→한글 라벨) + 요청 시 `match`(`age`/`gender`/`income`/`matched`). 성별·소득은 해당 코드가 upstream에 아예 없으면 제한 없음으로 보아 `true`가 된다.

## Workflow

### 1. Pick the operation

- 조건에 맞는 서비스 찾기 → `list` (키워드·분야·기관 필터 + `--region`/`--target`)
- 후보가 정해진 뒤 신청 방법·URL 확인 → `detail --service-id`
- 나이·소득 등 자격조건 대조 → `conditions --service-id`

### 2. Fetch a small bounded slice first

`--per-page 10` 정도로 첫 페이지를 받아 필드와 결과 밀도를 확인한 뒤 페이지를 넘기거나 필터를 좁힌다.

```bash
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list \
  --keyword "월세" --field "주거" --per-page 5 --text
```

### 3. Narrow client-side, then disambiguate

지역·대상은 upstream 필터가 없으므로 `--region`/`--target`으로 좁히고, 같은 이름의 서비스가 여러 기관에 있으면 `--disambiguate`로 후보를 나눠 `서비스ID`를 확정한다. `client_filter.after_filter`가 0이면 `upstream_returned`가 0인지 확인하고, upstream 결과가 있는데 0이면 토큰을 완화한다.

### 4. Confirm the official application path

`detail`로 `신청방법`·`온라인신청사이트URL`·`구비서류`·`문의처`를 확인하고, `conditions`로 지원조건 코드를 대조한다. 답변에는 `서비스ID`, `소관기관명`, `상세조회URL`(또는 `온라인신청사이트URL`), 조회 시각을 함께 적는다.

### 5. Verify before answering

- `상세조회URL`·`온라인신청사이트URL`은 upstream이 주는 값이므로 그대로 안내하고, 실제 신청 조건·마감은 그 페이지에서 최종 확인한다.
- 응답의 `신청기한`이 "상시"·"예산 소진 시" 같은 텍스트일 수 있음을 그대로 전달한다.

## CLI examples

```bash
# 청년 월세 관련 주거 서비스
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list \
  --keyword "월세" --field "주거" --per-page 5 --text

# 서울 거주 청년 대상 후보
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list \
  --target "청년" --region "서울" --per-page 10 --json

# 같은 이름 후보 분리
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list \
  --keyword "청년월세" --disambiguate --json

# 상세(신청 방법·온라인 신청 URL)
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- detail \
  --service-id "<list 응답의 서비스ID>" --text

# 지원조건 대조(만 30세 여성, 중위소득 51~75%)
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- conditions \
  --service-id "<서비스ID>" --age 30 --gender 여 --income "중위소득 51~75%" --json

# 키 없이 요청 점검
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list \
  --keyword "청년" --dry-run

# 프록시 경유(route 배포 후)
npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list \
  --keyword "청년" --via-proxy --per-page 5 --text
```

## Failure modes

- `exit 2` 입력 오류: 페이지/perPage 범위 초과, 날짜 형식 오류(불가능한 달력 날짜 포함), `updated_since > updated_until`, `detail`/`conditions`에서 `--service-id` 누락.
- `exit 3` 인증키 없음: `KSKILL_GOV24_API_KEY`가 환경변수·vault·`~/.config/k-skill/secrets.env` 어디에도 없음. 발급 절차를 안내하고 `--dry-run`으로 요청 점검.
- `exit 4` 네트워크 오류: DNS/연결 실패·타임아웃. `--via-proxy`면 프록시 다운 메시지가 함께 나온다.
- `401/403` 또는 envelope `code`가 `-401`/`20`/`30`/`31`: 키 미등록·만료·활용신청 미승인, Encoding 키 사용 등. data.go.kr `15113968` 활용신청 상태와 Decoding 키를 확인한다.
- `429` 또는 코드 `22`/`23`: 일일 한도(개발계정 10,000건) 또는 초당 한도 초과. 잠시 후 재시도하거나 트래픽 증설을 신청한다.
- `5xx`: upstream 장애/점검. 같은 요청을 반복하지 말고 잠시 후 재시도하며, 결과가 없으면 "조회 실패"로 보고한다.
- 비-JSON 응답(HTML 등) 또는 JSON이지만 문서화된 봉투(`data` 배열)가 아닌 응답(예: `[]`): upstream 차단·점검·계약 위반. 본문 앞부분만 요약해 `exit 5`로 실패 보고한다(성공한 빈 결과로 처리하지 않음).
- 빈 `data` 배열: 조건에 맞는 서비스 없음. 키워드/기관/분야를 넓히거나 `--page`를 늘린다. 지역·대상 client filter로 0건이 됐다면 `client_filter.upstream_returned`를 확인한다.
- `--via-proxy`에서 `404`: 프록시 route 미배포. `503 upstream_not_configured`: 프록시에 upstream 키 없음. 둘 다 BYOK 직접 호출로 전환한다.
- `conditions` 코드 해석: `JA0110`(연령 시작)·`JA0111`(연령 종료)이 `0`/빈 값이면 그 방향 제한 없음으로 본다. `--gender`도 `JA0101`(남)·`JA0102`(여) 코드가 둘 다 빈 값이면 성별 제한 없음(요청한 성별과 무관하게 `match.gender=true`)으로 본다. 이 해석은 upstream 문서에 명시돼 있지 않으므로 원문 숫자를 함께 표기하고, 최종 자격은 `상세조회URL`에서 확인한다.
- 지역·대상 client filter는 본문 문자열 매칭이라, 본문에 지역명이 없는 전국 서비스는 `--region`에서 빠질 수 있다. 0건이라고 서비스가 없다는 뜻이 아니다.

## Done when

- 사용자 조건에 맞는 후보를 `list`로 받아 `서비스ID`를 확정했다.
- 최종 후보의 `detail`(신청방법·온라인 신청 URL·구비서류)과 필요 시 `conditions`(연령·성별·소득)를 확인했다.
- 답변에 서비스명, 소관기관, 신청기한/방법, 공식 URL, 조회 시각을 명시했다.
- 실제 신청은 공식 사이트에서 사용자가 진행하도록 안내했다. 이 스킬은 대신 신청하지 않는다.

## Safety notes

- 조회 전용. 신청·증명서 발급·결제·제출 자동화는 하지 않는다.
- 키는 헤더로만 전달하고 URL·로그·표준출력에 남기지 않는다. `--dry-run`에서도 `<REDACTED>`로 대체한다.
- 정부24/공공데이터포털 화면의 CAPTCHA·본인인증·전자서명은 우회하지 않는다. 필요한 경우 사용자에게 공식 화면 진행을 안내한다.
- `전화문의` 등 공개 안내 정보만 인용하고, 사용자 개인정보·신청 이력을 수집하지 않는다.

## Maintainer review notes

키 없이 다음 검증이 가능하다.

- `./scripts/validate-skills.sh`
- `python3 -m py_compile gov-service-search/scripts/gov_service_search.py gov-service-search/tests/test_gov_service_search.py`
- `python3 -m pytest gov-service-search/tests -q`
- `npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- --help`
- `npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- list --keyword 청년 --dry-run`
- `PYTHONPATH=gov-service-search/scripts python3 -m unittest discover -s gov-service-search/tests -p 'test_*.py' -v`

테스트는 네트워크를 쓰지 않는다. `tests/fixtures/`의 합성 응답으로 파싱·정규화·클라이언트 필터·중복 후보·실패 모드를 검증한다. 라이브 스모크는 `15113968` 활용신청 승인 키 또는 `/v1/gov24/*` proxy route 배포 후에 수행한다.