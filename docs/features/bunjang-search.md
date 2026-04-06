# 번개장터 검색 가이드

## 이 기능으로 할 수 있는 일

upstream [`bunjang-cli`](https://www.npmjs.com/package/bunjang-cli) / [`pinion05/bunjangcli`](https://github.com/pinion05/bunjangcli) 를 사용해 번개장터 **검색, 상세조회, 선택적 찜/채팅, 대량 수집, AI TOON export** 를 처리한다.

- `search` 로 검색
- `item get` / `item list` 로 상세조회
- `favorite add` / `favorite remove` / `favorite list` 로 선택적 찜 관리
- `chat list` / `chat start` / `chat send` 로 선택적 채팅
- `--start-page`, `--pages`, `--max-items`, `--with-detail`, `--output` 으로 대량 수집
- `--ai --output <directory>` 로 TOON chunk 저장

## 가장 중요한 규칙

이 기능은 upstream 원본을 그대로 쓴다.
`k-skill` 안에 번개장터 수집기를 새로 넣지 않고, **CLI first** 문서/스킬만 유지한다.
즉 기본 경로는 아래다.

1. `npx --yes bunjang-cli ...`
2. 반복 사용이면 `npm install -g bunjang-cli`

## 먼저 필요한 것

- 인터넷 연결
- `node` 22+
- `npx` 또는 `npm`
- 선택적으로 interactive TTY 터미널

2026-04-06 기준 `npm view bunjang-cli version` 은 `0.2.1` 이고, README 요구 사항은 Node.js 22+ 다.

## 가장 빠른 시작: npx CLI

```bash
npx --yes bunjang-cli --help
npx --yes bunjang-cli --json auth status
npx --yes bunjang-cli --json search "아이폰" --max-items 3 --sort date
npx --yes bunjang-cli --json item get 354957625
```

반복 사용이면 전역 설치도 가능하다.

```bash
npm install -g bunjang-cli
export NODE_PATH="$(npm root -g)"
bunjang-cli --help
```

## 로그인은 선택적 interactive 플로우

```bash
npx --yes bunjang-cli auth login
npx --yes bunjang-cli auth logout
npx --yes bunjang-cli --json auth status
```

- `auth login` 은 브라우저에서 로그인 후 **터미널로 돌아와 Enter 를 눌러야** 완료된다.
- 즉 **TTY / interactive 세션** 이 아닌 환경에서는 로그인 완료 처리가 멈출 수 있다.
- 그래서 기본 문서는 검색/상세조회/대량 수집을 먼저 안내하고, 찜/채팅은 로그인된 경우에만 선택적으로 진행한다.

## 기본 흐름

### 1. 검색

```bash
npx --yes bunjang-cli search "아이폰"
npx --yes bunjang-cli search "아이폰" --price-min 500000 --price-max 1200000
npx --yes bunjang-cli search "아이폰" --sort date
npx --yes bunjang-cli --json search "아이폰" --max-items 5
```

검색 결과에는 매입글/광고/악세서리 글이 섞이고, live `search` payload 에서는 `location` 이 noisy 하거나 `description` / `status` 가 빠질 수 있다. 그래서 **검색 단계는 제목/가격 중심 1차 triage** 로만 쓰고, 세부 판단은 상세조회 이후로 미룬다.

### 2. 상세조회

```bash
npx --yes bunjang-cli item get 354957625
npx --yes bunjang-cli --json item get 354957625
npx --yes bunjang-cli --json item list --ids 354957625,354801707
```

상세에서는 `price`, `description`, `location`, `category`, `status`, `sellerName`, `sellerReviewCount`, `favoriteCount`, `transportUsed` 를 우선 본다. 즉 `description` / `status` / 믿을 만한 `location` 이 필요하면 **반드시 `item get` 또는 `--with-detail` 이후** 에만 판정한다.

### 3. 대량 수집

```bash
npx --yes bunjang-cli search "아이폰" \
  --start-page 1 \
  --pages 5 \
  --max-items 50 \
  --sort date \
  --with-detail \
  --output artifacts/bunjang-iphone.json
```

export 검증 시에는 결과 파일 존재 여부와 top-level `items[]` 안의 `summary` / `detail` / optional `error` 구조, item 별 `sourcePage` 또는 `summary.raw.page` 를 함께 확인한다.

### 4. AI TOON chunk

```bash
npx --yes bunjang-cli search "아이폰" \
  --start-page 1 \
  --pages 5 \
  --max-items 50 \
  --with-detail \
  --ai \
  --output artifacts/bunjang-iphone-ai
```

- `--ai` 에서는 `--output` 이 **디렉토리** 여야 한다.
- 결과는 `items-1.toon` 같은 chunk 로 나뉜다.
- 대량 후보를 여러 에이전트에게 분산 평가시키기 좋다.

### 5. 찜/채팅은 로그인 후에만

```bash
npx --yes bunjang-cli --json favorite list
npx --yes bunjang-cli --json favorite add 354957625
npx --yes bunjang-cli --json favorite remove 354957625
npx --yes bunjang-cli --json chat list
npx --yes bunjang-cli --json chat start 354957625 --message "안녕하세요"
npx --yes bunjang-cli --json chat send 84191651 --message "상품 상태 괜찮을까요?"
```

- `favorite` 와 `chat` 은 **로그인이 필요한 선택적 기능**이다.
- 기본 검색/분석 요청이라면 실행하지 않고 명령만 안내한다.
- 검증이 필요하면 `favorite list` 로 세션을 먼저 확인한 뒤 add/remove 를 왕복 실행한다.

## 라이브 확인 메모

2026-04-06 기준 아래 흐름을 실제로 실행해 응답을 확인했다.

- `npx --yes bunjang-cli --help` → top-level commands (`auth`, `search`, `item`, `chat`, `favorite`, `purchase`) 확인
- `npx --yes bunjang-cli --json auth status` → `authenticated: false`, `headfulLoginRequired: true` 확인
- `npx --yes bunjang-cli --json search "아이폰" --max-items 1` → `items[0].id = 354957625`, `transportUsed = browser` 확인
- `npx --yes bunjang-cli --json item get 354957625` → `description`, `location`, `sellerReviewCount`, `favoriteCount`, `transportUsed = api` 확인

같은 날짜에 `search` summary 는 title/price 중심 triage 용으로만 안전했고, `status` / `description` 은 summary 에서 안정적으로 오지 않았다. 그래서 문서에서는 상세 필드 의존 판단을 `item get` / `--with-detail` 뒤로 고정한다.

같은 날짜에 `favorite list` 는 로그인 브라우저를 띄운 뒤 터미널 Enter 를 기다렸다. 그래서 문서에서는 찜/채팅을 **로그인 후 선택적으로만 실행** 하도록 고정한다.

## 제한사항

- 로그인 없는 환경에서는 찜/채팅/구매 흐름을 바로 검증하기 어렵다.
- 검색 결과에는 매입글/광고/악세서리 노이즈가 섞일 수 있다.
- DOM/API 변경에 따라 browser transport 동작이 깨질 수 있다.
- 구매 자동 확정/결제는 다루지 않는다.

## 참고 링크

- npm package: `https://www.npmjs.com/package/bunjang-cli`
- upstream repo: `https://github.com/pinion05/bunjangcli`
