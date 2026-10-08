# korean-bond-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec korean-bond-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path korean-bond-search <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read korean-bond-search references/<file>`.

# 한국 채권 종목 조회·비교

## What this skill does

SEIBro에서 확인한 한국 채권을 종목명·발행사·ISIN으로 좁혀 발행조건과 옵션을 같은 형식으로 비교·상세 조회하는 한국어 대화형 스킬이다. GS Quant의 Instrument/Data 구조화 방식에서 영감을 받아 표준 Bond Instrument 필드를 설계했으며, 코드를 복제하거나 공식 제휴·연계를 주장하지 않는다. 조회 전용이고 실시간 호가·수익률·적정 스프레드·신용판단·매매 추천은 제공하지 않는다.

## Interview first

사용자 문장에서 이미 주어진 조건은 다시 묻지 않는다. 다음 중 하나도 없을 때만 종목명/발행사/ISIN을 짧게 묻는다.

- 종목명 또는 발행사
- ISIN
- 만기 범위와 채권 유형 같은 식별 조건

후보가 둘 이상이면 임의로 하나를 선택하지 않는다. 최대 5개를 `종목명 · ISIN · 발행사 · 만기 · 표면금리`로 제시하고, 사용자가 만기·회차·ISIN으로 고르게 한다. 정확한 ISIN이 있으면 바로 상세 조회한다.

## Workflow

### 1. 한 번의 공식 조회 경로 선택

SEIBro 채권정보를 1차 원천으로 삼되, 매 조회마다 **검색·브라우저 UI·helper를 중복 실행하지 말고 필요한 경로 하나만** 고른다.

- 정확한 ISIN이 있으면 SEIBro 모바일 상세 페이지를 직접 연다: `https://m.seibro.or.kr/cnts/bond/selectDetailSearch.do?txt_code=<ISIN>`.
- 종목명/발행사만 있으면 사용 가능한 읽기 전용 웹 검색으로 공식 SEIBro 페이지를 한 번 찾는다. 검색 결과는 후보 발견에만 쓰고, 답변에 넣을 값은 열린 공식 상세 페이지에서 확인한다. 페이지에서 결과 범위를 확인할 수 없다면 “확인된 후보”라고 표현하고 전체 목록처럼 단정하지 않는다.
- 검색 기능이 없거나 공식 상세 페이지로 연결되지 않을 때만 SEIBro 모바일 검색 화면을 사용한다. PC WebSquare 메인 진입점은 기본 경로로 쓰지 않는다.
- 현재 열려 있고 요청 종목과 일치하는 공식 SEIBro 페이지가 있으면 그 페이지를 재사용한다. 별도 컴퓨터 유즈는 사이트 검색 등 UI 조작이 꼭 필요한 경우에만 보조 경로로 쓴다.
- 공식 페이지의 도메인·종목코드(ISIN)·종목명을 맞춰 보고 필요한 항목만 기록한다. 검색 스니펫만으로 쿠폰·만기·잔액·옵션을 확정하지 않는다. 검색 결과가 다른 ISIN을 가리키거나 상세 화면에 해당 항목이 없으면 다시 추정하지 않고 `미확인`으로 둔다.
- 첫 경로에서 오류가 나면 무작정 탭을 재탐색하거나 같은 조회를 반복하지 않는다. 가능한 대체 경로를 한 번만 시도하고, 그래도 공식 값을 확인할 수 없으면 SEIBro 내보내기 파일을 요청한다. 기존 브라우저 탭을 쓸 때는 현재 유효한 페이지 핸들을 유지하고, 만료된 탭 ID를 반복해서 찾지 않는다.
- CAPTCHA·로그인벽·차단을 우회하거나 대량 수집하지 않는다. 테스트 픽스처·예시 데이터·사용자가 준 임의 JSON은 동작 검증에만 쓰고 실제 채권 결과로 제시하지 않는다.

화면에서 직접 확인한 공식 상세 페이지로 충분한 답을 만들 수 있으면 helper 실행이나 수기 export 파일을 만들지 않는다. helper는 사용자가 제공했거나 SEIBro에서 실제 내려받은 JSON/CSV/TSV/HTML을 정규화·비교할 때 사용한다. `--input`을 생략하면 `KSKILL_SEIBRO_EXPORT`를 사용한다.

