# 사건별 시장반응 리서치

## What this skill does

한 사건이 **무엇이었고, 무엇이 달라졌으며, 왜 시장이 움직였는지**를 공식 발표·당시 보도·검증된 시장가격으로 재구성하는 한국어 대화형 리서치 스킬이다. 정례 경제지표와 통화정책 결정뿐 아니라 금융사고·신용등급 변경·관세·지정학 충격처럼 형식이 일정하지 않은 사건도 다룬다. 사건과 자산의 관측시각을 맞추고 금리·외환·주식 등 교차자산 전달경로를 증거등급으로 평가한다. GS Quant의 `event_study`·`event_impact_analysis`·`CalendarAlignment` 구조를 참고한 D-1/D0/D+1/D+5 측정은 서술을 검증하는 **보조 증거**이며 분석의 본체가 아니다. 검증 가능한 과거 유사사례와 해석을 바꿀 다음 촉매를 덧붙인다. 실시간 호가·예측·매매 추천은 다루지 않는다.

## Architecture

`Generic Event Engine + Specialized Adapter` 구조다. FOMC·금통위·ECB·물가·고용·실적은 추가 확인 항목을 제공하는 선택적 adapter일 뿐이다. adapter가 없는 SVB 파산, 신용등급 강등, 관세 발표, 군사충돌, OPEC 감산, 공급차질도 Generic Engine으로 분석한다.

```text
Event Resolver
  → verified event name / type / date / time / source
  → transmission-based asset selection
  → calendar alignment and event window
  → cross-asset response and transmission
  → characteristic-based historical analogues
  → next catalysts
  + optional specialized adapter
```

## 1. Event Resolver

사용자의 자유 문장을 whitelist와 대조하지 않는다. 먼저 사건명, 충격 분야(`event_type`), 진행 형태(`event_structure`), 기준일, 지역, 현지시각, 직접 출처를 구조화한다. `event_type`은 `financial_stress` 같은 분야이며 `point_event|scheduled_event|developing_event`와 혼용하지 않는다. 시간 정밀도는 A(정확 시각+시간대), B(날짜만)로 표시하고, C는 정밀도가 아니라 다일 진행 구조(`developing_event`)로 분리한다. 유형 분류와 입력 계약은 다음을 읽는다.

```bash
npx -y @nomadamas/k-skill@0 read market-event-impact references/event-taxonomy.md
```

검증된 사건 파일이 있으면 자유 문장으로 식별할 수 있다.

```bash
npx -y @nomadamas/k-skill@0 exec market-event-impact scripts/market_event.py -- \
  resolve --query "SVB 파산" --events-file /path/to/verified-events.json
```

사건이 파일에 없으면 helper가 유형 후보만 제시하고 `verification_required`로 멈춘다. 날짜나 출처를 추측하지 않는다. browser/web로 규제기관·정부·거래소·기업 IR 등 직접 원천을 확인해 사건 파일에 추가한 뒤 다시 실행한다. 여러 날짜가 후보면 사용자 표현이나 공식 타임라인으로 기준 사건을 좁힌다. 다일 사건은 출처가 연결된 `event_sequence`에 사전 신호·최초 충격·정책 대응·시장 재개를 날짜순으로 기록한다. `developing_event`에는 2~20개 타임라인 단계와 기준 사건 날짜가 필요하다.

## 2. Dynamic Asset Selection

사용자가 자산을 지정하면 그대로 우선한다. 지정하지 않으면 지역 기본 바스켓이 아니라 사건의 예상 전달경로와 시계열의 `roles` 메타데이터로 최대 8개를 선택한다. 후보가 많으면 사건 유형에 적합한 자산군(금리·외환·주식·변동성 등)을 먼저 한 개씩 채운 뒤 세부 역할(단기·장기금리, 성장주·시장지수 등)을 보강한다. 같은 역할에서는 확인 시각까지 사건 전 기준값과 이벤트일 관측값을 모두 확보한 시계열을 우선한다. 프로필에 적합한 자산군이 없어도 무관한 종목을 억지로 채우지 않는다.

