# bok-ecos-stats — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 한국은행 ECOS 경제통계 조회

## What this skill does

한국은행 경제통계시스템(ECOS) Open API `https://ecos.bok.or.kr/api/` 로 중앙은행 경제통계를 조회한다.

- `search` — 통계코드(또는 alias) 기반 시계열 데이터 조회
- `tables` — 통계표 카탈로그 목록
- `items` — 특정 통계표의 항목(item) 목록
- `key` — 100대 핵심지표 (환율/금리/물가/국민소득 등 최신값)
- `word` — 통계 용어 사전 검색

**조회 전용**이다. 투자 판단·전망 단정은 범위 밖이다.

## When to use

- "지금 한국은행 기준금리 몇 %야?"
- "최근 원달러 환율 추이 보여줘"
- "소비자물가지수 월별로 뽑아줘"
- "M2 통화량 통계 찾아줘"
- "ECOS에서 국고채 3년 금리 조회해줘"

## When not to use

- 주식/증권 시세 → `korean-stock-search`, `toss-securities`
- KOSIS 일반 통계(인구/가구/고용 등) → `kosis-stats`
- 환전 수수료·실시간 매매 환율 비교 (ECOS는 공식 통계 기준)

## Prerequisites

- Python 3.9+ (stdlib only, 외부 패키지 없음)
- 사용자 API 키 **불필요** — ECOS 공개 데모 키(`sample`)로 무가입 동작 확인 (2026-07-21). 단 **호출당 최대 10행** 제한이 있다. 공개 엔드포인트이므로 k-skill-proxy를 경유하지 않고 직접 호출한다.

선택 환경변수 (더 많은 행이 필요할 때):

- `KSKILL_BOK_ECOS_API_KEY` — https://ecos.bok.or.kr/api 회원가입 후 무료 발급. `~/.config/k-skill/secrets.env` 의 같은 키도 읽는다.

## Workflow

### 1. 자주 쓰는 지표는 alias로 바로 조회

```bash
python3 bok-ecos-stats/scripts/bok_ecos.py search --alias 기준금리 --start 20260101 --end 20260721 --text
python3 bok-ecos-stats/scripts/bok_ecos.py search --alias 원달러환율 --start 20260701 --end 20260721 --text
python3 bok-ecos-stats/scripts/bok_ecos.py search --alias 소비자물가지수 --start 202501 --end 202606 --text
```

지원 alias: `기준금리`, `원달러환율`, `소비자물가지수`(=`cpi`), `M2`(=`통화량`), `국고채3년`.

`--start`/`--end`는 주기 형식을 따른다: 일(D) `YYYYMMDD`, 월(M) `YYYYMM`, 분기(Q) `YYYYQn`, 연(A) `YYYY`.

### 2. 최신 핵심지표 한 번에 보기

```bash
python3 bok-ecos-stats/scripts/bok_ecos.py key --limit 10 --text
```

### 3. 임의 통계표 탐색 → 항목 확인 → 시계열 조회

```bash
python3 bok-ecos-stats/scripts/bok_ecos.py tables --text
python3 bok-ecos-stats/scripts/bok_ecos.py items --stat-code 722Y001 --text
python3 bok-ecos-stats/scripts/bok_ecos.py search --stat-code 722Y001 --cycle D \
  --start 20260101 --end 20260721 --item-code 0101000 --text
```

### 4. 용어가 낯설면 사전 검색

```bash
python3 bok-ecos-stats/scripts/bok_ecos.py word --query 소비자물가지수 --text
```

`--text` 없이 실행하면 구조화 JSON(`result`, `rows`, `source`)을 출력한다.

## Data source

- `https://ecos.bok.or.kr/api/<Service>/<key>/json/kr/<start>/<end>/<segments...>` — 쿼리스트링 없는 positional URL. 한글 검색어는 helper가 percent-encoding 처리한다.
- 데모 키 `sample`: 무가입, 호출당 최대 10행 (초과 시 `ERROR-301`).
- 잘못된 키: HTTP 200 + `{"RESULT":{"CODE":"INFO-100"}}`.
- 빈 결과: `{"RESULT":{"CODE":"INFO-200","MESSAGE":"해당하는 데이터가 없습니다."}}` → `result: "empty"`.

## Failure modes

| 상황 | 동작 |
| --- | --- |
| 빈 결과 (`INFO-200`) | `result: "empty"` — 기간/코드 확인 안내 |
| 인증키 오류 (`INFO-100`) | 개인 키 발급/확인 안내 |
| sample 10행 초과 (`ERROR-301`) | 개인 키 발급 안내 (helper는 sample 사용 시 limit을 10으로 자동 캡) |
| 알 수 없는 alias, stat-code 없는 search | upstream 미호출, 사용법 오류 출력 |
| HTTP 오류/타임아웃/JSON 파싱 실패 | 차단·점검 가능성 안내 후 종료 코드 1 |

## Notes

- 시계열 값은 공식 통계 원천 그대로 전달하고, 해석·전망은 덧붙이지 않는다.
- 통계 기준 시점(`time`)을 반드시 함께 표시한다.
