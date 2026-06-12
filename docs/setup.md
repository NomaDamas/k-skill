# 공통 설정 가이드

`k-skill` 전체 스킬을 설치한 뒤, 인증 정보가 필요한 기능(SRT 예매, KTX 예매, 자연휴양림 빈 객실 조회, KOSIS `bigdata`/`--direct` 조회용 `KSKILL_KOSIS_API_KEY` (https://kosis.kr/openapi/ 에서 무료 발급), 한국 법령 검색의 로컬 CLI/MCP 경로용 `LAW_OC`, 한국 특허 정보 검색의 KIPRIS Plus 경로용 `KIPRIS_PLUS_API_KEY`, self-host 프록시 운영용 서울 지하철/한국 날씨/미세먼지/한강홍수통제소/식약처/KOSIS/Kakao upstream key, 또는 배포 확인이 끝난 proxy URL 공유)이 있으면 이 절차를 진행하면 된다. 미세먼지, 한강 수위, 주유소 가격, 부동산 실거래가, 한국 주식 정보 조회, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 기본 hosted proxy를 쓰므로 사용자 쪽 키가 불필요하다. KOSIS 일반 조회와 Kakao Local geocoding도 기본 hosted proxy를 쓰므로 사용자 쪽 키가 불필요하다(단, hosted 프록시 운영 측에서 `DATA_GO_KR_API_KEY`·`KEDU_INFO_KEY`·`DATA4LIBRARY_AUTH_KEY`·`FOODSAFETYKOREA_API_KEY`·`KOSIS_API_KEY`·`KAKAO_REST_API_KEY` 등은 서버에 설정되어 있어야 한다).

## Credential resolution order

모든 credential-bearing 스킬은 아래 우선순위를 따른다.

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

에이전트가 자체 vault를 사용 중이라면 기본 경로 설정을 건너뛰어도 된다.

## 기본 경로로 설정하기

에이전트가 별도 vault를 쓰지 않는 경우, 기본 fallback 파일을 만든다.

```bash
mkdir -p ~/.config/k-skill
cat > ~/.config/k-skill/secrets.env <<'EOF'
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
KSKILL_FORESTTRIP_ID=replace-me
KSKILL_FORESTTRIP_PASSWORD=replace-me
# KOSIS 일반 조회는 hosted proxy 사용. bigdata/--direct 때만 채운다.
KSKILL_KOSIS_API_KEY=replace-me
# 창업진흥원 K-Startup 일반 조회는 hosted proxy 사용. --direct 때만 채운다.
KSKILL_KSTARTUP_API_KEY=replace-me
LAW_OC=replace-me
KIPRIS_PLUS_API_KEY=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
# Kakao Local geocoding은 hosted proxy 사용. self-host proxy 운영 때만 채운다.
KAKAO_REST_API_KEY=replace-me
KSKILL_PROXY_BASE_URL=
EOF
chmod 0600 ~/.config/k-skill/secrets.env
```

실제 값을 채운다.

서울 지하철 도착정보, 서울 실시간 혼잡도 조회, 서울 따릉이 실시간 대여소 조회, 한국 날씨, 미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL` 을 비워 두면 기본 hosted path(`k-skill-proxy.nomadamas.org`)를 그대로 쓴다. KOSIS 일반 조회와 Kakao Local geocoding도 같은 기본 hosted path를 쓴다. 별도 self-host proxy를 쓸 때만 `KSKILL_PROXY_BASE_URL` 을 채운다.

한국 법령 검색은 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)의 `/v1/korean-law/...` endpoint를 경유하므로 사용자 쪽 `LAW_OC` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `LAW_OC` 를 채운다(무료 발급: `https://open.law.go.kr`).

한국 부동산 실거래가 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다.

한국 주식 정보 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `KRX_API_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `KRX_API_KEY` 를 사용한다.

도서관 도서 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA4LIBRARY_AUTH_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `DATA4LIBRARY_AUTH_KEY` 를 사용한다.

근처 가장 싼 주유소 찾기는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `OPINET_API_KEY` 가 불필요하다.

한국 특허 정보 검색의 KIPRIS Plus 경로용 `KIPRIS_PLUS_API_KEY` 는 helper가 읽는 표준 변수명이다. 실제 HTTP 요청에서는 같은 값을 `ServiceKey` 쿼리 파라미터로 보낸다. 공공데이터포털에서 복사한 percent-encoded key도 helper가 한 번 정규화해서 그대로 쓸 수 있다.

## 확인

```bash
bash scripts/check-setup.sh
```

## 시크릿이 없을 때의 기본 응답

인증이 필요한 스킬에서 값이 비어 있으면 credential resolution order에 따라 확보한다.

- 어떤 값이 필요한지 정확한 변수 이름으로 알려주기
- resolution order에 따라 유저에게 확보 방법 안내하기

## 기능별로 필요한 값

| 기능 | 필요한 값 |
| --- | --- |
| SRT 예매 | `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD` |
| KTX 예매 | `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` |
| 고속버스 예매 | 사용자 시크릿 불필요 (조회·좌석 단계는 공식 KOBUS HTTP 흐름 사용, 결제는 공식 페이지에서 수동 진행) |
| 시외버스 예매 | 사용자 시크릿 불필요 (조회·좌석 단계는 공식 티머니 HTTP 흐름 사용, 결제는 공식 페이지에서 수동 진행) |
| 자연휴양림 빈 객실 조회 | `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` |
| 한국 법령 검색 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `LAW_OC`) |
| 한국 부동산 실거래가 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용) |
| 한국 특허 정보 검색 | `KIPRIS_PLUS_API_KEY` |
| 하이패스 영수증 발급 | 사용자 시크릿 불필요 (로그인된 브라우저 세션 필요) |
| 한국 주식 정보 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `KRX_API_KEY`) |
| 근처 가장 싼 주유소 찾기 | 사용자 시크릿 불필요 (기본 hosted proxy 사용) |
| 서울 지하철 도착정보 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `SEOUL_OPEN_API_KEY`) |
| 서울 실시간 혼잡도 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `SEOUL_OPEN_API_KEY`) |
| 서울 따릉이 실시간 대여소 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `SEOUL_OPEN_API_KEY`) |
| 한국 날씨 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `KMA_OPEN_API_KEY`) |
| 사용자 위치 미세먼지 조회 | `KSKILL_PROXY_BASE_URL` 또는 `AIR_KOREA_OPEN_API_KEY` |
| 한강 수위 정보 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용) |
| 생활쓰레기 배출정보 조회 | 사용자 시크릿 불필요 (프록시에 `DATA_GO_KR_API_KEY`가 설정된 hosted/self-host; API 호출 시 `pageNo=1`, `numOfRows=100` 필수) |
| 학교 급식 식단 조회 | 사용자 시크릿 불필요 (프록시에 `KEDU_INFO_KEY`가 설정된 hosted/self-host 사용) |
| 도서관 도서 조회 | 사용자 시크릿 불필요 (프록시에 `DATA4LIBRARY_AUTH_KEY`가 설정된 hosted/self-host 사용) |
| 의약품 안전 체크 | 사용자 시크릿 불필요 (프록시에 `DATA_GO_KR_API_KEY`가 설정된 hosted/self-host 사용) |
| 식품 안전 체크 | 사용자 시크릿 불필요 (프록시에 `DATA_GO_KR_API_KEY`와 선택적 `FOODSAFETYKOREA_API_KEY`가 설정된 hosted/self-host 사용) |
| 창업진흥원 K-Startup 조회 | 사용자 시크릿 불필요 (프록시에 `DATA_GO_KR_API_KEY`가 설정된 hosted/self-host 사용; `--direct` 호출 때만 `KSKILL_KSTARTUP_API_KEY`) |

## 다음에 볼 문서

- [SRT 예매 가이드](features/srt-booking.md)
- [KTX 예매 가이드](features/ktx-booking.md)
- [고속버스 예매 가이드](features/express-bus-booking.md)
- [시외버스 예매 가이드](features/intercity-bus-booking.md)
- [자연휴양림 빈 객실 조회 가이드](features/foresttrip-vacancy.md)
- [서울 지하철 도착정보 가이드](features/seoul-subway-arrival.md)
- [서울 실시간 혼잡도 가이드](features/seoul-density.md)
- [한국 날씨 조회 가이드](features/korea-weather.md)
- [사용자 위치 미세먼지 조회 가이드](features/fine-dust-location.md)
- [한강 수위 정보 가이드](features/han-river-water-level.md)
- [한국 법령 검색 가이드](features/korean-law-search.md)
- [한국 부동산 실거래가 조회 가이드](features/real-estate-search.md)
- [한국 특허 정보 검색 가이드](features/korean-patent-search.md)
- [하이패스 영수증 발급 가이드](features/hipass-receipt.md)
- [한국 주식 정보 조회 가이드](features/korean-stock-search.md)
- [근처 가장 싼 주유소 찾기 가이드](features/cheap-gas-nearby.md)
- [근처 공중화장실 찾기 가이드](features/public-restroom-nearby.md)
- [생활쓰레기 배출정보 조회 가이드](features/household-waste-info.md)
- [학교 급식 식단 조회 가이드](features/k-schoollunch-menu.md)
- [도서관 도서 조회 가이드](features/library-book-search.md)
- [의약품 안전 체크 가이드](features/mfds-drug-safety.md)
- [식품 안전 체크 가이드](features/mfds-food-safety.md)
- [창업진흥원 K-Startup 조회 가이드](features/kstartup-search.md)
- [지방선거 후보자 조회 가이드](features/local-election-candidate-search.md)
- [보안/시크릿 정책](security-and-secrets.md)

설치 기본 흐름은 "전체 스킬 설치 → 개별 기능 사용" 이다.