- 통화정책: 단기금리·커브·FX·광범위 주식·변동성
- 인플레이션·고용: 단기/장기금리·FX·성장주·광범위 주식·변동성
- 금융스트레스: 단기금리·은행주·신용스프레드·VIX·안전자산
- 무역정책: 단기·장기금리·커브·FX·영향 주식·원유/원자재·변동성
- 지정학·공급충격: 원유·금·FX·금리·주식·변동성
- 기업실적·규제: 해당 증권·업종·시장지수·변동성
- 국가신용: 국채·통화·CDS·금·주식

역할과 시계열 계약은 다음을 읽는다.

```bash
npx -y @nomadamas/k-skill@0 read market-event-impact references/methodology.md
```

관련 자산이 입력 파일에 없으면 다른 자산으로 의미를 바꾸지 말고 미확보로 표시한다.

## 3. Research layer

공식 타임라인과 발표, 당일 시장기사, 확정 시장가격을 교차한다. 가격만 보고 원인을 역으로 만들지 않는다. 재현 가능한 연구 계약은 다음을 읽는다.

```bash
npx -y @nomadamas/k-skill@0 read market-event-impact references/research-contract.md
```

완성형 분석에는 사건 개요, 무엇이 바뀌었는지, 시장 해석, 전달경로, 후속 촉매가 필요하다. research layer가 없으면 Event Study만 제공한다고 명시한다.

## 4. Generic Event Study

```bash
npx -y @nomadamas/k-skill@0 exec market-event-impact scripts/market_event.py -- \
  analyze --query "SVB 파산" \
  --series-file /path/to/market-series.json \
  --event-file /path/to/verified-events.json \
  --research-file /path/to/verified-research.json \
  --observed-at 2023-03-20T09:00:00+09:00
```

각 자산은 자기 관측 캘린더로 정렬한다. 사건 현지시각과 시계열 `observation_timezone + observation_time`을 UTC로 비교한다. 원천 시각이 없으면 확인된 `market_timezone` 마감시각, 이어서 지역 시장 마감 추정 또는 region 달력을 대리 기준으로 쓰고 결과에 명시한다. 서울·도쿄·상하이·프랑크푸르트·런던·뉴욕 시간대는 운영체제 tzdata가 없어도 일관되게 처리한다.

`--observed-at`은 분석의 정보 컷오프다. 해당 시각 뒤의 일별·장중 관측을 제외하고, 원천 관측시각이 없는 일별 값은 같은 현지 날짜에 이미 확정됐다고 추정하지 않는다. 컷오프 뒤에 발생한 사건은 분석하지 않는다. 과거 시점 분석용 research에는 `observed_at`을 넣어 확인 시각을 고정하고, 그 시점에 아직 발표되지 않은 결과를 서술하지 않는다. 가격이 더 필요할 때는 원천에서 해당 시점에 실제로 공개된 자료만 보강한다.

입력 시계열에 `observation_timezone`, `observation_time`, `market_timezone`, `price_type`을 원천 설명대로 기록한다. 예를 들어 FRED DEXKOUS는 뉴욕 정오 매입환율이지 서울 15:30 종가가 아니다. 한국 종가 반응을 분석할 때는 서울 현지 FX 종가를 우선하고, 해당 원천이 없으면 FRED 관측치를 별도 기준시각으로 표시한다.

일별 자료의 D0는 D-1 기준값에서 D0 일별 관측값까지의 움직임이다. 정확한 사건 시각이 있어도 사건 전 장중 구간이 섞일 수 있으므로 인과효과라고 쓰지 않는다. 장중 자료가 검증되면 사건 직전 마지막 바, +1시간 이후 첫 바, 첫 후속 거래 세션의 마지막 제공 바를 표시한다. 거래소 마감 시각과 확인되지 않은 바는 공식 종가라 부르지 않는다. 다일 진행 사건의 D+1/D+5에는 후속 사건과 대응이 섞일 수 있다고 설명한다.

원천 복구 규칙은 다음을 읽는다.

```bash
npx -y @nomadamas/k-skill@0 read market-event-impact references/source-priority.md
```

공식·거래소 시계열을 먼저 확인하고, 확정 종가가 비어 있을 때 Investing.com 역사적 데이터로 보강할 수 있다. 장중값을 종가로 쓰지 않는다. 아직 도래하지 않은 D+5는 결측이 아니라 관측 미도래로 표시한다.

