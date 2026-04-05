# 올리브영 검색 가이드

## 이 기능으로 할 수 있는 일

원본 [`hmmhmmhm/daiso-mcp`](https://github.com/hmmhmmhm/daiso-mcp) 와 npm package [`daiso`](https://www.npmjs.com/package/daiso) 를 사용해 올리브영 **매장 검색, 상품 검색, 재고 확인**을 한다.

- `/api/oliveyoung/stores` 로 매장 검색
- `/api/oliveyoung/products` 로 상품 검색
- `/api/oliveyoung/inventory` 로 재고 확인
- `npx --yes daiso health` 로 endpoint health 확인

## 가장 중요한 규칙

이 기능은 upstream 원본을 그대로 쓴다.
`k-skill` 안에 별도 올리브영 수집기를 추가하지 않고, **MCP 서버를 Claude Code에 직접 설치하지 않고 CLI로 먼저 검증하는 경로**를 기본으로 둔다.
즉, 원본 서버 코드를 이 저장소에 **vendoring 하지 않고** skill/docs 가이드만 유지한다.

즉 기본 경로는 아래 둘 중 하나다.

1. `npx --yes daiso ...`
2. `git clone https://github.com/hmmhmmhm/daiso-mcp.git && cd daiso-mcp && npm install && npm run build`

## 먼저 필요한 것

- 인터넷 연결
- `node` 20 권장
- `npx` 또는 `npm`
- 필요하면 `git`

2026-04-05 기준 upstream `package.json` 의 `engines.node` 는 `>=20 <21` 이다.
로컬 Node 22 환경에서도 smoke test는 통과했지만 `EBADENGINE` 경고가 있었으므로, 운영 가이드는 Node 20 LTS 중심으로 적는다.

## 가장 빠른 시작: npx CLI

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

## 원본 저장소 clone fallback

public endpoint 재시도, 버전 고정, 원본 확인이 필요하면 아래처럼 clone 후 build 결과물 `dist/bin.js` 를 `node` 로 직접 실행한다.
clone checkout 안에서는 `npx daiso ...` 가 `Permission denied` 로 실패할 수 있으므로 이 경로를 기본으로 적는다.

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

## 입력값 권장 순서

1. **지역/매장 키워드**
   - 예: `명동`, `강남역`, `성수`
2. **상품 키워드**
   - 예: `선크림`, `립밤`, `마스크팩`

재고 질문인데 지역/매장 키워드가 없으면 먼저 지역을 보강한다.
상품 종류를 묻는 경우에는 먼저 `/api/oliveyoung/products` 로 후보를 보여주고, 재고 확인이 필요할 때 `/api/oliveyoung/inventory` 로 내려간다.

## 기본 흐름

### 1. health 확인

```bash
npx --yes daiso health
```

### 2. 매장 검색

```bash
npx --yes daiso get /api/oliveyoung/stores --keyword 명동 --limit 5 --json
```

### 3. 상품 검색

```bash
npx --yes daiso get /api/oliveyoung/products --keyword 선크림 --size 5 --json
```

응답에서는 `goodsNumber`, `goodsName`, `priceToPay`, `imageUrl`, `inStock` 를 먼저 본다.

### 4. 재고 확인

```bash
npx --yes daiso get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json
```

재고 응답에서는 `inventory.products[].storeInventory.stores[]` 안의 아래 필드를 우선 해석한다.

- `stockLabel` (`재고 9개 이상`, `품절`, `미판매` 등)
- `remainQuantity`
- `stockStatus`
- `storeName`

## 응답 정리 원칙

- 매장 후보가 많으면 상위 2~3개만 먼저 제시한다.
- 상품 후보가 많으면 가격, 이미지 URL, `inStock` 여부를 붙여 상위 3~5개만 요약한다.
- 재고는 `재고 있음 / 품절 / 미판매` 를 매장별로 분리해서 쓴다.
- `imageUrl` 이 있으면 query string(`?l=ko`)을 지우지 않는다.
- 공개 endpoint 특성상 방문 직전 재확인을 권한다.

## 라이브 확인 메모

2026-04-05 기준 아래 흐름을 실제로 실행해 응답을 확인했다.

- `npx --yes daiso health` → `status: ok`, endpoint `https://mcp.aka.page/mcp`
- local clone + build 후 `node dist/bin.js get /api/oliveyoung/stores --keyword 명동 --limit 3 --json`
  - `명동타임워크점`, `명동2가점`, `올리브영 명동 타운` 등 매장 후보 확인
- local clone + build 후 `node dist/bin.js get /api/oliveyoung/products --keyword 선크림 --size 3 --json`
  - `totalCount: 435`, `imageUrl`, `priceToPay`, `inStock` 포함 상품 후보 확인
- local clone + build 후 `node dist/bin.js get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 3 --json`
  - `stockLabel: 재고 9개 이상 / 품절 / 미판매`, `remainQuantity`, `storeName` 확인

같은 날짜에 public `npx --yes daiso get /api/oliveyoung/stores ...` 는 한 차례 `Zyte API 호출 실패: 503 Service Unavailable` 를 반환했다. 그래서 문서 기본 경로는 여전히 CLI first 이지만, **재시도 또는 clone fallback** 을 함께 안내한다.

## 제한사항

- public endpoint는 upstream 수집 인프라 상태에 따라 간헐적 5xx/503이 날 수 있다.
- 넓은 지역 키워드는 먼 지점까지 섞일 수 있다.
- 재고 수량은 실시간 100% 보장값이 아니다.
- 주문/결제 자동화는 다루지 않는다.

## 참고 링크

- 원본 repo: `https://github.com/hmmhmmhm/daiso-mcp`
- npm package: `https://www.npmjs.com/package/daiso`
- Olive Young stores API: `https://mcp.aka.page/api/oliveyoung/stores`
- Olive Young products API: `https://mcp.aka.page/api/oliveyoung/products`
- Olive Young inventory API: `https://mcp.aka.page/api/oliveyoung/inventory`
