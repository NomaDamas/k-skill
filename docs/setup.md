# 공통 설정 가이드

`k-skill` 전체 스킬을 설치한 뒤, 인증 정보가 필요한 기능(SRT 예매, KTX 예매, 자연휴양림 빈 객실 조회, KOSIS `bigdata`/`--direct` 조회용 `KSKILL_KOSIS_API_KEY` (https://kosis.kr/openapi/ 에서 무료 발급), 한국 법령 검색의 로컬 CLI/MCP 경로용 `LAW_OC`, 한국 특허 정보 검색의 KIPRIS Plus 경로용 `KIPRIS_PLUS_API_KEY`, self-host 프록시 운영용 서울 지하철/한국 날씨/미세먼지/한강홍수통제소/식약처/KOSIS/Kakao upstream key, 또는 배포 확인이 끝난 proxy URL 공유)이 있으면 이 절차를 진행하면 된다. 미세먼지, 한강 수위, 주유소 가격, 부동산 실거래가, 한국 주식 정보 조회, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 기본 hosted proxy를 쓰므로 사용자 쪽 키가 불필요하다. KOSIS 일반 조회와 Kakao Local geocoding도 기본 hosted proxy를 쓰므로 사용자 쪽 키가 불필요하다(단, hosted 프록시 운영 측에서 `DATA_GO_KR_API_KEY`·`KEDU_INFO_KEY`·`DATA4LIBRARY_AUTH_KEY`·`FOODSAFETYKOREA_API_KEY`·`KOSIS_API_KEY`·`KAKAO_REST_API_KEY` 등은 서버에 설정되어 있어야 한다).

## Credential resolution order

모든 credential-bearing 스킬은 먼저 실행 capability를 감지한다.

1. **Dolshoi credential mode**: `DOLSHOI_ACTION_BROKER_URL`이 설정되고 `vault-run`이 실행 가능하면 provisioned capability를 사용한다.
2. **Dolshoi missing credential**: capability가 없으면 평문을 묻지 말고 `request_vault_credential`로 앱 vault 입력 UI를 호출한다.
3. **Generic injected secret**: 이미 환경변수 또는 host vault injection이 있으면 그대로 사용한다.
4. **Generic fallback**: host vault → `~/.config/k-skill/secrets.env` (`0600`) 순서로 사용한다.
5. **Generic missing secret**: 호스트가 제공하는 가장 안전한 입력 표면으로 받아 vault 또는 dotenv에 저장한다.

돌쇠 또는 다른 host vault를 사용 중이라면 기본 경로 설정을 건너뛴다.

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
# EV 충전소 일반 조회는 hosted proxy 사용. --direct 때만 채운다.
KSKILL_EV_CHARGER_API_KEY=replace-me
# 건축물대장 일반 조회는 hosted proxy 사용. --direct 때만 채운다.
KSKILL_BUILDING_REGISTER_API_KEY=replace-me
# RISS 학술자료 검색은 사용자 본인의 RISS 검색 API 키로 직접 호출한다(비영리 기관/대학 발급).
KSKILL_RISS_API_KEY=replace-me
LAW_OC=replace-me
KIPRIS_PLUS_API_KEY=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
# Kakao Local geocoding은 hosted proxy 사용. self-host proxy 운영 때만 채운다.
KAKAO_REST_API_KEY=replace-me
# Popbill은 사용자별 과금/권한 API이므로 BYOK 로컬 호출 때만 채운다.
KSKILL_POPBILL_LINK_ID=replace-me
KSKILL_POPBILL_SECRET_KEY=replace-me
KSKILL_POPBILL_CORP_NUM=replace-me
KSKILL_POPBILL_USER_ID=
KSKILL_PROXY_BASE_URL=
EOF
chmod 0600 ~/.config/k-skill/secrets.env
```

실제 값을 채운다.

서울 지하철 도착정보, 서울 실시간 혼잡도 조회, 서울 따릉이 실시간 대여소 조회, 한국 날씨, 미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL` 을 비워 두면 기본 hosted path(`k-skill-proxy.nomadamas.org`)를 그대로 쓴다. 전기차 충전소와 건축물대장 표제부 조회도 같은 기본 hosted path를 쓴다. KOSIS 일반 조회와 Kakao Local geocoding도 같은 기본 hosted path를 쓴다. 별도 self-host proxy를 쓸 때만 `KSKILL_PROXY_BASE_URL` 을 채운다.

전기차 충전소 일반 조회는 hosted proxy를 사용하므로 사용자 키가 필요 없다. `--direct`에서만 `KSKILL_EV_CHARGER_API_KEY` 또는 `DATA_GO_KR_API_KEY`를 사용하며, 기존 키가 있어도 데이터셋 `15076352` 활용신청은 별도로 해야 한다(자동승인).

건축물대장 표제부 일반 조회는 hosted proxy를 사용하므로 사용자 키가 필요 없다. 주소 입력도 hosted Kakao geocode를 사용한다. `--direct`에서는 주소를 받지 않고 `KSKILL_BUILDING_REGISTER_API_KEY` 또는 `DATA_GO_KR_API_KEY`를 사용하며, 데이터셋 `15134735` 활용신청은 별도로 해야 한다(자동승인).

KERIS/RISS 학술자료 검색은 RISS 검색 API가 기관 전용 키를 요구하므로 hosted proxy를 사용하지 않고, 사용자가 직접 발급받은 `KSKILL_RISS_API_KEY`(호환 `RISS_API_KEY`)로 상류를 호출한다. RISS 키는 비영리 기관/대학에만 발급되며 RISS 검색에는 `DATA_GO_KR_API_KEY`를 사용하지 않는다.

한국 법령 검색은 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)의 `/v1/korean-law/...` endpoint를 경유하므로 사용자 쪽 `LAW_OC` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `LAW_OC` 를 채운다(무료 발급: `https://open.law.go.kr`).

한국 부동산 실거래가 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다.

한국 주식 정보 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `KRX_API_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `KRX_API_KEY` 를 사용한다.

도서관 도서 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA4LIBRARY_AUTH_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `DATA4LIBRARY_AUTH_KEY` 를 사용한다.

근처 가장 싼 주유소 찾기는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `OPINET_API_KEY` 가 불필요하다.

한국 특허 정보 검색의 KIPRIS Plus 경로용 `KIPRIS_PLUS_API_KEY` 는 helper가 읽는 표준 변수명이다. 실제 HTTP 요청에서는 같은 값을 `ServiceKey` 쿼리 파라미터로 보낸다. 공공데이터포털에서 복사한 percent-encoded key도 helper가 한 번 정규화해서 그대로 쓸 수 있다.

## 브라우저 런타임

돌쇠에서는 내장 browser tool의 CloakBrowser를 최우선으로 쓴다. 내장 tool이 CloakBrowser를 제공하거나 `CLOAKBROWSER_PEEK_TOKEN`이 있으면 `k-skill-browser-runtime`보다 먼저 사용한다.

돌쇠가 아니거나 CloakBrowser를 사용할 수 없을 때는 `k-skill-browser-runtime`을 portable fallback으로 쓴다. 기본 `auto` 순서는 macOS에서 Aside Browser REPL → BrowserOS CDP → Chrome/Chromium CDP, 기타 플랫폼에서 BrowserOS CDP → Aside Browser REPL → Chrome/Chromium CDP다. 런타임은 BrowserOS를 launch하거나 headless로 띄우지 않고, Aside는 공개 `aside repl` 표면만 쓴다. 자세한 작성 가이드는 [브라우저 런타임 문서](browser-runtime.md), [돌쇠 런타임 계약](dolshoi-runtime.md), [새 스킬 추가 가이드](adding-a-skill.md)를 참고.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `KSKILL_BROWSER_PROVIDER` | `auto` | `auto`(macOS: Aside → BrowserOS → Chrome, 기타: BrowserOS → Aside → Chrome), `browseros`, `aside`, `chrome-cdp` |
| `KSKILL_BROWSEROS_CDP_URL` | `http://127.0.0.1:9100` | BrowserOS CDP 엔드포인트 |
| `KSKILL_CHROME_CDP_URL` | `http://127.0.0.1:9222` | Chrome/Chromium CDP 엔드포인트 |
| `KSKILL_ASIDE_COMMAND` | `aside` | Aside CLI 명령 이름 또는 경로 |

돌쇠에서는 vault-backed login으로 인증을 재개하고, 결제·전송·최종 제출 직전에 `clarify` 승인을 받은 뒤 공식 표면에서 계속 진행한다. CAPTCHA, 본인인증, 전자서명, 법률상 금지 경계는 우회하지 않는다. generic runtime은 typed stop rule과 수동 handoff를 유지한다. 공개 데이터 조회는 직접 HTTP를 먼저 쓴다.

## 확인

```bash
bash scripts/check-setup.sh
```

## 시크릿이 없을 때의 기본 응답

인증이 필요한 스킬에서 값이 비어 있으면 credential resolution order에 따라 확보한다.

- 돌쇠에서는 `request_vault_credential`로 필요한 service/field 입력 UI를 호출하고 평문 값을 채팅으로 요구하지 않기
- generic runtime에서는 어떤 값이 필요한지 정확한 변수 이름으로 알려주고 안전한 host input/vault/dotenv 순서 안내하기

## 기능별로 필요한 값

| 기능 | 필요한 값 |
| --- | --- |
| SRT 예매 | `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD` |
| KTX 예매 | `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` |
| 고속버스 예매 | 사용자 시크릿 불필요 (조회·좌석 단계는 공식 KOBUS HTTP 흐름, 돌쇠는 `clarify` 승인 후 공식 결제까지, generic은 수동 handoff) |
| 시외버스 예매 | 사용자 시크릿 불필요 (조회·좌석 단계는 공식 티머니 HTTP 흐름, 돌쇠는 `clarify` 승인 후 공식 결제까지, generic은 수동 handoff) |
| 자연휴양림 빈 객실 조회 | `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` |
| 한국 법령 검색 | 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `LAW_OC`) |
| 한국 부동산 실거래가 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용) |
| 한국 특허 정보 검색 | `KIPRIS_PLUS_API_KEY` |
| 팝빌 업무 API | `KSKILL_POPBILL_LINK_ID`, `KSKILL_POPBILL_SECRET_KEY`, `KSKILL_POPBILL_CORP_NUM`, 선택 `KSKILL_POPBILL_USER_ID` |
| 하이패스 영수증 발급 | 사용자 시크릿 불필요 (플랫폼별 `auto` 세션에서 수동 로그인, [브라우저 런타임](browser-runtime.md) 참고) |
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
| 전기차 충전소 위치·상태 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용; `--direct` 때만 `KSKILL_EV_CHARGER_API_KEY` 또는 `DATA_GO_KR_API_KEY`, 데이터셋 `15076352` 별도 활용신청) |
| 건축물대장 표제부 조회 | 사용자 시크릿 불필요 (기본 hosted proxy 사용; `--direct` 때만 `KSKILL_BUILDING_REGISTER_API_KEY` 또는 `DATA_GO_KR_API_KEY`, 데이터셋 `15134735` 별도 활용신청) |
| KERIS/RISS 학술자료 검색 | 사용자 본인 `KSKILL_RISS_API_KEY`(호환 `RISS_API_KEY`) 필요; RISS 검색 API는 비영리 기관/대학 전용 키로 직접 호출, proxy 미사용 |

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
- [전기차 충전소 위치·상태 조회 가이드](features/ev-charger-nearby.md)
- [건축물대장 표제부 조회 가이드](features/building-register-search.md)
- [KERIS/RISS 학술자료 검색 가이드](features/keris-academic-search.md)
- [팝빌 all-service API helper](features/popbill.md)
- [지방선거 후보자 조회 가이드](features/local-election-candidate-search.md)
- [보안/시크릿 정책](security-and-secrets.md)
- [브라우저 런타임 가이드](browser-runtime.md)

설치 기본 흐름은 "전체 스킬 설치 → 개별 기능 사용" 이다.