## 5. Specialized Adapter

adapter가 있으면 Generic 결과 위에 사건별 세부 확인을 추가한다.

- FOMC: 성명서 redline, SEP·점도표, 기자회견, 사전 정책금리 pricing
- BOK MPC: 결정문, 소수의견, 총재 기자회견, 성장·물가 전망
- ECB: 결정문, 경제전망, 기자회견, 사전 pricing
- Inflation: Headline·Core·MoM·YoY·세부품목·컨센서스·수정치
- Employment: 고용증감·실업률·임금·참가율·수정치
- Earnings: 매출·이익·가이던스·사업부문·컨센서스·경영진 발언

adapter 자료가 없다는 이유로 Generic 분석을 중단하지 않는다. 반대로 adapter 문구를 다른 사건에 강제로 적용하지 않는다.

## 6. Transmission and analogues

전달 단계 status는 `CONFIRMED`, `CONSISTENT`, `MIXED`, `CONTRADICTED`, `UNVERIFIED`로 표준화한다. `CONFIRMED`는 공식자료/신뢰도 높은 보도와 가격이 해당 연결을 직접 뒷받침할 때만 쓴다. 동시 움직임만으로는 인과를 단정하지 않는다. 일부 자산만 일치하면 `MIXED`, 반대면 `CONTRADICTED`, 근거 부족이면 `UNVERIFIED`다. 같은 날의 다른 대형 사건은 교란요인으로 표시한다.

현재 이벤트와 과거 후보 양쪽에 사건유형, `shock_mechanisms`, `affected_channels`, 관측 `market_shock_pattern`을 구조화한다. 검증된 `historical_analogue_pool`을 이 속성과 실제 충격 방향으로 점수화해 상위 3~5개를 고른다. 충격 메커니즘 중복과 최소 한 개 시장 방향 일치가 없는 후보는 제외한다. 적격 후보가 3개 미만이면 비교를 억지로 채우지 말고 미생성 이유를 표시한다. 모든 후보에는 사건 전 날짜·출처·공통점·차이점이 필요하다.

## Output contract

helper 기본 출력은 사용자용 한국어 `chat`이다. JSON은 검증·자동화에만 사용한다.

```text
1. 무슨 일이 있었나 — 사건 식별 / 핵심 변화 / surprise / optional adapter
2. 시장은 왜 반응했나
3. 교차자산 반응 — 동적으로 선택한 자산과 선택 이유
4. 전달경로
5. 이벤트 스터디 — D-1 / D0 / D+1 / D+5와 실제 정렬일
6. 과거 유사 사례 — 특성과 관측 충격 방향으로 선정한 3~5개 또는 비교 미생성 사유
7. 앞으로 볼 것 — 현재 해석을 확인하거나 뒤집을 촉매
8. 출처 및 재현 기준
```

## Failure rules

| 상황 | 동작 |
| --- | --- |
| 자유 사건의 날짜·출처 미확보 | 유형 후보만 제시하고 `verification_required` |
| 동일 이름의 사건이 여러 개 | 후보를 제시하고 날짜·지역을 추가로 식별 |
| research layer 없음 | Event Study 전용 결과로 명시 |
| 관련 자산 시계열 없음 | 해당 전달 단계를 미검증 처리 |
| D0 휴장·시장 마감 후 발표 | 실제 다음 거래일로 정렬 |
| D+5가 아직 미래 | 관측 미도래 표시 |
| 전형적 경로와 가격이 반대 | 반대 반응 자체를 핵심 결과로 서술 |
| adapter 없음 | Generic Engine을 계속 실행 |

## Done when

- 사건을 직접 출처로 식별하고 기준일·시간의 의미를 설명했다.
- 고정 지역 바스켓이 아니라 전달경로로 자산을 선택했다.
- 자산별 캘린더와 이벤트 윈도를 재현 가능하게 계산했다.
- 실제 가격과 기사 근거를 분리해 전달경로를 판정했다.
- 유사 사건을 이름이 아닌 충격 특성으로 비교했다.
- 후속 촉매가 현재 해석을 어떻게 확인하거나 뒤집는지 설명했다.
