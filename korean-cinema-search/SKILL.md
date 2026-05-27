---
name: korean-cinema-search
description: CGV, 메가박스, 롯데시네마 영화관 검색, 상영작, 시간표, 잔여석 조회가 필요할 때 사용한다.
license: MIT
metadata:
  category: entertainment
  locale: ko-KR
  phase: v1
---

# Korean Cinema Search

## What this skill does

upstream 원본 [`hmmhmmhm/daiso-mcp`](https://github.com/hmmhmmhm/daiso-mcp) 와 npm package [`daiso`](https://www.npmjs.com/package/daiso) 를 사용해 **CGV, 메가박스, 롯데시네마 영화관 검색, 상영작, 시간표, 잔여석 조회**를 안내한다.

이 저장소는 upstream 코드를 vendoring 하지 않는다. 기본 경로는 **MCP 서버를 직접 설치하지 않고 CLI로 먼저 확인하는 방식**이다.

핵심 조회 경로:

- CGV: `/api/cgv/theaters`, `/api/cgv/movies`, `/api/cgv/timetable`
- 메가박스: `/api/megabox/theaters`, `/api/megabox/movies`, `/api/megabox/seats`
- 롯데시네마: `/api/lottecinema/theaters`, `/api/lottecinema/movies`, `/api/lottecinema/seats`
- health check: `npx --yes daiso health`

## When to use

- "강남 근처 CGV 찾아줘"
- "오늘 메가박스 코엑스 상영작 알려줘"
- "롯데시네마 월드타워 잔여석 확인해줘"
- "주변 영화관 시간표 비교해줘"

## When not to use

- 예매, 결제, 좌석 선점, 로그인 자동화
- 영화관 계정이나 멤버십 권한이 필요한 기능
- upstream 서버 코드를 이 저장소에 복사해서 유지하려는 경우

## Prerequisites

- 인터넷 연결
- `node` 20 권장
- `npx` 또는 `npm`
- 필요하면 `git`

## Preferred setup: CLI first

먼저 MCP 연결이 아니라 upstream CLI로 공개 endpoint를 확인한다.

날짜가 있는 요청은 Asia/Seoul 기준 `YYYYMMDD` 로 정규화하고 `--playDate <YYYYMMDD>` 를 항상 붙인다. 사용자가 오늘이라고 말하거나 날짜를 생략하면 KST 오늘 날짜를 계산한다.

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

반복 사용이면 전역 설치도 가능하다.

```bash
npm install -g daiso
export NODE_PATH="$(npm root -g)"
daiso health
```

## Fallback: clone the original repository

public endpoint 재시도나 버전 고정이 필요하면 원본 저장소를 clone 해서 build 결과물 `dist/bin.js` 를 직접 실행한다.

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

## Required inputs

### 1. Cinema chain

체인이 없으면 먼저 묻는다.

- 권장 질문: `어느 영화관을 볼까요? CGV, 메가박스, 롯데시네마 중 하나를 알려주세요.`

### 2. Theater or area keyword

지역이나 지점명이 없으면 바로 조회하지 말고 기준 위치를 받는다.

- 권장 질문: `어느 지역이나 지점을 기준으로 볼까요? 예: 강남, 코엑스, 월드타워`

### 3. Movie title when seats are requested

잔여석 질문인데 영화명이 없으면 먼저 영화 후보를 조회하거나 영화명을 물어본다.

### 4. Date

사용자가 날짜를 말하면 그 날짜를 우선한다. 날짜가 없으면 Asia/Seoul 기준 오늘을 `YYYYMMDD` 로 계산해 `--playDate <YYYYMMDD>` 로 넘긴다.

| 체인 | 후보 조회 | 상영작 | 시간표 또는 잔여석 | 날짜 |
| --- | --- | --- | --- | --- |
| CGV | `keyword`, 선택 `limit` | `keyword` 또는 `theaterId`, `playDate` | `keyword` 또는 `theaterId`, `movieId`, `playDate` | 필수로 명시 |
| 메가박스 | `keyword`, 선택 `limit` | `keyword` 또는 `theaterId`, `playDate` | `keyword` 또는 `theaterId`, `movieId`, `playDate` | 필수로 명시 |
| 롯데시네마 | `keyword`, 선택 `limit` | `keyword` 또는 `theaterId`, `playDate` | `keyword` 또는 `theaterId`, `movieId`, `playDate` | 필수로 명시 |

## Workflow

### 1. Check server health

```bash
npx --yes daiso health
```

### 2. Resolve theater candidates

```bash
npx --yes daiso get /api/cgv/theaters --keyword 강남 --limit 5 --json
```

후보가 여러 개면 상위 2개에서 3개만 요약하고 다시 확인받는다.

### 3. Resolve movie candidates

```bash
npx --yes daiso get /api/cgv/movies --keyword 강남 --playDate <YYYYMMDD> --json
```

영화 후보가 많으면 제목과 등급만 짧게 정리한다.

### 4. Check timetable or seats

CGV는 시간표 중심으로 본다.

```bash
npx --yes daiso get /api/cgv/timetable --keyword 강남 --playDate <YYYYMMDD> --json
```

메가박스와 롯데시네마는 잔여석 endpoint를 사용할 수 있다.

```bash
npx --yes daiso get /api/megabox/seats --keyword 코엑스 --playDate <YYYYMMDD> --limit 10 --json
npx --yes daiso get /api/lottecinema/seats --keyword 월드타워 --playDate <YYYYMMDD> --limit 10 --json
```

### 5. Respond conservatively

최종 응답은 짧게 정리한다.

- 영화관 체인
- 기준 지역이나 지점
- 상영작 또는 선택 영화
- 시간표와 잔여석
- 조회 시각과 공개 endpoint 특성상 변동 가능하다는 점

예매와 결제는 자동화하지 않는다.

## Done when

- `hmmhmmhm/daiso-mcp` 원본 repo와 `daiso` CLI 사용 경로를 명시했다.
- MCP 서버를 직접 설치하는 대신 CLI first 흐름을 제시했다.
- CGV, 메가박스, 롯데시네마 조회 범위를 구분했다.
- 영화관 검색, 상영작, 시간표, 잔여석 중 필요한 호출을 실제로 안내했다.
- 예매와 결제 자동화가 범위 밖임을 명시했다.

## Failure modes

- public endpoint는 upstream 상태에 따라 간헐적인 5xx를 줄 수 있다.
- 지역 키워드가 넓으면 다른 지점이 섞일 수 있다.
- 시간표와 잔여석은 시점에 따라 달라진다.
- 일부 체인은 상영작, 시간표, 잔여석 endpoint의 입력값이 다르므로 theaterId, movieId가 있으면 그 값을 우선 사용한다.

## Notes

- 원본 프로젝트: `https://github.com/hmmhmmhm/daiso-mcp`
- npm package: `https://www.npmjs.com/package/daiso`
- 이 저장소는 upstream 코드를 vendoring 하지 않고 skill/docs만 유지한다.
