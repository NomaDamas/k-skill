# Unified Railway Timetable Lookup

## What this skill does

`railway-timetable`은 코레일 공식 통합 시간표에서 KTX 계열 고속철도 운행 정보를 조회한다.

- KTX: 한국철도공사 공식 공개 XLSX 통합 계획 시간표

모든 경로는 조회 전용이다. 로그인·credential, 예약·예약대기·좌석 선점·결제·취소·자동 재조회는 실행하지 않는다.

## Commands

```bash
npx -y @nomadamas/k-skill@0 exec railway-timetable scripts/railway_timetable.py -- \
  search --dep 서울 --arr 부산 --date 20260904 \
  --time 0600 --time-limit 1200 --limit 5
```

```bash
npx -y @nomadamas/k-skill@0 exec railway-timetable scripts/railway_timetable.py -- source
```

## Output

- `count`, `trains[]`, `date`
- 각 열차의 `operator`, `train_no`, `train_type`, `dep`, `arr`, `dep_time`, `arr_time`
- 공식 `source`와 예약 진입 URL

결과는 코레일 통합 공개 계획 시간표이며 실제 운휴·지연, 예약 성공, 좌석 선점을 보장하지 않는다.

## Sources and failure modes

- 코레일: 공개 게시판의 XLSX를 읽는다. 게시판·파일 장애, 적용 시간표 없음, 형식 변경, 구간 결과 없음이 발생할 수 있다.
- CAPTCHA·인증·접근 차단은 우회하지 않고 코레일 공식 페이지를 안내한다.

## Hard boundaries

- 회원 로그인·credential 요청 금지
- 예약·결제·취소·정확한 좌석 선택·자동 polling 금지
- 내부 모바일 API, anti-bot, CAPTCHA, 인증 통제 우회 금지
