---
name: bunjang-search
description: 번개장터 검색, 상세조회, 찜, 채팅, 대량 수집, AI TOON export를 bunjang-cli로 안내한다.
license: MIT
metadata:
  category: marketplace
  locale: ko-KR
  phase: v1
---

# Bunjang Search

## What this skill does

upstream [`bunjang-cli`](https://www.npmjs.com/package/bunjang-cli) / [`pinion05/bunjangcli`](https://github.com/pinion05/bunjangcli) 를 사용해 번개장터에서 아래 흐름을 처리한다.

- 상품 검색
- 상품 상세조회
- 선택적 찜/채팅
- 다페이지 대량 수집
- AI 분석용 TOON chunk export

## Core policy

- 기본 경로는 **항상 CLI first** 다.
- 기본 명령은 `npx --yes bunjang-cli ...` 형식을 쓴다.
- `auth login` 은 headful 브라우저 + **TTY / interactive 터미널**이 필요하다.
- 로그인 전에는 검색/상세조회/대량 수집 위주로 답하고, `favorite` / `chat` / `purchase` 는 **선택적 로그인 플로우**로만 안내한다.
- 대량 수집은 `--start-page`, `--pages`, `--max-items`, `--with-detail`, `--output` 조합을 우선 쓴다.
- AI 분석용 export 는 `--ai --output <directory>` 로 `.toon` chunk 를 만든다.
- 찜/채팅은 명시적으로 요청받지 않으면 실행하지 않는다.

## When to use

- "번개장터에서 아이폰 검색해줘"
- "번장에서 이 상품 상세 봐줘"
- "여러 페이지 모아서 JSON으로 저장해줘"
- "AI 평가용으로 번개장터 결과를 chunk 로 만들어줘"

## When not to use

- 계정 로그인 없이 바로 찜/채팅을 강행해야 하는 경우
- 구매 확정/결제 자동화를 기대하는 경우
- 번개장터 외 다른 중고거래 플랫폼을 동시에 다뤄야 하는 경우

## Quick smoke test

```bash
npx --yes bunjang-cli --help
npx --yes bunjang-cli --json auth status
npx --yes bunjang-cli --json search "아이폰" --max-items 3 --sort date
npx --yes bunjang-cli --json item get 354957625
```

## Login flow

```bash
npx --yes bunjang-cli auth login
npx --yes bunjang-cli auth logout
npx --yes bunjang-cli --json auth status
```

- `auth login` 은 브라우저에서 로그인한 뒤 **터미널로 돌아와 Enter 를 눌러야** 완료된다.
- 그래서 비-TTY 실행 대신 interactive 세션에서만 진행한다.

## Search flow

```bash
npx --yes bunjang-cli search "아이폰"
npx --yes bunjang-cli search "아이폰" --price-min 500000 --price-max 1200000
npx --yes bunjang-cli search "아이폰" --sort date
npx --yes bunjang-cli --json search "아이폰" --max-items 5
```

검색 결과는 광고/매입글/악세서리 노이즈가 섞이고, search summary 의 `location` 이 noisy 하거나 `description` / `status` 가 비어 있을 수 있다. 그래서 **검색 단계는 제목/가격 중심 1차 triage** 로만 쓴다.

- 기기명/용량 키워드 일치 여부
- 가격대 범위
- 판매 링크/썸네일 중복 여부

`description`, `status`, 깔끔한 `location` 이 필요하면 **반드시 `item get` 또는 `--with-detail` 이후** 에만 판단한다.

## Detail flow

```bash
npx --yes bunjang-cli item get 354957625
npx --yes bunjang-cli --json item get 354957625
npx --yes bunjang-cli --json item list --ids 354957625,354801707
```

상세조회에서는 아래 필드를 먼저 읽는다.

- `price`
- `description`
- `location`
- `category`
- `status`
- `sellerName`
- `sellerItemCount`
- `sellerFollowerCount`
- `sellerReviewCount`
- `favoriteCount`
- `transportUsed`

## Bulk collection

```bash
npx --yes bunjang-cli search "아이폰" \
  --start-page 1 \
  --pages 5 \
  --max-items 50 \
  --sort date \
  --with-detail \
  --output artifacts/bunjang-iphone.json
```

검증할 때는 export 파일 생성 여부와 top-level `items[]` 안의 `summary` / `detail` / optional `error` 구조, 그리고 각 item 의 `sourcePage` 또는 `summary.raw.page` 를 같이 확인한다.

## AI export

```bash
npx --yes bunjang-cli search "아이폰" \
  --start-page 1 \
  --pages 5 \
  --max-items 50 \
  --with-detail \
  --ai \
  --output artifacts/bunjang-iphone-ai
```

- `--ai` 에서는 `--output` 이 **파일이 아니라 디렉토리** 여야 한다.
- 결과는 `items-1.toon` 형태 chunk 로 저장된다.
- AI 평가용으로 여러 서브에이전트에 분산 읽기시키기 좋다.

## Optional favorite/chat flow

로그인된 interactive 세션에서만 아래 액션을 진행한다.

```bash
npx --yes bunjang-cli --json favorite list
npx --yes bunjang-cli --json favorite add 354957625
npx --yes bunjang-cli --json favorite remove 354957625
npx --yes bunjang-cli --json chat list
npx --yes bunjang-cli --json chat start 354957625 --message "안녕하세요"
npx --yes bunjang-cli --json chat send 84191651 --message "상품 상태 괜찮을까요?"
```

- 찜/채팅은 **로그인이 필요한 선택적 기능**이다.
- 검증 목적이면 `favorite list` 로 세션을 먼저 확인하고, 같은 상품에 대해 `favorite add` / `favorite remove` 를 왕복 실행한다.
- `chat start` 는 상품 페이지에서 새 대화를 열 때, `chat send` 는 기존 thread 에 메시지를 보낼 때 쓴다.

## Recommended response format

1. 검색어가 넓으면 예산/모델/지역을 먼저 좁힌다.
2. 검색 결과 상위 3~5개는 제목/가격 중심 1차 요약만 한다.
3. `description` / `status` / `location` 판단이 필요하면 `item get` 또는 `--with-detail` 로 상세를 먼저 읽는다.
4. 로그인 액션이 필요하면 "지금은 로그인 세션이 없으니 interactive TTY 에서 `auth login` 후 다시 진행" 이라고 분명히 말한다.
5. 대량 분석이면 JSON export 또는 TOON chunk 생성 경로를 제안한다.

## Done when

- 검색/상세조회/대량 수집/AI export 중 필요한 경로가 안내되었다.
- 찜/채팅은 로그인 필요성과 선택적 성격이 명확히 고지되었다.
- 자동 구매/결제는 범위 밖이라고 분명히 말했다.
