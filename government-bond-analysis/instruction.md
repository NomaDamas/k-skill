# 한·미 국채시장 분석

한국 국고채(KTB)와 미국 국채(UST)의 금리 변화와 공식 주요 일정을 함께 분석한다.

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --base 2026-09-18 --as-of 2026-09-22
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --base 2026-09-18 --as-of 2026-09-22 --json
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --base 2026-09-18 --as-of 2026-09-22 --out ./ktb-ust-report
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --replay ./ktb-ust-report/evidence.mjson --out ./ktb-ust-replay
```

`--market both`의 기본 출력은 대화에 바로 붙일 수 있는 고정 Markdown이다. 순서는 **상태·관측일 → 핵심 변화 → 여섯 만기 표 → 커브·한미 차이 → 주요 일정 → 확인 사항·출처**다. 기계 처리에는 `--json`, 파일 보고서를 요청한 경우에만 `--out`을 사용한다. 에이전트는 검증된 수치를 재계산하거나 빠진 값을 추정하지 않고, `INCOMPLETE`/`BLOCKED`도 그대로 전달한다.

KTB는 한국은행 ECOS 국고채 일별 시장금리, UST는 미국 재무부의 일별 명목 par/constant-maturity 수익률이다. 각각 여섯 만기(2·3·5·10·20·30년)를 검증하고 시장별 관측일을 별도로 표시한다. 한·미 10년 금리차는 두 원천에 **동일한 관측일**이 있을 때만 계산한다. 같은 날짜라도 양국 종가 시점은 다르므로 이 차이를 동시 가격·환헤지 비용·상대가치로 해석하지 않는다. 두 공식 데이터 원천 모두 이 모드에서 별도 API 키를 요구하지 않는다. 원천 중 하나가 실패하면 확보된 시장의 수치는 보존하되 결과를 `INCOMPLETE`로 표시한다.

### 한·미 주요 일정

`--market both`는 `주요 일정` 섹션을 항상 출력한다. 최신 일정을 요청받았거나 이번 분석에 일정을 포함할 때는 먼저 **공식 페이지를 실제로 확인**하고 `schedule-evidence.json`을 만들어 `--schedule-evidence FILE`을 붙인다. 대상은 한국 국고채 입찰·한국은행 통화정책방향 결정회의, 미국 국채 입찰·FOMC 회의다. 일반적인 반복 패턴으로 날짜를 추정하거나 이미 지난 일정을 예정 일정으로 표시하지 않는다.

공식 확인처: [한국 국채시장 월별 발행 캘린더](https://ktb.moef.go.kr/mnbyIsuCldr.do), [한국은행 통화정책방향 결정회의](https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?menuNo=200755&mtgSe=A), [미 재무부 입찰 일정](https://www.treasurydirect.gov/auctions/announcements-data-results/), [연준 FOMC 일정](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm). 국고채 월별 계획이 아직 발표되지 않았다면 KR 입찰 날짜를 만들지 않는다. 미 재무부 잠정 일정은 `잠정`임을 답변에서 밝힌다. 미국 입찰표는 **Announcement Date / Auction Date / Settlement Date 중 Auction Date**를 사용한다. FOMC 이틀짜리 회의는 **결정일인 마지막 날**을 사용한다.

증거 파일은 `version: 1`, 보고서 `as-of`와 같은 `anchorDate`, UTC ISO `checkedAt`, `events` 배열을 가진 JSON이다. 각 이벤트에는 `date`(YYYY-MM-DD), `market`(`KR`/`US`), `kind`(`auction`/`policy`), 공식 `sourceUrl`, 원문에서 가져온 짧은 `sourceExcerpt`, 원문 안의 날짜 표현인 `sourceDateText`가 필요하다. 입찰에는 `tenor`(년)를 추가한다. 예를 들어 원문 `2026.09.21. | 5년물`을 확인했다면 `date: "2026-09-21"`, `sourceDateText: "2026.09.21."`, `tenor: 5`로 적는다. 모든 이벤트는 기준일 이후 45일 안이어야 하며 대화·보고서는 날짜순으로 최대 4건씩 보여준다. 링크·날짜 표현·만기·중복을 검증한 뒤 evidence와 함께 저장하므로 같은 evidence를 재생하면 일정도 그대로 나온다.

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --base 2026-09-18 --as-of 2026-09-22 --schedule-evidence ./schedule-evidence.json
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --base 2026-09-18 --as-of 2026-09-22 --schedule-evidence ./schedule-evidence.json --out ./ktb-ust-report
```