```bash
npx -y @nomadamas/k-skill@0 exec korean-bond-search scripts/bond_search.py -- \
  search --input /path/to/seibro-export.csv --issuer "현대자동차" \
  --observed-at 2026-09-24T09:00:00+09:00 --verified-source
```

```bash
npx -y @nomadamas/k-skill@0 exec korean-bond-search scripts/bond_search.py -- \
  search --input /path/to/seibro-export.json --name "현대차" \
  --maturity-from 2028-01-01 --maturity-to 2030-12-31 --observed-at 2026-09-24T09:00:00+09:00 --verified-source
```

```bash
npx -y @nomadamas/k-skill@0 exec korean-bond-search scripts/bond_search.py -- \
  detail --input /path/to/seibro-export.html --isin "$BOND_ISIN" --observed-at 2026-09-24T09:00:00+09:00 --verified-source
```

```bash
npx -y @nomadamas/k-skill@0 exec korean-bond-search scripts/bond_search.py -- \
  options --input /path/to/seibro-export.json --isin "$BOND_ISIN" --observed-at 2026-09-24T09:00:00+09:00 --verified-source
```

지원 입력은 UTF-8/CP949/EUC-KR JSON·CSV·TSV와 표 형태 HTML이다. JSON은 배열 또는 `items` 배열을 받는다. 원천 헤더 대응표가 필요하면 다음을 읽는다.

상세/옵션 명령의 `"$BOND_ISIN"`은 실제로 확인한 12자리 ISIN으로 바꾼다. helper는 형식뿐 아니라 ISIN 체크디지트도 검사한다.

재현 가능한 결과에는 실제 원천을 확인한 시각을 `--observed-at` ISO 8601 값으로 지정하고 `--verified-source`를 함께 준다. 두 조건은 해당 파일의 종목·조건을 SEIBro에서 실제로 대조했을 때만 사용한다. 확인하지 않은 파일에는 이 플래그를 붙이지 않는다. 시각을 전달했어도 `--verified-source`가 없으면 helper는 원천 확인시각이라고 단정하지 않는다. 생략하면 입력 파일 수정시각을 대신 기록하지만, 이를 원천 확인시각으로 표현하지 않는다. 검색 결과는 고정된 compact schema만 반환하고, 원본 필드는 `detail`에서만 펼친다.

원천 확인 플래그가 없으면 helper가 SEIBro 링크나 조회 사실을 자동으로 주장하지 않는다. 대화 최종 답변에는 이번에 실제로 확인한 공식 원천 링크를 붙인다. `input_file` 메타데이터에는 파일명만 포함하고 로컬 디렉터리 경로는 노출하지 않는다.

```bash
npx -y @nomadamas/k-skill@0 read korean-bond-search references/fields.md
```

### 2. 보강과 검증

- CB/EB/BW는 종목명에 붙은 명시적 표기, SEIBro의 `주식관련`·권리행사 정보, 조기상환 옵션을 각각 확인한다. `채권분류=일반회사채`, `옵션해당없음`, 빈 `주식관련` 칸만으로 CB/EB/BW가 없다고 판단하지 않는다.
- CB/EB/BW가 중요하지만 SEIBro 상세에서 구분되지 않을 때만 정확한 종목명/ISIN으로 DART를 한 번 찾아 발행결정 원문을 확인한다. 원문에서 종류가 확인되지 않으면 `미확인`으로 남긴다. PUT 등 옵션의 존재만으로 CB/EB/BW를 추정하지 않는다.
- 상장 여부가 필요하고 SEIBro 필드가 비어 있을 때만 KRX를 보조로 확인한다.
- 보조 원천은 누락값을 추정하는 데 쓰지 않고, 해당 원천이 직접 확인한 필드만 채운다.
- 날짜·금리·금액 원문과 정규화값이 충돌하면 원문을 보존하고 해당 필드를 `null`로 둔다.
- `issue_amount_krw`·`outstanding_amount_krw`는 통화가 명시적으로 KRW일 때만 채운다. 외화 또는 통화 미확인 금액은 원화로 표시하지 않고 원문에서만 확인한다.
- 같은 ISIN의 정규화 레코드가 서로 다른 조건을 가지면 하나를 고르지 않고 충돌로 알린다. 원천 화면/내보내기를 다시 대조한다.

