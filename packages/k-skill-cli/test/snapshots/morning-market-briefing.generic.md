# morning-market-briefing — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.
- Use `k-skill-browser-runtime` (provider `auto`) for logged-in or rendered-page automation. On macOS it tries Aside Browser first, then BrowserOS CDP, then user-launched Chrome/Chromium CDP; on other platforms it tries BrowserOS CDP, then Aside Browser, then user-launched Chrome/Chromium CDP. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path morning-market-briefing <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read morning-market-briefing references/<file>`.

# 모닝 마켓 브리핑 (Morning Market Briefing)

## What this skill does

한국장 개장 전에 읽는 모닝 브리핑을, 기준시점이 확인된 수치만으로 작성한다.

- **미국 국채 금리** — 미국 재무부 공식 일별 par yield curve CSV에서 2Y/10Y/30Y, 2s10s, 일간 bp 변화, curve 판정을 계산한다.
- **주가지수·VIX·환율·원자재** — FRED 공개 CSV 시계열에서 지수 종가, VIX, 주요 환율, WTI/Brent를 가져온다.
- **섹션** — `오늘 주요 경제 일정` / `Summary` / `Rates` / `FX` / `Commodity` / `Equity, Vol` / `한국 증시`.
- **산출물** — 브리핑 `briefings/YYYY.MM.DD_Morning_Briefing.md`, Data Ledger `briefings/YYYY.MM.DD_ledger.md`.

**조회·작성 전용**이다. 투자 권유, 매매 판단, 목표가·전망 단정은 범위 밖이다.

## When to use

- "오늘 모닝 브리핑 써줘"
- "미국장 마감하고 한국장 열리기 전 시황 정리해줘"
- "Morning Call / 오버나이트 시황 만들어줘"
- "어제 미 2년·10년 금리랑 2s10s 정리해줘"
- "이 브리핑 숫자 검수해줘" (기존 브리핑이 주어진 경우)

## When not to use

- 국내 개별 종목 시세·기본정보 → `korean-stock-search`
- 한국은행·KOSIS 통계 단독 조회 → `bok-ecos-stats`, `kosis-stats`
- 미국 개별 종목 분석, 포트폴리오 자문, 매수·매도 판단
- 실시간 호가가 필요한 장중 매매 지원

## Prerequisites

- Python 3.9+ (표준 라이브러리만, 외부 패키지 없음)
- 사용자 API 키 **불필요** — 미국 재무부와 FRED 모두 무인증 공개 endpoint이므로 `k-skill-proxy`를 경유하지 않고 사용자 머신에서 직접 호출한다.
- 네트워크 접근 필요.

## Workflow

### Stage 0 — 모드 선택

요청이 신규 작성인지 기존 브리핑 검수인지 먼저 판단한다.

검수 모드(기존 브리핑이나 초안이 주어진 경우)는 Stage 1~3을 반복하지 않는다.

1. 대상 문서의 핵심 숫자를 재검증하고 Data Ledger를 다시 만든다.
2. 아래 "검증 게이트"를 대상 문서에 그대로 적용한다.
3. findings를 목록으로 낸다. 각 항목에 오류 유형(숫자 오류 / 시점 불일치 / 미검증 출처 / 스타일 위반), 위치, 수정 제안을 붙인다.
4. 문서 본문을 고치는 것은 별도 요청이 있을 때만 한다.

신규 작성이면 Stage 1로 간다.

### Stage 1 — 기준일과 세션 매핑

브리핑 기준일 `D`는 서울시간 오늘이고, 제목 날짜도 `D`다.

"전일"은 `D-1`에 해당하는 미국 정규장을 뜻한다.

- 서울 화~금요일 아침: 전일 = 미국 D-1 정규장
- 서울 월요일 아침: 전일 = 미국 금요일 정규장
- 미국이 공휴일로 휴장: 전일 대신 직전 정규장을 쓰고 그 기준일을 문서에 명시

목표 세션 날짜를 먼저 확정하고, 이후 모든 조회에 `--session`으로 넘겨 관측일 불일치를 자동 점검한다.

### Stage 2 — 경제 일정

당일 캘린더를 통째로 옮기지 않는다. 각 이벤트에 두 질문을 적용해 남긴다.

1. 금리·FX·주식·원자재 중 하나 이상을 움직일 가능성이 높은가?
2. 한국시장 또는 주요 한국 업종과 연결되는가?

둘 다 아니면 제외한다. 우선순위는 주요 중앙은행(FOMC/ECB/BOJ/BOK) → 미국 CPI·PCE·고용·성장 → 중국 실물지표 → 주요 국채 입찰 → EIA/API → 시장 영향이 큰 산업 이벤트 순이다.

발표가 끝난 항목은 결과값을, 예정 항목은 예정 시각과 전월치·컨센서스를 쓴다. 모든 시각은 KST로 표기하고 원본 발표 시각을 괄호로 병기한다.

### Stage 3 — 가격 수집

먼저 Rates.

```bash
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- yields --last 5 --session 2026-09-16 --text
```

다음으로 지수·변동성, FX, 원자재를 시리즈 ID로 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- series --ids SP500,DJIA,NASDAQCOM,VIXCLS --last 5 --session 2026-09-16 --text
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- series --ids DEXUSEU,DEXJPUS,DEXKOUS,DEXCHUS --last 5 --session 2026-09-16 --text
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- series --ids DCOILWTICO,DCOILBRENTEU --last 5 --session 2026-09-16 --text
```

