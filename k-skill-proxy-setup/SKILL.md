---
name: k-skill-proxy-setup
description: k-skill의 proxy-routed 스킬(날씨, 미세먼지, KOSIS, 부동산, 주식, 급식, 도서관 등)이 필요로 하는 k-skill-proxy 서버를 로컬에 띄우고 API 키를 설정하는 방법을 안내한다. Use when the user wants to self-host k-skill-proxy instead of using a hosted instance.
license: MIT
metadata:
  category: setup
  locale: ko-KR
  phase: v1
---

# k-skill Proxy Setup

## What this skill does

k-skill의 많은 스킬이 **k-skill-proxy**라는 중계 서버를 통해 한국 공공/데이터 API를 호출한다. 이 proxy는 사용자의 API 키를 서버 쪽에서 주입하여, 매 스킬 호출마다 키를 노출하지 않는다.

이 스킬은 **사용자가 자체 proxy를 로컬에 띄우는 방법**을 안내한다.

## When to use

- k-skill 설치 후 proxy가 필요한 스킬을 사용하려 하는데 기존 hosted proxy를 쓰지 않을 때
- 자체 서버/로컬에서 proxy를 운영하려 할 때
- API 키 발급부터 proxy 기동까지 전체 흐름이 필요할 때

## When not to use

- 이미 `KSKILL_PROXY_BASE_URL`이 설정되어 있고 정상 동작 중일 때
- proxy가 필요 없는 스킬(SRT/KTX 예매, 카카오톡 검색, HWP 등)만 사용할 때

## Prerequisites

