---
name: real-estate-search
description: Use tae0y's real-estate-mcp for Korean apartment/officetel/villa/single-house real transaction price and rent lookups. If no hosted endpoint is available, self-host the upstream server with Cloudflare Tunnel and launchd.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# Korean Real Estate Search

## What this skill does

한국 부동산 실거래가/전월세 조회가 필요할 때 **upstream `real-estate-mcp`**(`https://github.com/tae0y/real-estate-mcp/tree/main`)를 그대로 사용한다.
이 저장소는 upstream 소스 코드를 vendoring 하지 않고, 연결/운영 가이드만 제공한다.

대표 도구:

- 아파트 매매 실거래가: `get_apartment_trades`
- 아파트 전월세: `get_apartment_rent`
- 오피스텔 매매/전월세: `get_officetel_trades`, `get_officetel_rent`
- 연립다세대 매매/전월세: `get_villa_trades`, `get_villa_rent`
- 단독/다가구 매매/전월세: `get_single_house_trades`, `get_single_house_rent`
- 상업업무용 매매: `get_commercial_trade`
- 청약홈 분양/당첨: `get_apt_subscription_info`, `get_apt_subscription_results`
- 공공경매/온비드: `get_public_auction_items`, `get_public_auction_item_detail`
- 지역코드 조회: `get_region_code`

## When to use

- "잠실 리센츠 2024년 매매 실거래가 찾아줘"
- "마포구 아파트 전세 실거래가 보여줘"
- "성수동 오피스텔 월세 실거래 데이터 볼래"
- "세종시 청약 결과 찾아줘"
- "실거래가 조회용 한국 부동산 MCP 붙여줘"

## When not to use

- 해외 부동산 시세/거래 조회
- 실거래가가 아닌 민간 호가/매물 비교만 필요한 경우
- 세금/등기/중개 법률자문처럼 판단이 필요한 경우
- 이 저장소 안에 부동산 데이터 수집기나 새 서버 코드를 추가하려는 경우

## Prerequisites

- 인터넷 연결
- `uv`
- MCP 클라이언트(Codex CLI, Claude Desktop 등)
- 공공데이터포털 API key (`DATA_GO_KR_API_KEY`)
- upstream clone: `https://github.com/tae0y/real-estate-mcp/tree/main`

`DATA_GO_KR_API_KEY` 하나만 넣어도 기본 부동산 조회는 시작할 수 있다.
청약홈/온비드 키를 분리하고 싶으면 upstream 문서대로 `ODCLOUD_API_KEY`, `ODCLOUD_SERVICE_KEY`, `ONBID_API_KEY` 를 추가한다.

## Codex CLI setup (stdio)

로컬에서 가장 빠른 기본 경로는 Codex CLI stdio 연결이다.

```bash
git clone https://github.com/tae0y/real-estate-mcp.git
cd real-estate-mcp

codex mcp add real-estate \
  --env DATA_GO_KR_API_KEY=your_api_key_here \
  -- uv run --directory /path/to/real-estate-mcp \
  python src/real_estate/mcp_server/server.py

codex mcp list
codex mcp get real-estate
```

## Claude Desktop setup (stdio)

