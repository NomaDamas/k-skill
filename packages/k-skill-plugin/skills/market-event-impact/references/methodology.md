# 이벤트 스터디 방법론

## Series input

JSON은 `series` 배열을 받는다.

```json
{
  "series": [
    {
      "symbol": "UST2Y",
      "region": "US",
      "asset_class": "rates",
      "unit": "pct",
      "observation_timezone": "America/New_York",
      "observation_time": "16:00",
      "market_timezone": "America/New_York",
      "price_type": "market_close",
      "roles": ["short_rates", "government_bond", "safe_haven"],
      "selection_priority": 10,
      "source": {"name": "U.S. Treasury", "url": "https://..."},
      "observations": [
        {"date": "2026-09-15", "value": 4.67},
        {"date": "2026-09-16", "value": 4.73}
      ]
    }
  ]
}
```

일별 자료에서 관측 시점이 뉴욕 정오인 원/달러 원천의 예시는 다음과 같다. `region`은 자산의 시장/대상 지역이고, 관측 시각 필드는 실제 원천 기준시각이다.

```json
{
  "symbol": "USDKRW",
  "region": "KR",
  "asset_class": "fx",
  "unit": "krw_per_usd",
  "observation_timezone": "America/New_York",
  "observation_time": "12:00",
  "market_timezone": "Asia/Seoul",
  "price_type": "noon_buying_rate",
  "source": {"name": "Federal Reserve H.10 via FRED", "url": "https://fred.stlouisfed.org/data/DEXKOUS"},
  "observations": [{"date": "2023-03-10", "value": 1324.51}]
}
```

시각 메타데이터가 없으면 region으로 대리 정렬하고 결과에서 해당 한계를 표시한다. `observation_timezone`과 `observation_time`은 함께 제공해야 한다. `market_timezone`은 해당 가격이 대표하는 현지 시장 시계이며, `price_type`은 `market_close`, `noon_buying_rate`, `settlement`, `adjusted_close`처럼 원천의 실제 기준을 짧게 기록한다.

CSV는 `symbol,date,value,asset_class,unit,source_name,source_url`을 기본으로 받으며 `region,observation_timezone,observation_time,market_timezone,price_type`는 선택 열이다. 날짜는 `YYYY-MM-DD`, 값은 유한 숫자여야 한다. 같은 symbol/date가 두 번 나오면 입력 오류다. CSV에서 교차시장 정렬을 사용하려면 `region`을 넣는다. 모든 시리즈에는 `source.name`·`source.url`이 있어야 하며 symbol은 파일 전체에서 유일해야 한다.

장중 자료는 별도 `intraday_observations`로 넣고, 각 timestamp에 UTC offset을 명시한다. 동일 순간 중복은 거부되고 입력 순서와 무관하게 시간순 정규화된다.

```json
"intraday_observations": [
  {"timestamp": "2023-03-10T11:00:00-05:00", "value": 100.0},
  {"timestamp": "2023-03-10T12:30:00-05:00", "value": 99.2},
  {"timestamp": "2023-03-10T16:00:00-05:00", "value": 98.5}
]
```

## Dynamic asset roles

JSON 시계열의 `roles`는 사건 전달경로와 자산을 연결한다. 한 시리즈에 여러 역할을 줄 수 있다. 대표 역할은 `short_rates`, `long_rates`, `curve`, `government_bond`, `bank_equity`, `credit`, `volatility`, `safe_haven`, `oil`, `gold`, `fx`, `broad_equity`, `sector_equity`, `event_security`, `affected_equity`다. 무역정책 프로필은 금리·커브·FX·영향/광범위 주식·원유/원자재·변동성을 선택한다. 임의의 새 역할도 허용하지만 selector profile과 일치해야 자동 선택된다.

