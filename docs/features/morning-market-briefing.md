# 모닝 마켓 브리핑

`morning-market-briefing`은 한국장 개장 전 모닝 브리핑을 **기준시점이 확인된 수치만으로** 작성하는 스킬이다. 미국 재무부 공식 금리 CSV와 FRED 공개 시계열 CSV를 stdlib Python helper로 조회하고, 수치마다 출처·기준시점·검증상태를 Data Ledger로 남긴다.

로그인과 API 키가 필요 없다. 두 원천 모두 무인증 공개 read-only endpoint이므로 `k-skill-proxy`를 경유하지 않고 사용자 머신에서 직접 호출한다.

## 기본 경로

- 미국 재무부 일별 par yield curve CSV
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{YYYY}/all?type=daily_treasury_yield_curve&field_tdr_date_value={YYYY}&page&_format=csv`
  - 헤더: `Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"`
  - 값은 퍼센트, 날짜는 `MM/DD/YYYY`, 행은 최신순 (2026-09-16 실측)
  - 응답이 느린 편이다. 실측 19초대가 나온 네트워크도 있어 helper 기본 타임아웃은 30초다.
- FRED CSV
  `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID1>,<ID2>,...`
  - 헤더: `observation_date,<ID1>,<ID2>`, 날짜는 `YYYY-MM-DD`, 결측은 빈 칸 또는 `.`
  - 기간 파라미터(`cosd`/`coed`)를 무시하고 전체 이력을 반환하므로 helper가 클라이언트에서 자른다 (2026-09-16 실측 11,852행).
  - 일부 요청은 `Content-Type: application/zip`으로 오고, ZIP 안에 시리즈별 CSV가 **나뉘어** 들어 있다. helper는 CSV 멤버를 전부 날짜 기준으로 병합한다. 하나만 고르면 나머지 시리즈가 조용히 사라진다 (2026-09-16 실측에서 확인).

## 사용 예시

```bash
# 미국 국채 금리: 2s10s, 일간 bp 변화, curve 판정
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- yields --last 5 --session 2026-09-16 --text

# 지수·변동성·환율·원자재
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- series --ids SP500,DJIA,NASDAQCOM,VIXCLS --last 5 --session 2026-09-16 --text
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- series --ids DEXUSEU,DEXJPUS,DEXKOUS,DEXCHUS --last 5 --session 2026-09-16
npx -y @nomadamas/k-skill@0 exec morning-market-briefing scripts/market_data.py -- series --ids DCOILWTICO,DCOILBRENTEU --last 5 --session 2026-09-16 --text
```

`--text` 없이 실행하면 구조화 JSON(`ok`, `command`, `session`, `source`, `rows`, `series`, `warnings`)을 출력한다.

## 허용 입력

| 입력 | 적용 | 제한 |
| --- | --- | --- |
| `--year` | yields | 조회 연도 (기본: 올해) |
| `--ids` | series | 쉼표로 구분한 FRED 시리즈 ID |
| `--last` | 공통 | 마지막 N개 관측치 |
| `--start` / `--end` | 공통 | `YYYY-MM-DD` (FRED는 클라이언트 절단) |
| `--session` | 공통 | 목표 세션 날짜 `YYYY-MM-DD`. 관측일 지연 판정 기준 |
| `--timeout` | 공통 | HTTP 타임아웃(초), 기본 30 |
| `--text` | 공통 | JSON 대신 사람이 읽는 표 |

## 신선도(freshness) 판정

`--session`을 주면 시리즈별로 `latest_date`, `stale`, `lag_days`를 함께 계산해 돌려준다.

2026-09-16 실측 예시 (목표 세션 2026-09-16):

| 시리즈 | 최신 관측일 | 지연 |
| --- | --- | --- |
| `SP500` | 2026-09-15 | 1일 |
| `VIXCLS` | 2026-09-14 | 2일 |
| `DEXKOUS` | 2026-09-11 | 5일 |
| `DCOILWTICO` | 2026-09-09 | 7일 |

같은 날 요청해도 원천마다 발표 지연이 다르다. `stale: true`인 값을 목표 세션 값처럼 쓰면 며칠 전 숫자가 "전일"로 올라간다. helper는 이 경우 `warnings`에 해당 시리즈를 명시하고, 스킬은 그 값을 다른 원천으로 확인하거나 본문에서 제외한다.

## 실패 처리

- HTTP 오류·타임아웃: `{"ok": false, "error": {"code", "message", "source"}}` + 종료 코드 1. 타임아웃은 `TIMEOUT`으로 구분하고 `--timeout` 안내를 포함한다.
- 재무부 헤더에 필요한 컬럼이 없거나 비어 있으면 `PARSE`, 기간 내 관측치가 없으면 `EMPTY`.
- 요청한 FRED 시리즈가 응답에 없으면 `series`에서 빠지고 `warnings`에 명시된다. 추정값으로 메우지 않는다.
- 결측은 보간하지 않는다. `null`로 남긴다.
- 서브커맨드가 없으면 사용법 오류(종료 코드 2).

## 테스트

```bash
python -m unittest discover -s morning-market-briefing/tests -p "test_*.py"
```

22개 테스트가 네트워크 없이 파싱·병합·curve 판정·bp 산술·신선도·오류 봉투를 검증한다.
