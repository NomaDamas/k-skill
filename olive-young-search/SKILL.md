---
name: olive-young-search
description: upstream daiso CLI를 사용해 올리브영 매장 검색, 상품 검색, 재고 확인을 조회한다.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# Olive Young Search

## What this skill does

upstream 원본 [`hmmhmmhm/daiso-mcp`](https://github.com/hmmhmmhm/daiso-mcp) 와 npm package [`daiso`](https://www.npmjs.com/package/daiso) 를 그대로 사용해 **올리브영 매장 검색, 상품 검색, 재고 확인** 흐름을 안내한다.

이 저장소는 원본 MCP 서버 코드를 vendoring 하지 않는다. 대신 **MCP 서버를 Claude Code에 직접 설치하지 않고 CLI 형태로 먼저 확인하는 경로**를 기본값으로 둔다.

핵심 조회 경로:

- 매장 검색: `/api/oliveyoung/stores`
- 상품 검색: `/api/oliveyoung/products`
- 재고 확인: `/api/oliveyoung/inventory`
- health check: `npx --yes daiso health`

## When to use

- "명동 근처 올리브영 매장 찾아줘"
- "올리브영 선크림 어떤 거 있나 보여줘"
- "명동 근처 올리브영에서 선크림 재고 확인해줘"
- "올리브영 검색용 CLI 붙여줘"

## When not to use

- 로그인, 주문, 장바구니, 결제 자동화
- 올리브영 계정/세션이 필요한 private 기능
- upstream 서버 코드를 이 저장소 안에 복사해서 유지하려는 경우

## Prerequisites

- 인터넷 연결
- `node` 20 권장 (`hmmhmmhm/daiso-mcp` 2026-04-05 기준 `engines.node` 는 `>=20 <21`)
- `npx` 또는 `npm`
- 필요하면 `git`

Node 22에서도 로컬 smoke test는 성공했지만 `EBADENGINE` 경고가 보여서, **안정 경로는 Node 20 LTS** 로 본다.

## Preferred setup: CLI first, not direct MCP install

가장 빠른 경로는 MCP 연결부터 하지 않고 upstream CLI로 공개 endpoint를 확인하는 것이다.

```bash
npx --yes daiso health
npx --yes daiso get /api/oliveyoung/stores --keyword 명동 --limit 5 --json
npx --yes daiso get /api/oliveyoung/products --keyword 선크림 --size 5 --json
npx --yes daiso get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json
```

반복 사용이면 전역 설치도 가능하다.

```bash
npm install -g daiso
export NODE_PATH="$(npm root -g)"
daiso health
```

## Fallback: clone the original repository and run the same CLI locally

public endpoint 재시도나 버전 고정이 필요하면 원본 저장소를 clone 해서 build 결과물 `dist/bin.js` 를 `node` 로 직접 실행한다.
clone checkout 안에서는 `npx daiso ...` 가 `Permission denied` 로 실패할 수 있으므로, local fallback은 아래 경로를 기본으로 둔다.

```bash
git clone https://github.com/hmmhmmhm/daiso-mcp.git
cd daiso-mcp
npm install
npm run build
node dist/bin.js health
node dist/bin.js get /api/oliveyoung/stores --keyword 명동 --limit 5 --json
node dist/bin.js get /api/oliveyoung/products --keyword 선크림 --size 5 --json
node dist/bin.js get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json
```

즉, 이 스킬의 기본 원칙은 **원본 `hmmhmmhm/daiso-mcp`를 설치/실행해서 쓰고, `k-skill`에는 가이드만 추가하는 것**이다.

## Required inputs

### 1. Store or area keyword first when place context is missing

- 권장 질문: `어느 지역/매장을 기준으로 볼까요? 예: 명동, 강남역, 성수`
- 재고 질문인데 지역이 없으면 먼저 지역/매장 키워드를 받는다.

### 2. Product keyword first when inventory is requested

- 권장 질문: `찾을 상품 키워드도 알려주세요. 예: 선크림, 립밤, 마스크팩`
- 상품 종류를 묻는 경우에도 키워드를 너무 넓게 받지 않는다.

## Workflow

### 1. Check server health

```bash
npx --yes daiso health
```

### 2. Resolve nearby stores

```bash
npx --yes daiso get /api/oliveyoung/stores --keyword 명동 --limit 5 --json
```

매장 후보가 여러 개면 상위 2~3개만 요약하고 다시 확인받는다.

### 3. Resolve product candidates

```bash
npx --yes daiso get /api/oliveyoung/products --keyword 선크림 --size 5 --json
```

상품 후보가 많으면 `goodsNumber`, 가격, 이미지 URL, `inStock` 여부를 함께 짧게 정리한다.

### 4. Check inventory for the chosen area/store keyword

```bash
npx --yes daiso get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json
```

응답의 `inventory.products[].storeInventory.stores[]` 안에서 다음 값을 우선 본다.

- `stockLabel`
- `remainQuantity`
- `stockStatus`
- `storeName`

### 5. Respond conservatively

최종 응답은 아래 순서로 짧게 정리한다.

- 기준 지역/매장 키워드
- 상위 매장 후보
- 상품 후보 또는 선택 상품
- 재고 있는 매장 / 품절 / 미판매 구분
- 필요하면 `imageUrl` 참고 링크
- 공개 endpoint 특성상 재고는 실시간 100% 보장값이 아니므로 방문 직전 재확인을 권장

## Done when

- `hmmhmmhm/daiso-mcp` 원본 repo와 `daiso` CLI 사용 경로를 명시했다.
- MCP 서버를 직접 설치하는 대신 CLI first 흐름을 제시했다.
- 매장 검색 → 상품 검색 → 재고 확인 순서를 따랐다.
- `/api/oliveyoung/stores`, `/api/oliveyoung/products`, `/api/oliveyoung/inventory` 중 필요한 호출을 실제로 안내했다.
- 재고 결과를 매장별 `stockLabel` 중심으로 요약했다.

## Failure modes

- public endpoint는 upstream 내부 수집 경로(Zyte 의존) 사정으로 간헐적인 5xx/503을 줄 수 있다.
- 지역 키워드가 너무 넓으면 멀리 떨어진 동명이점 매장이 섞일 수 있다.
- 인기 상품은 검색 결과가 많아 상위 몇 개만 먼저 확인받는 편이 안전하다.
- 재고 수량은 시점 차이로 실제 방문 시 달라질 수 있다.

## Notes

- 원본 프로젝트: `https://github.com/hmmhmmhm/daiso-mcp`
- npm package: `https://www.npmjs.com/package/daiso`
- 이 저장소는 upstream 코드를 vendoring 하지 않고 skill/docs만 유지한다.