`selection_priority`는 같은 역할 후보 사이의 정수 우선순위(-100~100)다. 사용자 `--symbols`가 있으면 역할과 우선순위보다 항상 우선한다. 자동 선택은 사건 유형에 적합한 자산군을 먼저 나눠 담고, 세부 역할을 채운다. 확인 시각까지 D-1과 D0를 모두 확보한 후보를 우선하며, 이 창을 만들 수 없는 시계열은 대체 후보가 없을 때만 사용한다. `roles`가 없거나 자산군명만 담은 입력은 `asset_class`를 보수적인 fallback으로 사용한다. `bank_equity`처럼 구체적이지만 사건 프로필과 맞지 않는 역할은 자산군이 주식이라는 이유만으로 넣지 않는다. 물가 사건의 주식 반응에는 `growth_equity`와 `broad_equity`를 구분하고 `volatility`도 별도 채널로 취급한다.

## Alignment

- `same`: 이벤트 날짜 관측이 없으면 해당 시리즈 실패
- `next`: 이벤트 날짜 이상 첫 관측일
- `next_strict`: 이벤트 날짜보다 뒤의 첫 관측일
- `previous`: 이벤트 날짜 이하 마지막 관측일
- cross-market에서는 우선 event timestamp와 시계열 `observation_timezone + observation_time`을 UTC로 비교한다. 제공되지 않으면 `market_timezone`의 마감시각, 이어서 `region` 시장 마감시각 추정 또는 거래일 달력을 대리 기준으로 사용하고 정렬 근거를 결과에 표시한다. 이벤트가 관측 시각 이전이면 `next`, 이후/동시이면 `next_strict`를 적용한다. IANA timezone과 DST를 반영하며 Windows에 tzdata가 없어도 KR·JP·CN·US·EU·UK 규칙을 자체 계산한다.
- `--observed-at` 이후 관측은 계산에서 제거한다. 검증된 관측 시각이 있는 경우 현지 날짜·시각을 UTC로 변환해 비교한다. 시각이 없는 일별 값은 같은 현지 날짜에 공개됐다고 추측하지 않고 다음 날짜부터 이용 가능한 것으로 보수적으로 처리한다. 원천에서 그보다 빠른 확정 시각을 확인하면 `observation_timezone`·`observation_time`을 채운다.

D-n/D+n은 달력일이 아니라 정렬된 시리즈의 유효 관측 순서다.

요청한 D+n이 컷오프까지 확보한 시리즈의 마지막 관측일 뒤에 있으면 `pending_D+n`이다. 아직 형성 전인지 원천 범위 부족인지는 이 코드만으로 알 수 없다. 원천 범위가 짧은 경우에는 `source-priority.md`의 missing-window recovery를 수행한 뒤 다시 계산한다.

## Measurement

- `asset_class=rates|policy|spread|credit`, `unit=pct`: `(value - anchor) × 100` bp
- `asset_class=rates|policy|spread|credit`, `unit=bp`: `value - anchor` bp
- 그 외 가격/지수: `(value / anchor - 1) × 100` %
- 기본 anchor는 D-1이다. 일별 데이터의 D0는 D-1→D0의 관측된 일별 변동이며 사건 이후 반응만 분리한 인과효과가 아니다. event timestamp가 있어도 같은 날짜 전체 수익률은 사건 전 구간을 포함할 수 있다.
- 값이 0인 가격 시리즈는 % 수익률을 계산하지 않는다.
- 정확한 event timestamp와 장중 바가 모두 있을 때는 사건 직전 마지막 바, 사건 1시간 후 이상 첫 바, 첫 후속 거래 세션의 마지막 제공 바를 계산한다. 마지막 바 시각이 시장 마감으로 확인되지 않으면 `공식 종가`가 아니라 제공 바라고 표시한다.
- `developing_event`의 D+1/D+5에는 사전 경고·후속 사건·정책 대응이 들어갈 수 있으므로 단일 촉발 사건에 귀속하지 않는다.

## Curve classification

단기와 장기 금리가 모두 상승하면 bear, 모두 하락하면 bull이다. 장기 변화가 단기 변화보다 크면 steepening, 작으면 flattening이다. 방향이 서로 다르거나 하나가 0이면 `Mixed`로 두고 스프레드 bp만 표시한다.

## Threshold

`above`는 `metric >= threshold`, `below`는 `metric <= threshold`다. 첫 관측은 직전값이 없어 판정하지 않는다. 중복 이벤트 날짜는 한 번만 반환한다.
`bp_change`는 rates·policy·spread 시리즈에만 허용한다.