공식 일정 페이지를 확인하지 못했으면 `공식 일정 미확인`으로 남긴다. 일정 검증 상태(`VERIFIED`/`PARTIAL`/`UNVERIFIED`)는 금리 데이터 상태와 별도이며, 일정이 부족하다고 금리 수치를 바꾸지 않는다. 예정 일정은 추후 바뀔 수 있으므로 확인 시각과 원문 링크를 함께 보여준다.

## What this skill does

한국은행 ECOS와 미국 재무부의 국채 2·3·5·10·20·30년 금리를 각각 검증해 한·미 커브 변화와 공통 관측일의 10년 금리차를 분석한다. 공식 입찰·통화정책 일정도 별도 증거로 확인해 같은 답변 형식에 담는다. 국내 단독 모드에서는 ECOS 국고채를 공통 관측일로 정렬해 전일·1주·전월말 변화, 최근 5·20거래일 추이, 분기말·연초 대비, 구간별 스프레드와 기준금리 대비 3년물 갭을 계산한다. 사용자가 시장 배경까지 요청하면 같은 관측일의 공개 기사·공식 발표를 별도 evidence로 검증해 출처가 붙은 코멘트를 보고서에 추가한다.

범용 통계 조회는 `bok-ecos-stats`의 역할이다. 이 스킬은 국고채 커브 모니터링에 필요한 날짜 선택·단위 검증·bp 계산·기계적 분류를 수행한다. 공식 일별 통계 기반 조회·계산 전용이며 실시간 호가, 원인 추정, 전망, 매매 추천은 제공하지 않는다.

## When to use

- “오늘 국고채 커브 보여줘.”
- “한·미 국채 금리 변화와 앞으로의 주요 일정 정리해줘.”
- “전일·1주·전월 말 대비를 한 번에 정리해줘.”
- “최근 5일/20일 동안 어느 만기가 가장 많이 움직였어?”
- “분기말 또는 연초 대비 커브 변화 보여줘.”
- “국고채 3년이 기준금리보다 몇 bp 높아?”
- “금통위 전후 커브를 검산해줘.”
- “오늘 금리 움직임의 뉴스 배경과 출처까지 붙여 레포트로 줘.”

## When not to use

- 임의 ECOS 통계 검색 → `bok-ecos-stats`
- 채권 종목·발행정보·상환 일정 검색
- 실시간 호가·개별 지표채·민평가격
- 채권 가격·듀레이션·DV01 계산
- 금리 전망·매매 신호·투자 권유

## Prerequisites

- Node.js 18 이상, 런타임 외부 패키지 없음
- ECOS 공개 데모 키 `sample`로 무가입 동작한다. 조회창을 10일 이하로 분할해 호출당 10행 제한을 지킨다.
- 선택 환경변수 `KSKILL_BOK_ECOS_API_KEY`: ECOS에서 무료 발급한 개인 키
- 사용자 CSV 모드는 재현 가능한 기준을 위해 `--base`와 `--as-of`를 모두 명시한다.
- 뉴스 코멘트에는 공개 웹 검색·브라우저 접근이 필요하다. helper는 기사를 자동 크롤링하지 않으며 검증된 짧은 evidence만 입력받는다.

## Workflow

### 1. 기본 D/W/M 대시보드

“오늘 커브 정리”, “데일리 커브” 요청의 기본 모드다.

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset dashboard --text
```

현재 6개 만기의 레벨과 전일·1주·전월말 변화, 5Y−3Y·10Y−5Y·10Y−3Y·30Y−10Y 스프레드, 한국은행 기준금리와 3Y−기준금리 갭을 함께 표시한다. “오늘”은 KST 오늘 이전에 ECOS에서 확보되는 최신 공통 관측일이다.

### 2. 현재 스냅샷과 단일 비교 프리셋

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset today
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset previous-session
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset previous-week
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset previous-month-end
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset previous-quarter-end
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset year-start
```