`--text` 없이 실행하면 구조화 JSON(`ok`, `source`, `rows`, `series`, `warnings`)이 나온다.

수집 결과 처리 규칙:

- `series[].stale`가 `true`이거나 `lag_days`가 0이 아니면 **그 값은 목표 세션 값이 아니다.** 다른 원천으로 확인하거나 본문에서 뺀다.
- `warnings`에 관측일 지연이 찍히면 반드시 읽는다. 조용히 넘기면 며칠 전 값이 "전일"로 올라간다.
- 결측(`null`)은 보간하지 않는다.
- 값이 확인되지 않으면 추정값을 만들지 않는다. 짧고 정확한 브리핑이 길고 불확실한 브리핑보다 우선한다.
- 파일럿의 FRED CSV는 기간 파라미터를 무시하고 전체 이력을 돌려주므로 helper가 클라이언트에서 자른다. 원자료 행 수를 이유로 다른 기간 값을 섞지 않는다.

### Stage 4 — 본문 작성

작성 순서는 **숫자와 관찰 가능한 사실 → 확인된 driver → (필요할 때만) 한국시장 implication** 이다.

본문에 쓰기 전에 각 수치를 Data Ledger에 적고 검증상태를 판정한다.

- `VERIFIED` — 공식·1차 원천에서 직접 확인했거나, 서로 독립인 원천 2개 이상에서 일치
- `SECONDARY` — 단일 2차 원천만 확보
- `CONFLICT` — 독립 원천 간 불일치
- `UNVERIFIED` — 비공식 원천만 확보했거나 기준시점을 확인할 수 없음

`CONFLICT`·`UNVERIFIED` 핵심 숫자는 본문에 쓰지 않는다. `SECONDARY`는 중요도가 낮고 다른 원천이 없을 때만 제한적으로 쓴다.

세부 작성 규칙, 단위·산술 검증, curve 분류, 금지 항목은 아래 문서를 따른다.

```bash
npx -y @nomadamas/k-skill@0 read morning-market-briefing references/format-rules.md
```

## Output structure

특별한 요청이 없으면 이 구조를 유지한다. 섹션을 임의로 추가하지 않는다.

```
# YYYY.MM.DD Morning Market Briefing

## 오늘 주요 경제 일정
## Summary
## Rates
## FX
## Commodity
## Equity, Vol
## 한국 증시
```

의미 있는 정보가 없는 자산군은 bullet 수를 억지로 늘리지 않는다.

## Data Ledger와 source mapping

