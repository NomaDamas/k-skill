# KBL 경기 결과 가이드

## 이 기능으로 할 수 있는 일

- 날짜별 KBL 경기 일정 및 결과 조회
- 특정 팀(`서울 SK`, `부산 KCC`, 팀 코드 등) 경기만 필터링
- 현재 순위 확인

## 먼저 필요한 것

- Node.js 18+
- `npm install -g kbl-results`

## 입력값

- 날짜: `YYYY-MM-DD`
- 선택 사항: 팀명, 풀네임, 팀 코드

## 공식 표면

이 기능은 브라우저 크롤링 전에 공식 JSON 표면을 직접 사용한다.

- KBL 일정/결과 API: `https://api.kbl.or.kr/match/list`
- KBL 팀 순위 API: `https://api.kbl.or.kr/league/rank/team`

## 기본 흐름

1. 패키지가 없으면 다른 방법으로 우회하지 말고 먼저 `kbl-results` 를 전역 설치한다.
2. `match/list` 에 `fromDate` / `toDate` / `tcodeList` / `seasonGrade=1` 을 넣어 날짜별 경기 데이터를 가져온다.
3. 요청 팀이 있으면 `서울 SK`, `SK`, `55`, `부산 KCC`, `KCC` 같은 alias 를 같은 팀으로 인식해 걸러낸다.
4. `league/rank/team` 으로 현재 순위를 가져와 경기 결과와 함께 보여준다.

## 예시

```bash
GLOBAL_NPM_ROOT="$(npm root -g)" node --input-type=module - <<'JS'
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
  path.join(process.env.GLOBAL_NPM_ROOT, "kbl-results", "src", "index.js"),
).href;
const { getKBLSummary } = await import(entry);

const summary = await getKBLSummary("2026-04-01", {
  team: "서울 SK",
  includeStandings: true,
});

console.log(JSON.stringify(summary, null, 2));
JS
```

## 주의할 점

- `match/list` 는 `YYYYMMDD` 파라미터를 받는다. 라이브러리가 `YYYY-MM-DD` 입력을 공식 포맷으로 바꾼다.
- 기본 조회는 KBL 1군 기준이라 `seasonGrade=1` 을 사용한다.
- 현재 순위는 `league/rank/team` 기준 현재 표를 사용한다.
- 공식 JSON이 살아 있으므로 브라우저 scraping 은 기본 경로가 아니다.
