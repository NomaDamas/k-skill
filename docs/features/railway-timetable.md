# 철도 통합 시간표 조회 가이드

`railway-timetable`은 코레일 공식 통합 시간표에서 고속철도 운행 정보를 조회하는 조회 전용 스킬이다.

## 제공하는 정보

- KTX: 코레일 공식 공개 XLSX 통합 계획 시간표

## 실행

```bash
npx -y @nomadamas/k-skill@0 exec railway-timetable scripts/railway_timetable.py -- \
  search --dep 서울 --arr 부산 --date 20260904 \
  --time 0600 --time-limit 1200 --limit 5
```

`source` 명령은 사용된 공식 조회 경로를 출력한다.

## 경계와 실패 모드

- 로그인·credential, 예약·예약대기·좌석 선점·결제·취소·자동 재조회는 실행하지 않는다.
- KTX 계열 코레일 통합 시간표는 계획 시간표라 실시간 운휴·지연·잔여석을 제공하지 않는다.
- CAPTCHA·본인인증·anti-bot 통제는 우회하지 않는다.

상세 고지: [`AUTOMATION-LEGAL-STATEMENT.md`](../../railway-timetable/references/AUTOMATION-LEGAL-STATEMENT.md)
