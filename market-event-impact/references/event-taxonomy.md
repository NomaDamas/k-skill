# Event Resolver 계약

사건명은 whitelist가 아니다. 아래 `event_type`은 자산선정과 전달경로를 위한 넓은 분류이며, 개별 사건은 `event_id`와 직접 출처로 식별한다.

| event_type | 대표 사건 | 우선 확인할 전달경로 |
| --- | --- | --- |
| `monetary_policy` | 금리 결정·QE/QT·YCC | 금리·커브 → FX → 주식 |
| `inflation` | CPI·PPI·HICP | 정책금리 기대 → 금리·FX·성장주 |
| `employment` | NFP·실업률·임금 | 정책금리 기대 → 금리·FX·주식 |
| `growth` | GDP·PMI | 성장기대 → 장기금리·경기민감주·원자재 |
| `financial_stress` | 은행 파산·예금유출·자금시장 경색 | 은행주·신용·변동성 → 단기금리 |
| `sovereign_credit` | 국가신용등급·디폴트 | 국채·CDS·FX·금·주식 |
| `geopolitics` | 전쟁·군사충돌·제재 | 에너지·금·FX·금리·변동성 |
| `commodity_supply` | 감산·광산/항만 차질 | 원자재 → 기대인플레이션·관련주·FX |
| `corporate_earnings` | 실적·가이던스 쇼크 | 해당 종목 → 업종 → 시장지수 |
| `fiscal_policy` | 예산·감세·부양책 | 국채공급·성장기대 → 금리·FX·주식 |
| `trade_policy` | 관세·수출통제 | 영향 업종·FX·원자재·변동성 |
| `regulation` | 규제·소송·허가 | 해당 종목·업종·시장지수 |
| `market_shock` | 급락·쇼트스퀴즈·시장기능 장애 | 원인 자산·변동성·신용·안전자산 |
| `other` | 위 분류에 맞지 않는 사건 | 검증된 가설에 맞춰 사용자 지정 |

## Event object

```json
{
  "event_id": "svb-failure-2023-03-10",
  "event_name": "Silicon Valley Bank failure",
  "event_type": "financial_stress",
  "event_structure": "developing_event",
  "aliases": ["SVB 파산", "SVB 사태"],
  "region": "US",
  "event_date": "2023-03-10",
  "event_time_local": "11:15",
  "event_timezone": "America/New_York",
  "event_sequence": [
    {
      "date": "2023-03-09",
      "stage": "prelude",
      "event": "채권매각 손실 및 자본조달 이슈 공개",
      "source": {"name": "당시 원문 보도", "url": "https://..."}
    },
    {
      "date": "2023-03-10",
      "time_local": "11:15",
      "timezone": "America/New_York",
      "stage": "trigger",
      "event": "캘리포니아 규제당국의 은행 폐쇄",
      "source": {"name": "FDIC", "url": "https://..."}
    },
    {
      "date": "2023-03-12",
      "stage": "policy_response",
      "event": "예금자 보호 및 BTFP 발표",
      "source": {"name": "Federal Reserve", "url": "https://..."}
    }
  ],
  "source": {"name": "직접 원천", "url": "https://..."}
}
```

- `event_id + event_date`는 파일 안에서 유일해야 한다.
- `event_type`은 금융스트레스·물가·정책 등 시장충격의 분야다. `event_structure`는 `point_event`, `scheduled_event`, `developing_event` 중 하나로 별도 기록한다. 두 분류를 혼용하지 않는다.
- `event_structure=developing_event`면 출처가 연결된 `event_sequence`를 2~20개 제공하고, 기준일 사건을 그 안에 포함한다. 사전 경고·최초 충격·후속 대응·시장 재개를 순서대로 기록할 수 있다.
- 날짜는 분석 기준이 된 최초 공식 발표·폐쇄·결정 시점 중 무엇인지 설명한다.
- 사건이 며칠에 걸치면 최초 충격과 후속 정책대응을 별도 event로 나눌 수 있다.
- `event_time_local`과 IANA `event_timezone`은 함께 쓰거나 함께 생략한다.
- timestamp 품질은 정확 시각과 시간대가 있으면 `A · 정확 시각`, 날짜만 확인되면 `B · 날짜만 확인`이다. `C · 다일 진행 사건`은 시간 품질이 아니라 `event_structure=developing_event`를 뜻한다.
- `event_date`와 정확 시각은 기준 충격(anchor)을 고르는 데 사용한다. 일별 데이터의 D0는 D-1 기준값부터 D0 일별 관측값까지의 변동이며 인과효과로 서술하지 않는다. 진행 사건의 D+1/D+5는 후속 충격·대응을 포함할 수 있다고 밝힌다.
- 이름만으로 날짜가 확정되지 않으면 `verification_required`로 멈춘다.
- 키워드가 여러 유형과 동시에 일치하면 임의로 하나를 고르지 않고 명시적 `event_type`을 요구한다.

## Optional adapter

`adapter`는 `FOMC`, `BOK_MPC`, `ECB`, `INFLATION`, `EMPLOYMENT`, `EARNINGS` 중 하나를 지정할 수 있다. 지정하지 않아도 Generic Engine은 동작한다.
