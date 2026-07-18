# ev-subsidy-status

환경부 무공해차 통합누리집의 공개 구매보조금 지급현황을 로그인이나 사용자 브라우저 없이 조회한다.

```bash
npx ev-subsidy-status status --region "경기 성남시" --vehicle passenger --year 2026
npx ev-subsidy-status status --region "서울 강남구" --model "모델명" --json
npx ev-subsidy-status regions --query "중구"
```

기본 전송 방식은 `direct-http`다. 공개 응답에서 공식 `pnp4web.js` 문자표를 읽고,
원격 코드를 실행하지 않은 채 보호된 HTML을 복원한다. 프록시와 API 키를 사용하지 않는다.

공식 페이지 구조가 바뀌었을 때 진단용 브라우저 경로를 명시적으로 선택할 수 있다.

```bash
npx ev-subsidy-status status --region "경기 성남시" --transport browser --provider auto
```

브라우저 경로는 `k-skill-browser-runtime`으로 사용자가 실행한 Aside Browser,
BrowserOS 또는 Chrome CDP 세션에 연결하며 기존 프로필이나 탭을 종료하지 않는다.

공식 화면은 원화 잔액이 아니라 공고·접수·출고·출고잔여 대수를 제공한다.
모델을 지정하면 직접 HTTP 경로에서도 모델별 국비·지방비·합계와 잔여 환산치를 조회한다.
입력한 이름이 여러 세부 모델과 일치하면 모든 후보를 반환하며 한 세부 모델을 임의로 선택하지 않는다.
환산치는 정확한 가용 예산 잔액이 아니다.
