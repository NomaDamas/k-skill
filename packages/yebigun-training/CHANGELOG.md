# yebigun-training

## 0.2.0

### Minor Changes

- 3f8fa9e: Add yebigun-training: a logged-in-session helper for the official 예비군 homepage (yebigun1.mil.kr). `training-info` fetches the "나의 훈련정보" page and returns member info, this year's training (date/location/type), prior years already shown on the same page, and a ready-made year-over-year comparison — verified against a real logged-in session. `view` reads read-only 조회/목록 pages confirmed to have no identifying fields in their markup (훈련신청 결과, 연기신청 결과, 보류·해소 신청결과, 휴일예비군 훈련일정 조회, 소속부대 공지사항, 훈련안내, 나의 질의응답, 예비군부대 찾기) and returns a generic headers+rows table, polling past AJAX "Loading..." placeholders instead of returning them as data. `open-menu` lands on a known screen and stops there (navigation only, never fills in or submits) — clicking the real button for 훈련일정 자율선택/전국단위 훈련신청/휴일예비군 훈련신청, or navigating directly for 훈련 연기신청/보류 신청/해소 신청/개인정보수정/예비군 상훈, since those pages' markup embeds direct identifiers (이름/군번/주민등록번호/전화번호/주소). Also ships a generic page inspector and optional local record/diff commands for longer-term local tracking.