```json
{
  "mcpServers": {
    "real-estate": {
      "command": "uv",
      "args": [
        "run",
        "--directory", "/path/to/real-estate-mcp",
        "python", "src/real_estate/mcp_server/server.py"
      ],
      "env": {
        "DATA_GO_KR_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Shared HTTP setup

여러 클라이언트가 같이 붙어야 하면 upstream HTTP 모드를 사용한다.

```bash
git clone https://github.com/tae0y/real-estate-mcp.git
cd real-estate-mcp
cp .env.example .env
printf 'DATA_GO_KR_API_KEY=your_api_key_here\n' >> .env
uv run real-estate-mcp --transport http --host 127.0.0.1 --port 8000
```

Codex CLI/Claude Desktop 에는 HTTP URL을 등록한다.

```bash
codex mcp add real-estate --url http://127.0.0.1:8000/mcp
```

```json
{
  "mcpServers": {
    "real-estate": {
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}
```

## Self-host fallback when no hosted endpoint is available

2026-04-05 기준, upstream README/docs에는 고정 public MCP URL이 문서화돼 있지 않았다. 그래서 인터넷에서 공유 가능한 endpoint가 미리 준비돼 있지 않다고 보고 **self-host를 기본 운영 경로**로 잡는다.

### 1. Upstream Docker + Caddy로 로컬 HTTP 서버 띄우기

```bash
git clone https://github.com/tae0y/real-estate-mcp.git
cd real-estate-mcp
cp .env.example .env
printf 'DATA_GO_KR_API_KEY=your_api_key_here\n' >> .env
REPOSITORY_ROOT=$(pwd)
docker compose -f "$REPOSITORY_ROOT"/docker/docker-compose.yml up -d --build
```

헬스 체크는 upstream 문서의 MCP initialize 예시로 확인한다.

```bash
curl -s -X POST http://localhost/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

### 2. Cloudflare Tunnel로 적합한 도메인 붙이기

```bash
cloudflared tunnel login
cloudflared tunnel create real-estate-mcp
cloudflared tunnel route dns real-estate-mcp real-estate-mcp.example.com
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: real-estate-mcp
credentials-file: /Users/YOUR_USER/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: real-estate-mcp.example.com
    service: http://localhost:80
  - service: http_status:404
EOF
cloudflared tunnel run real-estate-mcp
```

공유용 HTTPS URL은 `https://real-estate-mcp.example.com/mcp` 형식으로 잡는다.
public 인터넷에 노출한다면 upstream `docs/setup-oauth.md` 대로 `AUTH_MODE=oauth` 를 켜고 OAuth/Auth0를 붙인다.

### 3. macOS launchd 자동 실행

부팅 후 안정적으로 다시 뜨게 하려면 upstream 서버와 tunnel을 각각 launchd 로 올린다.

`~/Library/LaunchAgents/com.kskill.real-estate-mcp.server.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.kskill.real-estate-mcp.server</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>cd $HOME/src/real-estate-mcp && docker compose -f docker/docker-compose.yml up -d</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
  </dict>
</plist>
```

`~/Library/LaunchAgents/com.kskill.real-estate-mcp.tunnel.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.kskill.real-estate-mcp.tunnel</string>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/cloudflared</string>
      <string>tunnel</string>
      <string>run</string>
      <string>real-estate-mcp</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
  </dict>
</plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kskill.real-estate-mcp.server.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kskill.real-estate-mcp.tunnel.plist
launchctl enable gui/$(id -u)/com.kskill.real-estate-mcp.server
launchctl enable gui/$(id -u)/com.kskill.real-estate-mcp.tunnel
```

위 예시는 macOS 기준이다. Linux/Windows에서는 systemd 또는 서비스 관리자로 같은 역할을 분리해서 등록한다.

## Response policy

- 실거래가/전월세 요청이면 `get_region_code` 로 행정구역 코드를 먼저 확인한 뒤 자산 타입별 tool로 조회한다.
- 아파트 매매는 `get_apartment_trades`, 아파트 전월세는 `get_apartment_rent` 를 우선 사용한다.
- 오피스텔/빌라/단독주택/상업업무용은 자산 타입에 맞는 전용 tool로 라우팅한다.
- 사용자가 동/건물명/연월을 덜 줬으면 지역, 단지명, 기준 월을 먼저 보강한다.
- 실거래가와 호가를 섞어 말하지 않는다. 이 스킬은 국토교통부 기반 실거래/전월세 신고 데이터를 우선 다룬다.
- 인터넷 공유용 endpoint가 미리 없다면 self-host + Cloudflare Tunnel + launchd 운영 경로를 안내한다.
- upstream 소스는 이 저장소에 복사하지 않는다.

## Done when

- 요청 자산 타입에 맞는 `real-estate-mcp` tool이 선택되었다.
- 필요한 경우 `get_region_code` 로 지역코드를 먼저 확인했다.
- 실거래가/전월세/청약/경매 중 적절한 결과를 조회했다.
- 로컬 stdio/HTTP 경로면 `DATA_GO_KR_API_KEY` 준비 여부를 확인했다.
- hosted endpoint가 없으면 self-host + Cloudflare Tunnel + launchd 운영 경로를 제시했다.
- 원본 MCP 링크(`https://github.com/tae0y/real-estate-mcp/tree/main`)를 함께 남겼다.

## Notes

- upstream: `https://github.com/tae0y/real-estate-mcp/tree/main`
- upstream Codex guide: `https://github.com/tae0y/real-estate-mcp/blob/main/docs/setup-codex-cli.md`
- upstream Docker guide: `https://github.com/tae0y/real-estate-mcp/blob/main/docs/setup-docker.md`
- upstream OAuth guide: `https://github.com/tae0y/real-estate-mcp/blob/main/docs/setup-oauth.md`
- official data source: 공공데이터포털 (`https://www.data.go.kr`)
- 이 저장소에는 별도 workspace/package를 추가하지 않고 스킬 문서만 유지한다.
