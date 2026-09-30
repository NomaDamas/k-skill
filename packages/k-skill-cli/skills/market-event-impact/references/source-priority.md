# Source priority

1. 사건을 직접 다루는 규제기관·정부·거래소·기업 IR과 공식 시계열
2. 공식 경제 캘린더와 공식 배포 일정
3. Reuters·Bloomberg·주요 통신사: consensus와 시장의 당일 해석 보강
4. Investing.com 역사적 데이터: 공식·거래소·재무부·중앙은행 시계열에 필요한 종가가 없을 때 시장가격 fallback
5. 기타 금융사이트: 위 원천 부재 시 제한적 교차 확인

검색결과 snippet만으로 수치·일정·인과를 확정하지 않는다. 각 수치에는 관측일, 단위, 원천 URL을 보존한다. 기사와 가격 반응이 충돌하면 가격 방향을 우선 사실로 기록하고 원인은 미확인으로 둔다.

시계열 provenance에는 원천이 실제로 측정한 `observation_timezone`, `observation_time`, 대상 시장의 `market_timezone`, `price_type`을 보존한다. 원천의 관측시각을 거래소 종가로 바꾸어 부르지 않는다. 특히 FRED `DEXKOUS`는 뉴욕 정오 매입환율이므로 서울 15:30 USD/KRW 종가를 대신할 수 없다. 한국 거래일 기준 FX 반응은 서울 현지 종가 원천을 우선하고, 해당 자료가 없을 때에만 FRED를 별도 시간축의 보조 관측치로 표시한다.

## Missing-window recovery

Event Study의 D0·D+1·D+5가 비어 있으면 즉시 `미확인`으로 출력하지 않는다.

1. 기존 원천의 날짜 범위가 필요한 거래일까지 포함되는지 확인한다.
2. 거래소·재무부·중앙은행·공식 지수 제공자의 일별 종가를 먼저 조회한다.
3. 공식 원천으로 보강할 수 없으면 Investing.com 역사적 데이터 화면에서 해당 날짜의 확정 종가를 확인한다.
   - KOSPI: `https://www.investing.com/indices/kospi-historical-data`
   - USD/KRW: `https://www.investing.com/currencies/usd-krw-historical-data`
4. 브라우저에 표시된 날짜·종가·통화·시장 상태를 normalized series에 추가하고 source URL을 보존한 뒤 Event Study를 다시 실행한다.
5. 장중값을 종가로 쓰지 않는다. 해당 시장의 다섯 번째 후속 거래일이 아직 끝나지 않았거나 역사적 데이터에 확정값이 없으면 `pending_D+n`으로 남긴다.

Investing.com은 시장가격 보강용이다. 정책결정, 규제조치, 기업발표, 군사·외교 발표, 공식 일정 등 사건 자체의 원천으로 사용하지 않는다.
