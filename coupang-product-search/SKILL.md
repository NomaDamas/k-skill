---
name: coupang-product-search
description: retention-corp/coupang_partners의 로컬 Coupang MCP 호환 레이어로 쿠팡 상품 검색, 로켓배송 필터, 가격대 검색, 상품 비교, 베스트 상품, 골드박스 특가를 조회한다.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v2
---

# Coupang Product Search

## What this skill does

[retention-corp/coupang_partners](https://github.com/retention-corp/coupang_partners) 저장소의 로컬 Coupang MCP 호환 레이어를 사용해 쿠팡 상품 조회 도구를 실행한다. 기존 유지보수형 HF Space MCP 엔드포인트 대신, 이 저장소의 `bin/coupang_mcp.py`가 제공하는 `local://coupang-mcp` 계약을 호출한다.

- 키워드 상품 검색
- 로켓배송 전용 필터 검색
- 가격대 범위 검색
- 상품 비교표 생성
- 카테고리별 베스트 상품
- 골드박스 당일 특가
- 인기 검색어/계절 상품 추천

## How it works

```
Claude Code / Codex
  → coupang-product-search/scripts/coupang_partners_mcp.py
    → git clone/update retention-corp/coupang_partners (user cache)
      → python3 bin/coupang_mcp.py
        → local://coupang-mcp compatible tool layer
          → Coupang Partners API client
```

Hard rules:

- `COUPANG_MCP_ENDPOINT`는 호환성 knob로만 유지한다. 기본값은 `local://coupang-mcp`다.
- 구형 HF Space hosted MCP 엔드포인트를 사용하거나 새로 지어내지 않는다.
- upstream 저장소는 `https://github.com/retention-corp/coupang_partners.git`만 사용한다.
- 실제 상품/API 호출은 upstream Coupang Partners 클라이언트 정책을 따른다. 운영 환경에서는 `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` 같은 runtime secret을 환경변수로 제공하고, 키를 문서/로그/커밋에 노출하지 않는다.
- `tools`와 `init`은 로컬 MCP 계약 확인용으로 먼저 실행한다.

## MCP endpoint / contract

```
local://coupang-mcp
```

프로토콜 호환 버전: MCP `2025-03-26`. 네트워크로 붙는 Streamable HTTP 서버가 아니라, upstream 저장소의 로컬 MCP 호환 CLI가 같은 도구 이름과 JSON-RPC 모양의 payload를 반환한다.

## When to use

- "쿠팡에서 생수 가격 좀 찾아줘"
- "로켓배송 에어팟 찾아줘"
- "20만원 이하 키보드 추천해줘"
- "아이패드 vs 갤럭시탭 비교"
- "오늘 쿠팡 특가 뭐 있어?"
- "전자제품 베스트 보여줘"

## When not to use

- 로그인, 장바구니, 결제 자동화가 필요한 경우
- 쿠팡 계정/session 접근이 필요한 경우
- Coupang Partners API 사용 권한이나 운영 backend가 전혀 없는데 live 상품 가격을 보장해야 하는 경우

## Workflow

### 1. Clarify the need

검색어가 너무 넓으면 먼저 의도를 좁힌다.

- 권장 질문: `어떤 용도/예산/브랜드/용량을 우선할까요?`

### 2. Bootstrap and check the tool contract

래퍼는 기본적으로 `~/.cache/k-skill/coupang_partners`에 upstream 저장소를 clone한다. 이미 clone되어 있으면 그대로 사용하고, 최신화가 필요할 때만 `--update`를 붙인다.

```bash
python3 coupang-product-search/scripts/coupang_partners_mcp.py tools
python3 coupang-product-search/scripts/coupang_partners_mcp.py init
```

기존 checkout을 명시하거나 CI/검증에서 네트워크 clone을 막으려면:

```bash
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir /path/to/coupang_partners \
  --no-clone \
  tools
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir /path/to/coupang_partners \
  --no-clone \
  init
```

### 3. Call tools

구체적인 사용자 요청에 맞춰 upstream CLI 명령을 호출한다. 결과는 `ok`, `data.tool`, `data.payload`, `data.result`를 포함하는 JSON으로 반환된다.

```bash
# 일반 검색
python3 coupang-product-search/scripts/coupang_partners_mcp.py search "32인치 4K 모니터"

# 로켓배송 필터
python3 coupang-product-search/scripts/coupang_partners_mcp.py rocket "에어팟"

# 가격대 검색
python3 coupang-product-search/scripts/coupang_partners_mcp.py budget "키보드" --max-price 100000

# 비교
python3 coupang-product-search/scripts/coupang_partners_mcp.py compare "아이패드 vs 갤럭시탭"

# 골드박스
python3 coupang-product-search/scripts/coupang_partners_mcp.py goldbox
```

## Available tools

| 도구명 | CLI 명령 | 기능 | 파라미터 예시 |
|--------|----------|------|-------------|
| `search_coupang_products` | `search` | 일반 상품 검색 | `"생수"` |
| `search_coupang_rocket` | `rocket` | 로켓배송만 필터링 | `"에어팟"` |
| `search_coupang_budget` | `budget` | 가격대 범위 검색 | `"키보드" --max-price 100000` |
| `compare_coupang_products` | `compare` | 상품 비교표 생성 | `"아이패드 vs 갤럭시탭"` |
| `get_coupang_recommendations` | `recommendations` | 인기 검색어 제안 | `--category 전자제품` |
| `get_coupang_seasonal` | `seasonal` | 계절/상황별 추천 | `"설날 선물"` |
| `get_coupang_best_products` | `best` | 카테고리별 베스트 | `--category-id 1016` |
| `get_coupang_goldbox` | `goldbox` | 당일 특가 정보 | `--limit 10` |

## Response format

upstream CLI는 JSON을 출력한다. `data.result` 안의 상품 배열 또는 도구별 객체를 읽고, 답변에서는 로켓배송(rocket)과 일반배송(normal)을 구분한다.

```json
{
  "ok": true,
  "data": {
    "session_id": "session-...",
    "tool": "search_coupang_products",
    "payload": {
      "jsonrpc": "2.0",
      "result": {
        "content": [
          {"type": "text", "text": "[...]"}
        ]
      }
    },
    "result": []
  }
}
```

사용자에게 보여줄 때는 다음처럼 짧게 정리한다.

```
## rocket (상위 후보)

1) LG전자 4K UHD 모니터
   가격: 397,750원 (참고용)
   보러가기: https://link.coupang.com/a/...

## normal (상위 후보)

1) 삼성전자 QHD 오디세이 G5 게이밍 모니터
   가격: 283,000원 (참고용)
   보러가기: https://link.coupang.com/a/...
```

## Response policy

- 후보가 여러 개면 상위 3~5개만 짧게 비교한다.
- 로켓배송/일반배송 구분을 명시한다.
- 가격/품절/배송 정보는 실시간 변동될 수 있음을 안내한다.
- upstream checkout, 권한, Coupang Partners 환경변수 문제로 실패하면 실패 원인과 재시도/설정 방법을 짧게 안내한다.
- affiliate/deeplink가 포함될 때는 필요한 고지 문구를 누락하지 않는다.

## Done when

- `tools`와 `init` 또는 실제 명령으로 retention-corp/coupang_partners 로컬 MCP 계약을 확인했다.
- 검색 결과가 로켓배송/일반배송으로 구분되어 정리되었다.
- 사용자 니즈에 맞는 추천 TOP 3이 제시되었다.
- 가격/배송 정보와 변동 가능성 안내가 포함되었다.
