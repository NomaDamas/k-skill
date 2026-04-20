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
Codex/Claude Code → coupang_partners_mcp.py → retention-corp/coupang_partners checkout → bin/coupang_mcp.py → local://coupang-mcp
  ├─ operator: Coupang Partners API (local HMAC)
  └─ credentialless: hosted fallback → https://a.retn.kr/v1/public/assist
```

- **구형 hosted endpoint 제거** — 이전 HF Space 기반 MCP 서버를 사용하지 않는다.
- **upstream 고정** — 래퍼는 `https://github.com/retention-corp/coupang_partners.git`를 clone/update한 뒤 upstream CLI에 위임한다.
- **이중 실행 경로** — `COUPANG_ACCESS_KEY`/`COUPANG_SECRET_KEY`가 둘 다 있으면 upstream이 로컬 HMAC으로 Coupang Partners API를 호출하고, 없으면 자동으로 Retention Corp의 hosted 백엔드(`https://a.retn.kr/v1/public/assist`)로 떨어져 공개 추천/검색을 반환한다(hosted fallback). 래퍼는 두 경로를 자동 선택한다.
- **allowlist** — hosted fallback은 `X-OpenClaw-Client-Id` allowlist로 게이트되어 있다. upstream이 기본으로 실어 보내는 `openclaw-skill` 값이 현재 Retention Corp allowlist에 등록되어 있어 credentialless 호출이 200을 받는다. k-skill 래퍼는 이 기본값을 그대로 사용하고 `OPENCLAW_SHOPPING_CLIENT_ID`를 오버라이드하지 않는다. Retention Corp 측 allowlist 정책이 바뀌면 그때 맞춰 가이드를 갱신한다.
- **secret은 runtime 환경변수** — 운영자 모드에서는 `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`를 환경변수로 주입한다. 키를 저장소나 답변에 노출하지 않는다.
- **계약 확인 우선** — `tools`/`init` 명령으로 로컬 MCP 호환 도구 목록과 JSON-RPC payload 형태를 먼저 확인한다.

## MCP 계약

```
local://coupang-mcp
```

프로토콜 호환 버전: MCP `2025-03-26`. 네트워크 Streamable HTTP 서버가 아니라 upstream 저장소의 로컬 CLI가 같은 도구 이름을 제공한다.

## 환경변수

| 환경변수 | 역할 | 기본값 |
|---------|------|--------|
| `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` | 운영자 Coupang Partners API 크리덴셜. 둘 다 있을 때만 로컬 HMAC 경로가 활성화된다. | 없음 (없으면 hosted fallback) |
| `OPENCLAW_SHOPPING_CLIENT_ID` | hosted fallback의 `X-OpenClaw-Client-Id`. upstream이 `openclaw-skill`을 기본으로 실어 보내며 이 값이 현재 Retention Corp allowlist에 등록되어 있다. k-skill 래퍼는 이 변수를 오버라이드하지 않는다. | `openclaw-skill` |
| `OPENCLAW_SHOPPING_FORCE_HOSTED` | `1`이면 키가 있어도 hosted 경로를 강제한다. | 비어있음 |
| `OPENCLAW_SHOPPING_BASE_URL` | hosted 백엔드 base URL 오버라이드. 스테이징/로컬 backend 테스트용. | `https://a.retn.kr` |

k-skill 쪽 래퍼(`coupang_partners_mcp.py`)는 위 환경변수를 **오버라이드/디폴트 설정 없이 그대로 upstream에 전달**한다. 사용자가 export한 값이 최종 결정을 가져간다.

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

주의: `get_coupang_goldbox`와 `get_coupang_best_products`는 upstream 기준 Coupang Partners API 권한이 필요한 경로이므로, 키 없이 hosted fallback으로만 실행 중이면 실패할 수 있다. 실패 메시지를 그대로 전달하고 hosted fallback이 커버하는 `search`/`rocket`/`budget`/`compare`로 우회 제안한다.

## 기본 흐름

1. 검색어를 받는다. 너무 넓으면 용도/예산/브랜드를 먼저 물어본다.
2. `tools`와 `init` 명령으로 retention-corp/coupang_partners 로컬 MCP 도구 목록과 handshake payload를 확인한다.
3. 요청에 맞는 CLI 명령을 실행한다(키가 없어도 hosted fallback으로 `search`/`rocket`/`budget`/`compare`는 작동한다).
4. `data.result`를 읽고 로켓배송/일반배송을 구분하여 정리한다.
5. 상위 3~5개 추천과 함께 가격/배송 정보, 변동 가능성, affiliate 고지를 제공한다.

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

# 4. 상품 검색 (키 없이도 hosted fallback으로 동작)
python3 coupang-product-search/scripts/coupang_partners_mcp.py search "생수"

# 5. 로켓배송 필터
python3 coupang-product-search/scripts/coupang_partners_mcp.py rocket "에어팟"

# 6. hosted fallback 강제 (upstream 기본 allowlist client-id 유지)
OPENCLAW_SHOPPING_FORCE_HOSTED=1 \
python3 coupang-product-search/scripts/coupang_partners_mcp.py search "무선청소기"
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

- hosted fallback 경로는 각 상품의 `productUrl`에 `https://a.retn.kr/s/...` 형태의 short deeplink를 붙여 돌려준다.
- operator (로컬 HMAC) 경로는 `https://link.coupang.com/...?lptag=AF...` 형태의 직접 딥링크를 돌려준다.
- 두 경로 모두 Retention Corp의 쿠팡 파트너스 채널로 트래킹된다. affiliate 고지를 반드시 포함한다.

사용자 답변은 짧은 비교표 형태로 정리한다.

```
## rocket (상위 후보)

1) LG전자 4K UHD 모니터
   가격: 397,750원 (참고용)
   보러가기: https://a.retn.kr/s/...

## normal (상위 후보)

1) 삼성전자 QHD 오디세이 G5 게이밍 모니터
   가격: 283,000원 (참고용)
   보러가기: https://a.retn.kr/s/...
```

## Affiliate 고지 (필수)

hosted fallback이 반환하는 응답에는 `disclosure` 필드가 포함될 수 있다. 예시 문구: `"파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있음"`. 이 문구가 오면 **답변에 그대로 노출**한다. 응답에 disclosure가 없더라도 `a.retn.kr/s/` shortlink나 `lptag=AF` 딥링크가 포함되는 이상 같은 취지의 문구를 반드시 포함한다.

## 제한사항

- 가격/품절/배송 정보는 실시간으로 바뀔 수 있다.
- 로그인, 장바구니, 결제 자동화는 지원하지 않는다.
- hosted fallback(`https://a.retn.kr/v1/public/assist`)은 allowlist로 게이트되어 있어 upstream 정책에 따라 응답 형태나 client-id 요구가 바뀔 수 있다.
- `goldbox`/`best-products` 등 Coupang Partners API 권한이 필요한 도구는 hosted fallback에서는 대체되지 않으므로 실패할 수 있다.
- upstream checkout이 없고 네트워크 clone도 막힌 환경에서는 `--repo-dir`로 기존 checkout을 지정해야 한다.

## 출처

- [retention-corp/coupang_partners GitHub](https://github.com/retention-corp/coupang_partners)
- 로컬 MCP 계약: `local://coupang-mcp`
- hosted fallback endpoint: `https://a.retn.kr/v1/public/assist`
- hosted fallback을 upstream에 추가한 PR: <https://github.com/retention-corp/coupang_partners/pull/1> (merged)
- 래퍼: `coupang-product-search/scripts/coupang_partners_mcp.py`
