# 쿠팡 상품 검색 가이드

## 이 기능으로 할 수 있는 일

[retention-corp/coupang_partners](https://github.com/retention-corp/coupang_partners)의 로컬 Coupang MCP 호환 레이어를 이용해 쿠팡 상품 조회 도구를 실행한다. 기존 HF Space 기반 `coupang-mcp` 서버 대신 upstream 저장소의 `bin/coupang_mcp.py`를 `local://coupang-mcp` 계약으로 호출한다.

- 키워드 상품 검색
- 로켓배송 전용 필터 검색
- 가격대 범위 검색
- 상품 비교표 생성
- 카테고리별 베스트 상품, 골드박스 당일 특가
- 인기 검색어/계절 상품 추천

## 동작 방식

```
Codex/Claude Code → coupang_partners_mcp.py → retention-corp/coupang_partners checkout → bin/coupang_mcp.py → local://coupang-mcp → Coupang Partners API client
```

- **구형 hosted endpoint 제거** — 이전 HF Space 기반 MCP 서버를 사용하지 않는다.
- **upstream 고정** — 래퍼는 `https://github.com/retention-corp/coupang_partners.git`를 clone/update한 뒤 upstream CLI에 위임한다.
- **secret은 runtime 환경변수** — 실제 Coupang Partners API 호출이 필요한 운영 환경에서는 `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` 등을 환경변수로 주입한다. 키를 저장소나 답변에 노출하지 않는다.
- **계약 확인 우선** — `tools`/`init` 명령으로 로컬 MCP 호환 도구 목록과 JSON-RPC payload 형태를 먼저 확인한다.

## MCP 계약

```
local://coupang-mcp
```

프로토콜 호환 버전: MCP `2025-03-26`. 네트워크 Streamable HTTP 서버가 아니라 upstream 저장소의 로컬 CLI가 같은 도구 이름을 제공한다.

## 사용 가능한 도구

| 도구명 | CLI 명령 | 기능 | 사용 예시 |
|--------|----------|------|----------|
| `search_coupang_products` | `search` | 일반 상품 검색 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py search "맥북"` |
| `search_coupang_rocket` | `rocket` | 로켓배송만 필터링 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py rocket "에어팟"` |
| `search_coupang_budget` | `budget` | 가격대 범위 검색 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py budget "키보드" --max-price 100000` |
| `compare_coupang_products` | `compare` | 상품 비교표 생성 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py compare "아이패드 vs 갤럭시탭"` |
| `get_coupang_recommendations` | `recommendations` | 인기 검색어 제안 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py recommendations --category 전자제품` |
| `get_coupang_seasonal` | `seasonal` | 계절/상황별 추천 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py seasonal "설날 선물"` |
| `get_coupang_best_products` | `best` | 카테고리별 베스트 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py best --category-id 1016` |
| `get_coupang_goldbox` | `goldbox` | 당일 특가 정보 | `python3 coupang-product-search/scripts/coupang_partners_mcp.py goldbox --limit 10` |

## 기본 흐름

1. 검색어를 받는다. 너무 넓으면 용도/예산/브랜드를 먼저 물어본다.
2. `tools`와 `init` 명령으로 retention-corp/coupang_partners 로컬 MCP 도구 목록과 handshake payload를 확인한다.
3. 요청에 맞는 CLI 명령을 실행한다.
4. `data.result`를 읽고 로켓배송/일반배송을 구분하여 정리한다.
5. 상위 3~5개 추천과 함께 가격/배송 정보, 변동 가능성을 제공한다.

## 호출 예시

```bash
# 1. 최초 실행: upstream checkout을 자동 clone하고 도구 목록 확인
python3 coupang-product-search/scripts/coupang_partners_mcp.py tools
python3 coupang-product-search/scripts/coupang_partners_mcp.py init

# 2. 이미 clone된 upstream을 명시해서 네트워크 없이 계약 확인
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir ~/.cache/k-skill/coupang_partners \
  --no-clone \
  tools
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir ~/.cache/k-skill/coupang_partners \
  --no-clone \
  init

# 3. 기존 checkout을 fast-forward로 최신화한 뒤 계약 확인
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir ~/.cache/k-skill/coupang_partners \
  --update \
  tools

# 4. 상품 검색
python3 coupang-product-search/scripts/coupang_partners_mcp.py search "생수"

# 5. 로켓배송 필터
python3 coupang-product-search/scripts/coupang_partners_mcp.py rocket "에어팟"
```

## 결과 형식

upstream CLI는 다음과 같은 JSON envelope를 반환한다.

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

사용자 답변은 짧은 비교표 형태로 정리한다.

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

## 제한사항

- 가격/품절/배송 정보는 실시간으로 바뀔 수 있다.
- 로그인, 장바구니, 결제 자동화는 지원하지 않는다.
- live 상품/API 호출은 upstream Coupang Partners 클라이언트와 운영 환경변수 설정에 의존한다.
- upstream checkout이 없고 네트워크 clone도 막힌 환경에서는 `--repo-dir`로 기존 checkout을 지정해야 한다.

## 출처

- [retention-corp/coupang_partners GitHub](https://github.com/retention-corp/coupang_partners)
- 로컬 MCP 계약: `local://coupang-mcp`
- 래퍼: `coupang-product-search/scripts/coupang_partners_mcp.py`