Data Ledger는 다음 컬럼을 유지한다.

```
Instrument | Value | Change | Source | Timestamp/Session | Verification Status
```

- 브리핑: `briefings/YYYY.MM.DD_Morning_Briefing.md`
- Data Ledger: `briefings/YYYY.MM.DD_ledger.md`

`YYYY.MM.DD`는 브리핑 기준일 `D`다. 저장 위치는 현재 작업 디렉터리 기준이다.

본문에 쓰지 않은 행도 Ledger에서 지우지 않는다. 재검증과 이후 추적에 쓴다.

사용자가 출처를 요청하면 브리핑을 다시 추정하지 않고 Ledger를 그대로 매핑해 답한다.

```
Statement | Source | Timestamp/Session | Fact/Interpretation | Verification Status
```

## 검증 게이트 (출력 직전)

- **Numerical** — yield와 bp 변화가 일치하는가, 2s10s 계산이 맞는가, spread 일간 변화가 맞는가, `%`와 `%p`를 구분했는가, VIX를 pt로 표기했는가.
- **Temporal** — 기준일 `D`와 "전일" 세션 매핑이 맞는가, 같은 자산군의 기준시점이 하나인가, regular/after-hours/settlement를 섞지 않았는가, 관측일이 목표 세션과 같은가.
- **Source** — "이 숫자는 어디에서, 어느 시점 기준으로 왔는가"에 즉시 답할 수 있는가. 답할 수 없으면 그 숫자를 빼거나 다시 확인한다.
- **Logical** — Fact → Interpretation 연결에 근거가 있는가, 단순 동시 움직임을 인과로 쓰지 않았는가, 시장 pricing을 확정 사실처럼 쓰지 않았는가.
- **Editorial** — Summary와 본문이 중복되지 않는가, 중요하지 않은 일정이나 의미 없는 종목 나열이 없는가, `주목할 필요`·`확인할 필요`·`경계감 확대` 같은 추상문장이 반복되지 않는가.

하나라도 실패하면 수정하고 다시 검수한다.

## Failure modes

| 상황 | 동작 |
| --- | --- |
| helper HTTP 오류·타임아웃 | `{"ok": false, "error": {...}}`와 종료코드 1. 같은 서열의 대체 원천을 시도하고, 전부 실패하면 그 자산군 bullet을 뺀다 |
| `stale: true` / `lag_days > 0` | 그 값은 목표 세션 값이 아니다. 대체 원천 확인 또는 본문 제외 |
| 특정 시리즈 결측 | 보간 금지. `None` 유지, 필요하면 bullet 삭제 |
| JS 챌린지·로그인 벽이 있는 사이트 | 조회 실패로 처리. 공식 정적 endpoint → 브라우저 런타임 → 웹 검색 순으로 대체 |
| 데이터를 하나도 확보하지 못함 | 브리핑을 시작하지 않고 확보 실패를 보고한다. 학습 시점 기억이나 이전 브리핑으로 숫자를 채우지 않는다 |
| 출처 간 숫자 불일치 | 기준시점·세션·단위·가격 관례를 대조한다. 설명되지 않으면 더 직접적인 원천으로 재검증하고, 그래도 안 되면 그 숫자를 삭제한다. 평균내지 않는다 |

## Notes

- 숫자 없이 `달러 강세`, `유가 상승`, `반도체 약세`처럼 방향만 쓰지 않는다.
- curve 방향을 판정할 수 있으면 Bull/Bear를 생략하지 않는다. 방향이 엇갈리면 2s10s 확대/축소 bp로 직접 쓴다.
- Telegram·블로그·증권사 시황은 discovery와 해석 비교에만 쓰고, 최종 숫자 원천으로 쓰지 않는다.
- 한국 증시 섹션은 미국장 내용을 반복하지 않는다. overnight proxy를 먼저 제시하고 그 뒤에 해석을 붙인다.
- 시장 데이터는 공식 원천 값을 그대로 전달한다. 해석은 필요한 만큼만 붙이고 전망은 더 적게 쓴다.
