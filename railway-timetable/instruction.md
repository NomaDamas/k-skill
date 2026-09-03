# Unified Railway Timetable Lookup

## What this skill does

`railway-timetable`은 하나의 명령으로 KTX와 SRT 시간표를 조회한다.

- `ktx`: 한국철도공사 공식 공개 XLSX 계획 시간표
- `srt`: 로그인 없는 `SRTrain` 라이브 시간표와 일반실·특실 가능 여부
- `both`: 두 운영사의 결과를 출발시각 순으로 합쳐 조회

모든 경로는 조회 전용이다. 로그인·credential, 예약·예약대기·좌석 선점·결제·취소·자동 재조회는 실행하지 않는다.

## Commands

```bash
npx -y @nomadamas/k-skill@0 exec railway-timetable scripts/railway_timetable.py -- \
  --operator both search --dep 서울 --arr 부산 --date 20260904 \
  --time 0600 --time-limit 1200 --limit 5
```

개별 운영사만 조회하려면 `--operator ktx` 또는 `--operator srt`를 사용한다.

```bash
npx -y @nomadamas/k-skill@0 exec railway-timetable scripts/railway_timetable.py -- \
  --operator ktx source
```

## Output

- `count`, `trains[]`, `date`
- 각 열차의 `operator`, `train_no`, `train_type`, `dep`, `arr`, `dep_time`, `arr_time`
- SRT 결과의 `general_seat_available`, `special_seat_available`
- 운영사별 `source`와 공식 `booking_urls`

KTX 결과는 계획 시간표이고 SRT 결과는 라이브 조회다. 어느 결과도 실제 운휴·지연, 예약 성공, 좌석 선점을 보장하지 않는다.

## Sources and failure modes

- KTX: 코레일 공개 게시판의 XLSX를 읽는다. 게시판·파일 장애, 적용 시간표 없음, 형식 변경, 구간 결과 없음이 발생할 수 있다.
- SRT: `SRTrain` 익명 검색과 NetFunnel 경로를 사용한다. 접근 제한, 대기열, 패키지 호환성, 결과 없음이 발생할 수 있다.
- CAPTCHA·인증·접근 차단은 우회하지 않고 각 운영사의 공식 페이지를 안내한다.

## Hard boundaries

- 회원 로그인·credential 요청 금지
- 예약·결제·취소·정확한 좌석 선택·자동 polling 금지
- 내부 모바일 API, anti-bot, CAPTCHA, 인증 통제 우회 금지
