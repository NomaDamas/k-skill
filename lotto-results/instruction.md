# Lotto Results

## What this skill does

`k-lotto` 패키지로 동행복권 로또 최신 회차, 특정 회차, 상세 당첨 결과, 번호 대조를 처리한다.

## When to use

- "이번 주 로또 번호 뭐야"
- "1210회 당첨번호 알려줘"
- "내 번호가 몇 등인지 봐줘"

## Prerequisites

- Node.js 18+
- 배포 후: `npm install -g k-lotto`
- 실행 전: `export NODE_PATH="$(npm root -g)"`
- 이 저장소에서 개발할 때: 루트에서 `npm install`

## Inputs

- 회차 번호 또는 "latest"
- 선택 사항: 사용자가 가진 6개 번호

## Workflow

### 0. Install the package globally when missing

`node -e 'require("k-lotto")'` 가 실패하면 다른 구현으로 우회하지 말고 전역 Node 패키지 설치를 먼저 시도한다.

```bash
npm install -g k-lotto
export NODE_PATH="$(npm root -g)"
```

패키지가 없다는 이유로 HTML 파서를 다시 짜거나 다른 비공식 소스를 찾지 않는다.

### 1. Get the latest round when needed

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const lotto = require("k-lotto");
lotto.getLatestRound().then((round) => console.log(round));
JS
```

### 2. Fetch result or detailed payout data

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const lotto = require("k-lotto");
lotto.getDetailResult(1216).then((result) => console.log(JSON.stringify(result, null, 2)));
JS
```

### 3. Check user's numbers when provided

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const lotto = require("k-lotto");
lotto.checkNumber(1216, ["3", "10", "14", "15", "23", "24"])
  .then((result) => console.log(JSON.stringify(result, null, 2)));
JS
```

## Done when

- 최신 또는 요청 회차의 번호가 확인되어 있다
- 상세 요청이면 추첨일과 당첨금 분포가 정리되어 있다
- 번호 대조 요청이면 일치 번호와 등수가 확인되어 있다

## Failure modes

- 최신 회차는 결과 페이지 HTML에서 읽기 때문에 upstream HTML 변경의 영향을 받을 수 있다
- 상세 회차 정보는 동행복권 JSON 응답 스키마 변경의 영향을 받을 수 있다

## Notes

- 사용자 번호를 받아도 영구 저장하지 않는다
- 조회 전용 스킬이다