- **Docker** (권장) — [설치 가이드](https://docs.docker.com/get-docker/)
- 또는 **Node.js 18+** (Docker 없이 직접 실행할 때)
- **git**

## Architecture

```
에이전트 / 코딩 에이전트 (Claude Code, Codex, OpenCode 등)
    ↓ KSKILL_PROXY_BASE_URL=http://localhost:8080
k-skill-proxy (localhost:8080, Docker container)
    ↓ API 키를 주입하여 호출
한국 공공데이터 API (data.go.kr, kosis.kr, kma.go.kr, ...)
```

## Workflow

### 1. Clone the repo

```bash
git clone https://github.com/NomaDamas/k-skill.git
cd k-skill
```

### 2. Get API keys

proxy가 주입할 API 키를 발급받는다. **전부 무료**이며, 어떤 스킬을 쓸지에 따라 필요한 키가 다르다.

필수/선택별 발급 안내는 [`references/api-keys-guide.md`](references/api-keys-guide.md)를 참고한다.

최소 구성 (날씨, 미세먼지, KOSIS 통계, 부동산, 주식, 급식, 도서관 등 대부분 커버):

| 키 | 발급처 | 용도 |
| --- | --- | --- |
| `DATA_GO_KR_API_KEY` | [공공데이터포털](https://www.data.go.kr) | 부동산, 급식, 의약품, 식품, 국민연금, 금융위, 나라장터, K-Startup 등 |
| `KOSIS_API_KEY` | [KOSIS 공유서비스](https://kosis.kr/openapi/) | 한국 공식 통계 조회 |
| `KMA_OPEN_API_KEY` | [기상청 단기예보](https://www.data.go.kr/data/AWS_T_AASDIA_M) | 한국 날씨 |
| `AIR_KOREA_OPEN_API_KEY` | [에어코리아 대기오염정보](https://www.data.go.kr/data/15073861/openapi.do) | 미세먼지 |
| `SEOUL_OPEN_API_KEY` | [서울 열린데이터광장](https://data.seoul.go.kr/) | 지하철 도착정보, 실시간 혼잡도, 따릉이 |
| `KAKAO_REST_API_KEY` | [Kakao Developers](https://developers.kakao.com/) | 카카오맵 장소/길찾기, 카카오 로컬 |
| `OPINET_API_KEY` | [오피넷](https://www.opinet.co.kr/) | 주유소 가격 |
| `HRFCO_OPEN_API_KEY` | [한국하천정보](https://www.data.go.kr/data/15096280/openapi.do) | 한강 수위 |

선택 (특정 스킬만 필요할 때):

| 키 | 발급처 | 용도 |
| --- | --- | --- |
| `KRX_API_KEY` | [KRX 정보데이터시스템](https://data.krx.co.kr/) | 한국 주식 |
| `DATA4LIBRARY_AUTH_KEY` | [도서관 정보나루](https://data4library.kr/) | 도서관 도서 검색 |
| `KEDU_INFO_KEY` | [교육행정정보시스템(NEIS)](https://open.neis.go.kr/) | 학교 급식 식단 |
| `FOODSAFETYKOREA_API_KEY` | [식품안전정보포털](https://www.foodsafetykorea.go.kr/) | 식품 안전 (선택, DATA_GO_KR_API_KEY만으로도 기본 동작) |
| `NAVER_SEARCH_CLIENT_ID` + `NAVER_SEARCH_CLIENT_SECRET` | [Naver Developers](https://developers.naver.com/) | 네이버 쇼핑, 뉴스 검색 |
| `LAW_OC` | [국가법령정보센터](https://open.law.go.kr) | 한국 법령 검색 |

### 3. Create secrets file

```bash
cat > ~/.config/k-skill/proxy-secrets.env <<'EOF'
# --- 필수 ---
DATA_GO_KR_API_KEY=여기에_발급받은_키
KOSIS_API_KEY=여기에_발급받은_키
KMA_OPEN_API_KEY=여기에_발급받은_키
AIR_KOREA_OPEN_API_KEY=여기에_발급받은_키
SEOUL_OPEN_API_KEY=여기에_발급받은_키
KAKAO_REST_API_KEY=여기에_발급받은_키
OPINET_API_KEY=여기에_발급받은_키
HRFCO_OPEN_API_KEY=여기에_발급받은_키

# --- 선택 ---
KRX_API_KEY=
DATA4LIBRARY_AUTH_KEY=
KEDU_INFO_KEY=
FOODSAFETYKOREA_API_KEY=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
LAW_OC=

# --- 런타임 ---
KSKILL_PROXY_HOST=0.0.0.0
KSKILL_PROXY_PORT=8080
EOF
chmod 0600 ~/.config/k-skill/proxy-secrets.env
```

### 4. Start the proxy

#### Option A: Docker (권장)

```bash
cd /path/to/k-skill

# 이미지 빌드
docker build -f packages/k-skill-proxy/Dockerfile -t k-skill-proxy .

# 컨테이너 실행
docker run -d \
  --name k-skill-proxy \
  --restart unless-stopped \
  --env-file ~/.config/k-skill/proxy-secrets.env \
  -p 8080:8080 \
  k-skill-proxy
```

#### Option B: Node.js 직접 실행

```bash
cd /path/to/k-skill/packages/k-skill-proxy
npm install --omit=dev
# 환경변수를 로드한 후 실행
set -a; source ~/.config/k-skill/proxy-secrets.env; set +a
node src/server.js
```

### 5. Verify

```bash
# 헬스체크
curl http://localhost:8080/health
```

정상 응답 예:

```json
{
  "ok": true,
  "service": "k-skill-proxy",
  "upstreams": {
    "kosisConfigured": true,
    "kakaoLocalConfigured": true,
    ...
  }
}
```

`*Configured`가 `false`인 항목은 해당 API 키가 설정되지 않은 것이다. 필요한 스킬의 키만 채우면 된다.

### 6. Point your skills at the proxy

```bash
# secrets.env에 proxy URL 등록
echo 'KSKILL_PROXY_BASE_URL=http://localhost:8080' >> ~/.config/k-skill/secrets.env
```

이제 모든 proxy-routed 스킬이 `http://localhost:8080`을 기본 proxy로 사용한다.

## Done when

- `curl http://localhost:8080/health` 가 `ok: true` 를 반환한다
- 사용하려는 스킬의 upstream 키가 `*Configured: true` 로 나타난다
- `~/.config/k-skill/secrets.env`에 `KSKILL_PROXY_BASE_URL=http://localhost:8080` 이 설정되어 있다

## Updating the proxy

```bash
cd /path/to/k-skill
git pull
docker build -f packages/k-skill-proxy/Dockerfile -t k-skill-proxy .
docker rm -f k-skill-proxy
docker run -d \
  --name k-skill-proxy \
  --restart unless-stopped \
  --env-file ~/.config/k-skill/proxy-secrets.env \
  -p 8080:8080 \
  k-skill-proxy
```

## Failure modes

- **포트 충돌** (`8080 already in use`): `KSKILL_PROXY_PORT=9090` 등으로 변경하고 `KSKILL_PROXY_BASE_URL`도 같이 바꾼다
- **API 키 미설정**: `/health` 응답의 `*Configured`가 `false`. 발급받은 키를 `proxy-secrets.env`에 추가하고 컨테이너를 재시작한다
- **Docker 미설치**: Docker를 설치하거나 Node.js 직접 실행을 사용한다
- **공공데이터포털 키 인코딩**: 공공데이터포털 키는 percent-encoding된 형태로 복사된다. 그대로 넣어도 된다
- **KOSIS 키 만료**: KOSIS 키는 활용신청 시점부터 유효하다. KOSIS 웹에서 활용신청 상태를 확인한다

## Safety notes

- `proxy-secrets.env` 파일 퍼미션은 `0600`으로 유지한다
- API 키를 git에 커밋하지 않는다
- proxy를 외부에 공개할 때는 방화벽/인증을 추가한다 (기본은 auth 없음)
- 공공데이터포털 키는 일일 호출 한도가 있다. proxy의 rate limit (`KSKILL_PROXY_RATE_LIMIT_MAX`)으로 조절한다