`previous-session`은 달력상 어제가 아니라 최신 공통 관측일의 직전 공통 관측일이다. `year-start` 기준은 직전 연도 마지막 공통 관측일이다.

### 3. 최근 5·20거래일 추이

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --lookback-sessions 5 --text
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --lookback-sessions 20 --text
```

만기별 시작·종료 금리, 순변화, 고점·저점, 최대 일간 변동과 발생일을 표시한다. 공통 관측일이 요청 개수보다 적으면 `INCOMPLETE`이며 확보 건수를 밝힌다.

### 4. 월 범위와 정확한 두 날짜

월만 주어지면 월말 대 월말 스냅샷으로 비교한다. 종료 월이 현재 진행 중인 달이면 미래 월말을 요구하지 않고 KST 오늘 기준 최신 공통 관측일을 사용하며, 답변에 실제 관측일을 밝힌다.

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --from-month 2026-07 --to-month 2026-08
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --base 2026-09-11 --as-of 2026-09-18
```

### 5. 기준금리 갭

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset policy-gap
```

ECOS `722Y001/0101000` 한국은행 기준금리를 별도로 검증하고 같은 최신 시점의 국고채 3년과 차이를 bp로 계산한다. 기준금리 조회만 실패하면 커브 결과는 유지하고 갭만 제외한다.

### 6. 이벤트 전후

사용자가 지정한 금통위·물가 발표 등 이벤트 날짜의 직전 공통 관측일과 당일 또는 이후 최초 공통 관측일을 비교한다.

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --event-date 2026-08-27
```

“최근 금통위”는 한국은행 공식 일정에서 회의일을 확인하고 링크를 제시한 뒤 실행한다. 일정은 코드에 하드코딩하지 않는다.

### 7. 출처 있는 시장 배경 코멘트

사용자가 원인·배경·헤드라인 코멘트를 요청한 경우에만 실행한다. 먼저 커브를 계산해 실제 현재·직전 관측일을 확인한 뒤, 현재 관측일과 KST 날짜가 같은 공개 자료를 찾는다.

출처 우선순위는 연합인포맥스 `[채권-마감]`, 한국은행·기획재정부·Fed 등 공식 발표, 연합인포맥스 장중 기사, Investing.com 공개 헤드라인 순이다. Investing.com이나 연합인포맥스를 상시 크롤링하거나 기사 본문을 저장하지 않는다. 제목·링크·게시시각과 280자 이하의 짧은 의역만 evidence에 남긴다.

```bash
# 실제 관측일 확인
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --preset dashboard

# 관측일에 맞는 입력 틀 생성
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --news-template 2026-09-21 > news-evidence.json

# 기사 확인 후 evidence를 채워 보고서 생성
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --base 2026-09-18 --as-of 2026-09-21 \
  --news-evidence news-evidence.json --out ./bond-report
```

기사 항목의 필수 필드는 다음과 같다.

| 필드 | 규칙 |
| --- | --- |
| `publisher`, `title`, `url` | 실제 공개 출처와 HTTPS 원문 링크 |
| `publishedAt` | UTC ISO 시각. KST 날짜가 실제 현재 관측일과 같아야 함 |
| `sourceType` | `market-close`, `market-update`, `official-release`, `headline` |
| `marketDirection` | 3Y·10Y 변화 기준 `higher`, `lower`, `mixed`, `flat`; 공식 발표는 `context` |
| `relation` | 기사가 요인을 직접 연결하면 `explicit`, 단순 동시 이벤트면 `contextual` |
| `factor` | 기사에서 명시한 시장 배경을 140자 이하로 의역 |
| `evidenceSummary` | 근거 내용을 20~280자로 의역. 기사 본문 복제 금지 |

`SOURCED/HIGH`는 같은 날 연합인포맥스 마감 기사가 관측 방향과 일치하고 요인을 직접 설명할 때만 부여한다. 방향이 다른 기사는 evidence에는 보존하되 코멘트에서 제외한다. 공식 발표만 있으면 `CONTEXT_ONLY`, 일치하는 근거가 없으면 `UNATTRIBUTED`다. 뉴스 확보 실패나 불일치는 검증된 커브의 `READY`를 변경하지 않는다.