### 3. 답변

helper의 기본 출력은 사용자용 `chat`이다. JSON은 계산 검증이나 후처리가 필요할 때만 `--format json`으로 요청한다. **JSON 객체, `schema_version`, `null`, 내부 failure 배열을 최종 답변에 그대로 붙이지 않는다.**

기본 검색 결과는 최대 5개이며 아래처럼 짧은 설명과 표로 보여준다.

```text
종목명 | ISIN | 발행사 | 유형 | 표면금리 | 만기 | 발행잔액 | CALL/PUT | CB/EB/BW
```

표 뒤에는 후보 선택 방법을 한 문장으로 안내한다. 상세 요청일 때 발행조건과 옵션 일정을 펼친다. 금액은 조·억·만 단위로 나누어 반올림 없이 표시한다. 확인되지 않은 값은 `null`이 아니라 `미확인`으로 쓴다. 실제로 검증한 경우에만 클릭 가능한 공식 원천과 원천 확인시각을 붙인다. 열린 공식 화면에서 직접 확인한 답변은 확인한 시각을 기록한다. 입력 파일만으로 답한 경우에는 그 사실과 시각 기준을 분명히 쓰고 SEIBro 화면을 확인했다고 주장하지 않는다. 파일 수정시각을 대신 쓴 경우 실제 조회시각과 혼동하지 않도록 표시한다. 도구·helper 실행 여부 같은 내부 절차를 사용자 답변에 불필요하게 늘어놓지 않는다.

## Internal data contract

- 내부값이 없으면 추정하지 않고 `null`; 사용자 답변에서는 `미확인`
- `--format json` 출력 최상단에 `schema_version: "1.0"`
- 금리는 퍼센트 숫자, 금액은 원, 날짜는 `YYYY-MM-DD`
- `callable`, `putable`, `convertible`, `exchangeable`, `warrant_attached`는 확인된 경우에만 불리언
- 검색 결과 없음은 `empty`; 원천 장애는 `source_failure`; 파싱 실패는 `parse_failure`; 같은 ISIN 조건 충돌은 `ambiguous`
- 결과가 없다고 채권이 존재하지 않는다고 단정하지 않는다.

사용자용 결과는 제목 → 한 줄 요약 → 후보 표 또는 상세 조건 → 다음 선택 안내 → 출처·확인시각 순서를 유지한다.

## Failure modes

| 상황 | 동작 |
| --- | --- |
| 입력 파일 없음 | `source_failure`와 SEIBro 진입점 반환 |
| 빈/비정상 HTML | `parse_failure`; 브라우저에서 실제 표가 보이는지 확인 |
| 후보 없음 | `empty`; “제공된 조회 원천에서 확인되지 않음”이라고 표현 |
| 동일 종목명 충돌 | ISIN을 확인한 뒤 상세 조회 |
| 동일 ISIN의 발행조건 충돌 | 임의 선택 금지; 충돌 레코드를 요약하고 최신 원천에서 재확인 |
| CSV/HTML 헤더 중복 또는 행 길이 불일치 | 레코드를 버리거나 이어 붙이지 말고 `parse_failure` |
| 필드 누락·모순 | `null` 유지, 추정 금지 |
| 한 보조 원천 장애 | 해당 보강만 생략하고 SEIBro 결과 유지 |

CALL은 발행사 또는 제3자의 매도청구권, PUT은 사채권자의 조기상환청구권으로 구분한다. `상환청구권`만 있고 권리 주체나 조기상환 문맥이 확인되지 않으면 어느 쪽에도 분류하지 않는다. 옵션 없음이 명시되어도 CB/EB/BW 여부가 따로 확인되지 않았다면 주식연계 구조까지 없다고 확대 해석하지 않는다.

## Done when

- 모호한 요청은 최대 5개 후보로 좁혔다.
- 선택된 채권을 canonical schema로 정리했다.
- 옵션과 CB/EB/BW를 확인된 범위에서만 표시했다.
- 후보 검색이 전체 목록임을 입증하지 못하면 일부 확인 결과라고 밝혔다.
- 같은 사실을 확인하기 위한 불필요한 검색·UI·helper 중복 실행을 피했다.
- 원천명·조회시각·누락 또는 실패를 함께 밝혔다.
