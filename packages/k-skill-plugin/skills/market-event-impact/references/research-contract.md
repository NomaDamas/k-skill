# Generic Event Research 계약

이벤트 스터디 숫자 위에 올라가는 재현 가능한 연구 계층이다. `event_id + event_date`는 파일 안에서 유일해야 한다.

```json
{
  "research": [{
    "event_id": "svb-failure-2023-03-10",
    "event_name": "Silicon Valley Bank failure",
  "event_type": "financial_stress",
  "region": "US",
    "event_date": "2023-03-10",
    "observed_at": "2023-03-20T09:00:00+09:00",
  "event_features": {
    "shock_mechanisms": ["deposit_run", "duration_loss"],
    "affected_channels": ["bank_equity", "credit", "short_rates", "volatility"],
    "market_shock_pattern": {"bank_equity": "down", "credit": "wider", "short_rates": "down", "volatility": "up"}
  },
    "overview": {
      "summary": "직접 확인된 사건과 배경",
      "expected": false,
      "surprise_assessment": "사전 기대와 달랐던 지점",
      "classification": "충격 메커니즘 중심 분류",
      "source": {"name": "직접 원천", "url": "https://..."}
    },
    "what_changed": [{
      "channel": "사건별 변화 채널",
      "finding": "확인된 변화",
      "significance": "시장에 중요한 이유",
      "source": {"name": "직접 원천", "url": "https://..."}
    }],
    "adapter_details": [],
    "market_interpretation": [{
      "channel": "금리·신용·성장·물가 등",
      "finding": "당일 기사와 가격이 함께 지지한 해석",
      "significance": "재가격과 연결되는 이유",
      "source": {"name": "시장 반응 원천", "url": "https://..."}
    }],
    "transmission": [{
      "from": "최초 충격",
      "to": "첫 번째 시장 반응",
      "status": "consistent",
      "evidence": "실제 가격 근거",
      "source": {"name": "가격 원천", "url": "https://..."}
    }],
    "catalysts": [{
      "date": "2023-03-12",
      "time_local": "18:00",
      "timezone": "America/New_York",
      "event": "후속 정책대응",
      "why_it_matters": "현재 해석을 확인하거나 뒤집는 조건",
      "source": {"name": "공식 일정", "url": "https://..."}
    }],
    "historical_context": {
      "include": true,
      "reason": "비교가 필요한 이유",
      "comparisons": [{
        "date": "2008-03-16",
        "event": "과거 사건",
        "matching_basis": "사건유형·전달경로·가격반응 중 선정 기준",
        "similarity": "공통점",
        "difference": "중요한 차이",
        "source": {"name": "직접 원천", "url": "https://..."}
      }]
    },
    "historical_analogue_pool": [{
      "date": "2008-03-16",
      "event": "Bear Stearns 구제",
      "event_type": "financial_stress",
      "shock_mechanisms": ["funding_stress", "liquidity_backstop"],
      "affected_channels": ["bank_equity", "short_rates", "volatility"],
      "market_shock_pattern": {"bank_equity": "down", "short_rates": "down", "volatility": "up"},
      "similarity": "은행 유동성 충격과 정책 백스톱이 단기금리·변동성에 함께 반영됐다.",
      "difference": "도매자금시장과 투자은행이 충격의 중심이었다.",
      "source": {"name": "직접 원천", "url": "https://..."}
    }]
  }]
}
```

## Evidence rules

