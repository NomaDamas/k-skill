# KTX 예매 가이드

## 이 기능으로 할 수 있는 일

- KTX/Korail 열차 조회
- 좌석 가능 여부 확인
- 호차별 남은 좌석번호 확인
- 콘센트 꿀팁 좌석 필터링
- 예약 진행
- 예약 내역 확인
- 예약 취소

## 먼저 필요한 것

- Python 3.10+
- `python3 -m pip install korail2 pycryptodome`
- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인

## 필요한 환경변수

- `KSKILL_KTX_ID`
- `KSKILL_KTX_PASSWORD`

### Credential resolution order

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

## 입력값

- 출발역
- 도착역
- 날짜: `YYYYMMDD`
- 희망 시작 시각: `HHMMSS`
- 인원 수와 승객 유형
- 좌석 선호
- 좌석 상세 조건: 객실 등급, 호차 번호, 남은 좌석만 보기, 콘센트 좌석 우선
- 조회 결과에서 복사한 `train_id`

## 왜 helper 를 쓰는가

현재 공개 배포된 `korail2` 0.4.0 예제만으로는 Korail 모바일 표면의 Dynapath anti-bot 체크에 막혀 `MACRO ERROR` 가 발생할 수 있다.

이 저장소의 `scripts/ktx_booking.py` 는 다음 값을 보강해서 실제 KTX 예약 흐름을 복구한다.

- `x-dynapath-m-token`
- `Sid`
- 최신 app version `250601002`
- 최신 Android user-agent

## 기본 흐름

1. `korail2` 또는 `pycryptodome` 패키지가 없으면 다른 방법으로 우회하지 말고 먼저 전역 설치한다.
2. `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` 가 없으면 credential resolution order에 따라 확보한다.
3. helper 로 먼저 열차를 조회한다.
4. 후보 열차의 `index`, `train_id`, 출발/도착 시각, KTX 여부, 좌석 여부를 보여준다.
5. 사용자가 좌석번호, 호차별 잔여석, 콘센트 꿀팁 좌석을 물으면 `seats` 로 상세 좌석을 먼저 확인한다.
6. 대상 열차가 명확할 때만 예약한다.
7. 예약 확인/취소는 대상 예약을 다시 식별한 뒤 진행한다.

## 예시

조회:

```bash
python3 scripts/ktx_booking.py search 서울 부산 20260328 090000 --limit 5
```

좌석이 없는 열차까지 같이 보고 싶으면 `--include-no-seats`, 예약 대기 가능 열차도 같이 보고 싶으면 `--include-waiting-list` 를 붙인다.

응답 JSON 의 `train_id` 는 검색 시점의 정확한 열차를 가리키는 stable selector 다. 예약할 때는 이 값을 그대로 복사해서 쓴다. 같은 열차가 더 이상 조회되지 않으면 helper 가 실패하고 새로 조회하게 만든다.

상세 좌석 확인:

```bash
python3 scripts/ktx_booking.py seats 서울 부산 20260328 090000 --train-id <train_id>
```

남은 좌석번호만 확인:

```bash
python3 scripts/ktx_booking.py seats 서울 부산 20260328 090000 --train-id <train_id> --available-only
```

특정 호차의 남은 좌석만 확인:

```bash
python3 scripts/ktx_booking.py seats 서울 부산 20260328 090000 --train-id <train_id> --car-no 5 --available-only
```

콘센트 꿀팁 좌석부터 확인:

```bash
python3 scripts/ktx_booking.py seats 서울 부산 20260328 090000 --train-id <train_id> --available-only --power-only
```

`--power-only` 는 KTX/KTX-산천에서 알려진 호차 배치 힌트 기반의 best-effort 필터다. 특실 좌석을 확인하려면 `--room special`, KTX 외 열차를 조회했다면 `search` 와 같은 `--train-type` 을 함께 넘긴다.

```bash
python3 scripts/ktx_booking.py seats 남춘천 용산 20260503 150000 \
  --train-id <train_id> \
  --train-type itx-cheongchun \
  --available-only
```

`seats` 응답은 호차별 `remaining_seats`, `available_seats`, 좌석별 순방향/역방향, 창측/내측, 좌석 종류, 문 근처 여부, 콘센트 힌트를 JSON 으로 반환한다. 호차 요약에는 잔여석이 있는데 좌석 상세 응답 형식이 깨졌다면 해당 호차에 `seat_lookup_error` 를 포함하고 `remaining_seats` 를 보존한다. 이 단계는 좌석을 선택하거나 선점하지 않고, 예약 전 확인만 한다.

예약:

```bash
python3 scripts/ktx_booking.py reserve 서울 부산 20260328 090000 --train-id <train_id> --seat-option general-first
```

좌석이 없을 때 예약 대기까지 시도하려면 조회 단계에서도 `--include-waiting-list` 를 켜고, 예약 단계에서 `--try-waiting` 을 추가한다.

예약 확인:

```bash
python3 scripts/ktx_booking.py reservations
```

취소:

```bash
python3 scripts/ktx_booking.py cancel <reservation_id>
```

응답은 JSON 으로 나오며 예약번호, 구입기한, 운임 확인에 바로 쓸 수 있다. **결제는 제외** 하고 예약까지만 자동화한다.

## 주의할 점

- SRT 예매와는 별도 표면이므로 혼용하지 않는다.
- credential은 환경변수로 주입한다.
- 결제 완료까지 자동화하는 범위는 아니다.
- Korail anti-bot 규칙이 다시 바뀌면 helper 도 함께 점검해야 한다.
