# 시외버스 예매 가이드

## 이 기능으로 할 수 있는 일

- 티머니 시외버스 터미널/노선 후보 확인
- 배차 시간표, 운수사, 잔여석, 요금 확인
- 좌석/요금 단계 진입 가능 여부 확인
- 공식 카드정보 입력 페이지로 handoff

## 먼저 필요한 것

- 별도 사용자 계정/비밀번호는 기본 조회·좌석 단계에서 필요하지 않음
- 결제는 공식 티머니 시외버스 페이지에서 사용자가 직접 진행
- 브라우저 자동화보다 `https://intercitybus.tmoney.co.kr` 공식 HTTP 흐름을 우선 사용

## 입력값

- 출발 터미널
- 도착 터미널
- 날짜: `YYYYMMDD`
- 희망 시간대
- 인원 수와 좌석 선호

## 기본 흐름

1. 쿠키 jar를 만들고 티머니 시외버스 페이지를 열어 세션을 시작한다.
2. `POST /otck/readAlcnList.do` 로 배차를 조회한다. 이때 브라우저 JS가 붙이는 `bef_Aft_Dvs=D`, `req_Rec_Num=10`을 반드시 같이 보낸다.
3. 결과의 `readSasFeeInf(...)` 인자를 파싱해 후보를 정리한다.
4. 선택 후보는 `POST /otck/readSatsFee.do` 로 좌석/요금 단계 진입을 확인한다.
5. 사용자가 원하면 `POST /otck/readPcpySats.do` 로 공식 카드정보 입력 페이지에 진입하도록 handoff한다.
6. 뒤로가기/취소성 이동으로 좌석 선택 단계에 복귀해 임시 선점을 해제할 수 있는지 확인한다.

## read-only 조회 helper

```bash
python3 intercity-bus-booking/scripts/intercity_bus_search.py \
  --depart-code 0511601 \
  --arrive-code 2482701 \
  --depart-name 동서울 \
  --arrive-name 속초 \
  --date 20260520
```

이 helper는 쿠키 세션을 시작하고 공식 배차 조회 POST를 수행한 뒤 출발시각, 운수사, 등급, 요금, 잔여/총 좌석을 JSON으로 출력한다. 기본은 read-only이며, `--hold-seat` 또는 `--hold-first-seat`를 주면 좌석/요금 단계에 진입해 `readPcpySats.do`로 임시 좌석 선점을 만들고 공식 카드정보 입력 HTML과 cancel/back 필드를 저장한다. 결제 정보 입력·제출은 수행하지 않는다.

### 임시 선점 예시

```bash
python3 intercity-bus-booking/scripts/intercity_bus_search.py \
  --depart-code 0511601 \
  --arrive-code 2482701 \
  --depart-name 동서울 \
  --arrive-name 속초 \
  --date 20260520 \
  --select-index 1 \
  --hold-first-seat \
  --output-dir /tmp/tmoney-hold
```

성공 조건은 JSON의 `hold.success=true`, `hold.hold_id` 존재, 저장된 HTML에 `카드정보 입력` 표시가 있는 것이다. 라이브 응답 페이지에는 정확한 만료 카운트다운 문구가 노출되지 않았으므로, 선점 후 결제는 즉시 진행하게 안내하고 방치된 선점은 저장된 cancel/back 필드로 해제한다.

## 주의할 점

- 결제 자동화는 포함하지 않는다. 공식 페이지의 결제 직전 단계까지 보조하는 assisted checkout 흐름이다.
- 티머니 시외버스 터미널 코드는 KOBUS 고속버스 코드와 다르므로 혼용하지 않는다.
- 일부 표면은 `txbus` 계열 URL과 연결될 수 있지만, 검증된 기본 URL은 `intercitybus.tmoney.co.kr` 이다.
- stateless POST보다 쿠키와 referer를 유지하는 흐름이 안정적이다.
- `bef_Aft_Dvs` 또는 `req_Rec_Num`을 누락하면 실제 배차가 있어도 `errorCont`가 포함된 일반 오류 페이지가 반환될 수 있다.
