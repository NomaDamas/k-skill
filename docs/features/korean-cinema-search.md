# 영화관 검색 가이드

원본 [`hmmhmmhm/daiso-mcp`](https://github.com/hmmhmmhm/daiso-mcp) 와 npm package [`daiso`](https://www.npmjs.com/package/daiso) 를 사용해 CGV, 메가박스, 롯데시네마의 영화관 검색, 상영작, 시간표, 잔여석 조회를 한다.

## 가장 중요한 규칙

`k-skill` 안에 별도 영화관 수집기를 추가하지 않는다.

기본 경로는 **MCP 서버를 직접 설치하지 않고 CLI로 먼저 확인하는 방식**이다.

1. `npx --yes daiso ...`
2. 필요하면 `git clone https://github.com/hmmhmmhm/daiso-mcp.git && cd daiso-mcp && npm install && npm run build`
3. clone fallback에서는 `node dist/bin.js ...`

## 빠른 확인

날짜가 있는 요청은 Asia/Seoul 기준 `YYYYMMDD` 로 정규화하고 `--playDate <YYYYMMDD>` 를 항상 붙인다. 예를 들어 오늘을 물으면 KST 오늘 날짜를 계산해서 넣는다.

```bash
npx --yes daiso health
npx --yes daiso get /api/cgv/theaters --keyword 강남 --limit 5 --json
npx --yes daiso get /api/cgv/movies --keyword 강남 --playDate <YYYYMMDD> --json
npx --yes daiso get /api/cgv/timetable --keyword 강남 --playDate <YYYYMMDD> --json
npx --yes daiso get /api/megabox/theaters --keyword 코엑스 --limit 5 --json
npx --yes daiso get /api/megabox/movies --keyword 코엑스 --playDate <YYYYMMDD> --json
npx --yes daiso get /api/megabox/seats --keyword 코엑스 --playDate <YYYYMMDD> --limit 10 --json
npx --yes daiso get /api/lottecinema/theaters --keyword 월드타워 --limit 5 --json
npx --yes daiso get /api/lottecinema/movies --keyword 월드타워 --playDate <YYYYMMDD> --json
npx --yes daiso get /api/lottecinema/seats --keyword 월드타워 --playDate <YYYYMMDD> --limit 10 --json
```

## 원본 저장소 clone fallback

```bash
git clone https://github.com/hmmhmmhm/daiso-mcp.git
cd daiso-mcp
npm install
npm run build
node dist/bin.js health
node dist/bin.js get /api/cgv/theaters --keyword 강남 --limit 5 --json
node dist/bin.js get /api/cgv/timetable --keyword 강남 --playDate <YYYYMMDD> --json
node dist/bin.js get /api/megabox/seats --keyword 코엑스 --playDate <YYYYMMDD> --limit 10 --json
node dist/bin.js get /api/lottecinema/seats --keyword 월드타워 --playDate <YYYYMMDD> --limit 10 --json
```

## 입력값

- 체인: CGV, 메가박스, 롯데시네마
- 지역 또는 지점: 강남, 코엑스, 월드타워 등
- 영화명: 잔여석이나 시간표를 특정 영화로 좁힐 때 사용
- 날짜: 사용자가 날짜를 말하면 그 날짜를 우선하고, 없으면 Asia/Seoul 기준 오늘을 `YYYYMMDD` 로 계산한다.

| 체인 | 후보 조회 | 상영작 | 시간표 또는 잔여석 | 날짜 |
| --- | --- | --- | --- | --- |
| CGV | `keyword`, 선택 `limit` | `keyword` 또는 `theaterId`, `playDate` | `keyword` 또는 `theaterId`, `movieId`, `playDate` | 필수로 명시 |
| 메가박스 | `keyword`, 선택 `limit` | `keyword` 또는 `theaterId`, `playDate` | `keyword` 또는 `theaterId`, `movieId`, `playDate` | 필수로 명시 |
| 롯데시네마 | `keyword`, 선택 `limit` | `keyword` 또는 `theaterId`, `playDate` | `keyword` 또는 `theaterId`, `movieId`, `playDate` | 필수로 명시 |

## 사용 흐름

1. `npx --yes daiso health` 로 endpoint 상태를 확인한다.
2. `/api/cgv/theaters`, `/api/megabox/theaters`, `/api/lottecinema/theaters` 로 영화관 후보를 찾는다.
3. 날짜 표현은 Asia/Seoul 기준 `YYYYMMDD` 로 바꾼다.
4. `/api/cgv/movies`, `/api/megabox/movies`, `/api/lottecinema/movies` 로 상영작을 확인한다.
5. CGV는 `/api/cgv/timetable` 로 시간표를 본다.
6. 메가박스와 롯데시네마는 `/api/megabox/seats`, `/api/lottecinema/seats` 로 잔여석을 본다.
7. 예매와 결제는 자동화하지 않는다.

## 응답 원칙

- 기준 체인과 지점을 먼저 쓴다.
- 상영작과 시간표는 필요한 만큼만 보여준다.
- 잔여석은 조회 시점의 참고값으로 말한다.
- 영화관 공식 앱이나 웹에서 예매 직전 다시 확인하라고 안내한다.

## 실패 모드

- public endpoint가 일시적으로 5xx를 줄 수 있다.
- 넓은 지역 키워드는 여러 지점을 섞을 수 있다.
- 시간표와 잔여석은 빠르게 바뀔 수 있다.
- theaterId, movieId가 있으면 keyword보다 그 값을 우선한다.

## 출처

- 원본 repo: `https://github.com/hmmhmmhm/daiso-mcp`
- npm package: `https://www.npmjs.com/package/daiso`
- CGV theaters API: `https://mcp.aka.page/api/cgv/theaters`
- CGV movies API: `https://mcp.aka.page/api/cgv/movies`
- CGV timetable API: `https://mcp.aka.page/api/cgv/timetable`
- Megabox theaters API: `https://mcp.aka.page/api/megabox/theaters`
- Megabox movies API: `https://mcp.aka.page/api/megabox/movies`
- Megabox seats API: `https://mcp.aka.page/api/megabox/seats`
- Lotte Cinema theaters API: `https://mcp.aka.page/api/lottecinema/theaters`
- Lotte Cinema movies API: `https://mcp.aka.page/api/lottecinema/movies`
- Lotte Cinema seats API: `https://mcp.aka.page/api/lottecinema/seats`