### 8. 영구 보고서와 사용자 CSV

HTML·CSV·evidence 저장을 명시적으로 요청한 경우에만 정확한 두 날짜 비교에 `--out`을 붙인다.

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --base 2026-09-11 --as-of 2026-09-18 --out ./bond-report
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --input input.csv --base 2026-09-11 --as-of 2026-09-18
```

CSV 헤더는 `date,tenor,yield_pct`이며 여섯 만기와 연% 단위를 사용한다. 사용자 자료는 `USER_CSV`로 표시한다.

## Output contract

- `READY`: 해당 모드에 필요한 모든 공통 관측값과 원천 검증 통과
- `INCOMPLETE`: 일부 기준일·세션만 확보. 확보되지 않은 비교는 해석하지 않음
- `BLOCKED`: 유효한 공통 관측값 없음. 기억값이나 추정값 사용 금지
- 금리 레벨은 연%, 변화와 스프레드는 bp
- 요청일과 실제 관측일을 항상 구분
- Bull/Bear 및 steepening/flattening은 관측 변화의 기계적 이름이며 전망이 아님
- 뉴스 상태는 `SOURCED`, `CONTEXT_ONLY`, `UNATTRIBUTED`로 별도 표시하며 커브 상태와 섞지 않음
- 공식 일정 상태는 `VERIFIED`, `PARTIAL`, `UNVERIFIED`로 별도 표시하며 금리 상태와 섞지 않음
- 뉴스 문장은 항상 매체에 귀속하고 인과관계를 자체 사실로 단정하지 않음

## Verification and data source

- 커브: https://ecos.bok.or.kr/ · `817Y002` · `연%` · `D`
- 2Y `010195000`, 3Y `010200000`, 5Y `010200001`, 10Y `010210000`, 20Y `010220000`, 30Y `010230000`
- 기준금리: `722Y001` · `0101000` · `한국은행 기준금리` · `연%`
- 통계표·통계명·항목코드·항목명·단위·날짜·응답 건수·원문 SHA-256을 검증
- 일시 오류만 최대 3회 재시도하고, 동일 요청의 168시간 이내 이중 해시 검증 캐시만 대체 사용
- 뉴스 evidence는 허용된 HTTPS 호스트, KST 관측일, 게시·수집 시각, 중복 URL, 방향 일치와 source fingerprint를 검증

```bash
npx -y @nomadamas/k-skill@0 read government-bond-analysis references/methodology.md
```

## Done when

- 선택 모드에 필요한 여섯 만기의 공통 관측일이 확인됨
- 실제 관측일, 연%와 bp, 모든 공식 항목코드가 검증됨
- `READY` 결과만 완전한 비교로 설명함
- 한국은행 ECOS 링크와 source receipt가 함께 제공됨
- 뉴스 코멘트 요청 시 채택·맥락·제외 기사의 링크와 fingerprint가 모두 남음
- 파일 요청 시 manifest 및 재생 검증을 통과함

## Failure modes

| 상황 | 동작 |
| --- | --- |
| 휴일·결측 | 7일 안의 가장 최근 여섯 만기 공통 관측일 사용 |
| 한 만기·한 구간 실패 | 다른 구간 유지, 검증된 캐시만 해당 구간에 사용 |
| 실데이터 성공·캐시 저장 실패 | 검증된 실데이터 결과는 유지하고 캐시 저장 경고 표시 |
| 기준금리만 실패 | 커브 유지, 정책금리 갭만 제외하고 경고 |
| 뉴스 검색 실패 | 커브 유지, `UNATTRIBUTED` 또는 뉴스 섹션 생략 |
| 기사 방향 불일치 | evidence에는 보존하고 코멘트에서는 제외 |
| 기사 날짜·URL·fingerprint 불일치 | 뉴스 evidence 거부 |
| 단위·항목·통계표 불일치 | 해당 원자료 거부 |
| 비교일이 같은 관측일로 귀결 | `INCOMPLETE`, 변화 해석 차단 |
| 공통 관측값 없음 | `BLOCKED`, 추정 금지 |
| 파일 미요청 | stdout만 출력하고 보고서 파일을 만들지 않음 |