- 사건 정의와 기준일은 규제기관·정부·거래소·기업 IR 등 직접 원천을 우선한다.
- `what_changed`는 직전 상태 또는 사건 직전 기대와 비교해 확인된 변화만 쓴다.
- `market_interpretation`은 가격만 보고 역으로 만들지 않는다. 당일 시장기사와 가격 방향이 함께 지지해야 한다.
- 모든 claim, transmission, catalyst, historical comparison에는 직접 연결되는 출처가 필요하다.
- 과거 시점 분석에는 research `observed_at`을 적고 분석 CLI의 `--observed-at`보다 뒤에 확인된 연구를 넣지 않는다. helper가 research 시각이 분석 컷오프 이후이면 거부한다. 출처 URL만으로 보도·발표 시각을 증명할 수 없으므로 작성자가 개별 claim의 당시 공개 여부를 확인한다.
- 검색결과 snippet만으로 사실이나 인과를 확정하지 않는다.
- adapter가 있으면 `adapter_details`에 전용 확인 결과를 넣는다. adapter가 없으면 빈 배열이어도 된다.

## Transmission status

`status`는 다음 대문자 enum으로 표준화한다. 과거 입력의 소문자 `limited`는 `MIXED`로 정규화한다.

| status | 의미 |
| --- | --- |
| `CONFIRMED` | 공식자료 또는 신뢰도 높은 시장보도와 관측가격이 이 연결을 직접 뒷받침한다. 단지 동시에 움직였다는 뜻은 아니다. |
| `CONSISTENT` | 가격은 가설과 같은 방향이지만 인과는 확정하지 못했다. |
| `MIXED` | 일부 자산·단계만 일치하거나 반응이 제한적이다. |
| `CONTRADICTED` | 관측 결과가 제시한 전달방향과 반대다. |
| `UNVERIFIED` | 필요한 원천·가격·연결 근거가 부족하다. |

완성형 연구에는 최소 한 단계가 필요하다. 근거가 부족하면 생략하지 말고 `unverified`와 부족한 근거를 적는다.

## Catalysts and analogues

후속 촉매는 현재 해석을 확인하거나 뒤집을 일정이어야 하며 최소 2개, 최대 8개다. 같은 사건의 다음 날짜만 기계적으로 고르지 않는다.
일정의 발표시각이 확인되면 `time_local`과 `timezone`을 함께 넣어 동일 날짜의 경과·예정 여부를 판정한다. 날짜만 확인되면 당일에는 `시각 미확인`으로 표시한다.

과거 비교를 사용할 때는 3~5개를 쓴다. 이름이 같은 사건이 아니라 `matching_basis`에 사건유형, 충격 메커니즘, 핵심 가격반응 중 무엇이 일치하는지 명시한다. 현재 사건 이후 날짜나 중복 사례는 허용하지 않는다.

## Historical analogue ranking

범용 분석은 현재 사건과 과거 후보 양쪽에 `event_features`를 제공한다. 충격 메커니즘과 영향 채널은 짧고 표준화된 식별자 배열로, `market_shock_pattern`은 채널별 `up|down|mixed|flat|wider|tighter` 방향으로 기록한다. 후보마다 과거 날짜, event_type, similarity/difference 서술과 직접 출처가 필수다.

검증된 `historical_analogue_pool`은 이름 유사도로 고르지 않는다. helper는 사건유형 일치(+2), shock_mechanisms Jaccard(+3 가중), affected_channels Jaccard(+2), 관측 시장충격 방향 겹침(+4)을 점수화해 정렬한다. mechanism 중복과 최소 한 개 시장 방향 일치가 모두 있어야 후보 자격이 있다. 적격 후보 3개 미만이면 억지로 채우지 않고 비교 미생성 사유를 출력한다. 3~5개이면 높은 순으로 표시하며 매칭 점수 근거를 남긴다. 수동 `historical_context`는 호환을 위해 지원하되 같은 날짜·출처 검증을 적용한다.

일별 D0는 이벤트 이후 부분수익률이 아니라 일별 관측값의 변화다. exact event timestamp는 거래일 정렬을 개선하지만, 일별 종가만으로 인과효과를 분리하지 못한다. 다일 진행 사건의 후속 창에는 `event_sequence`에 기록된 후속 사건이 포함될 수 있으므로 하나의 촉발점에 귀속하지 않는다.

기존 `decision` 필드는 하위 호환을 위해 `overview`로 읽을 수 있지만, 새 입력은 `overview`를 사용한다.
