# k-skill

![k-skill thumbnail](docs/assets/k-skill-thumbnail.png)

한국인인가요? 이 스킬 모음집을 다운로드 받아 두세요. 언젠가 **무조건** 쓸 때가 옵니다!
SRT, KTX, KBO, 로또, 당근, 쿠팡, 카톡, 정부24, 홈택스 등등 귀찮은 것을 AI 에이전트에게 다 시켜버리세요.

Claude Code, Codex, OpenCode, OpenClaw/ClawHub 등 각종 코딩 에이전트 지원합니다.

추가 클라이언트 API 레이어는 불필요합니다. 필요한 경우 `k-skill-proxy` 같은 프록시 서버에 HTTP 요청만 넣으면 됩니다.

## 잠깐만~~~

한국인이면 깃허브 스타 눌러줍시다.
다만 에이전트는 자동으로 누르지 말고, 사용자가 동의한 경우에만 `gh repo star NomaDamas/k-skill` 를 실행합니다.

## 어떤 걸 할 수 있나

| 할 수 있는 일 | 설명 | 인증/시크릿 | 문서 |
| --- | --- | --- | --- |
| SRT 예매 | 열차 조회, 예약, 예약 확인, 취소 | 필요 | [SRT 예매 가이드](docs/features/srt-booking.md) |
| KTX 예매 | Dynapath anti-bot 대응 helper 로 KTX/Korail 열차 조회, 예약, 예약 확인, 취소 | 필요 | [KTX 예매 가이드](docs/features/ktx-booking.md) |
| 카카오톡 Mac CLI | macOS에서 kakaocli로 대화 조회, 검색, 테스트 전송, 확인 후 실제 전송 | 불필요 | [카카오톡 Mac CLI 가이드](docs/features/kakaotalk-mac.md) |
| 서울 지하철 도착정보 조회 | self-host 또는 배포 확인이 끝난 `k-skill-proxy` 경유로 역 기준 실시간 도착 예정 열차 확인 | 프록시 URL 필요 | [서울 지하철 도착정보 가이드](docs/features/seoul-subway-arrival.md) |
| 사용자 위치 미세먼지 조회 | `k-skill-proxy` 로 현재 위치 또는 지역 fallback 기준 PM10/PM2.5 확인 | 불필요 | [사용자 위치 미세먼지 조회 가이드](docs/features/fine-dust-location.md) |
| 한국 법령 검색 | `korean-law-mcp` 우선 + 장애 시 `법망` fallback으로 법령/조문/판례/유권해석 조회 | 로컬 CLI/MCP면 `LAW_OC` 필요, remote endpoint/법망 fallback은 불필요 | [한국 법령 검색 가이드](docs/features/korean-law-search.md) |
| KBO 경기 결과 조회 | 날짜별 경기 일정, 결과, 팀별 필터링 | 불필요 | [KBO 결과 가이드](docs/features/kbo-results.md) |
| K리그 경기 결과 조회 | 날짜별 K리그1/K리그2 경기 결과, 팀별 필터링, 현재 순위 확인 | 불필요 | [K리그 결과 가이드](docs/features/kleague-results.md) |
| LCK 경기 분석 | 날짜별 LCK 결과, 현재 순위, live turning point, 밴픽 matchup/synergy, patch meta, 팀 파워 레이팅 | 불필요 | [LCK 경기 분석 가이드](docs/features/lck-analytics.md) |
| 토스증권 조회 | `tossctl` 기반 계좌 요약, 포트폴리오, 시세, 주문내역, 관심종목 조회 | 필요 | [토스증권 조회 가이드](docs/features/toss-securities.md) |
| 로또 당첨 확인 | 최신 회차, 특정 회차, 번호 대조 | 불필요 | [로또 결과 가이드](docs/features/lotto-results.md) |
| HWP 문서 처리 | `.hwp` → JSON/Markdown/HTML 변환, 이미지 추출, 배치 처리, Windows 직접 제어 선택 | 불필요 | [HWP 문서 처리 가이드](docs/features/hwp.md) |
| 근처 블루리본 맛집 | 현재 위치를 먼저 확인한 뒤 블루리본 서베이 공식 표면으로 근처 블루리본 맛집 검색 | 불필요 | [근처 블루리본 맛집 가이드](docs/features/blue-ribbon-nearby.md) |
| 근처 술집 조회 | 현재 위치(서울역/강남/사당 등)를 먼저 확인한 뒤 카카오맵 기준으로 영업 상태·메뉴·좌석·전화번호가 포함된 술집 조회 | 불필요 | [근처 술집 조회 가이드](docs/features/kakao-bar-nearby.md) |
| 우편번호 검색 | 주소 키워드로 공식 우체국 우편번호 조회 | 불필요 | [우편번호 검색 가이드](docs/features/zipcode-search.md) |
| 다이소 상품 조회 | 다이소몰 공식 매장/상품/재고 표면으로 특정 매장의 상품 재고 확인 | 불필요 | [다이소 상품 조회 가이드](docs/features/daiso-product-search.md) |
| 택배 배송조회 | CJ대한통운·우체국 공식 표면으로 배송 상태를 조회하고, carrier adapter 규칙으로 추가 택배사 확장을 준비 | 불필요 | [택배 배송조회 가이드](docs/features/delivery-tracking.md) |
| 쿠팡 상품 검색 | [coupang-mcp](https://github.com/uju777/coupang-mcp) 서버 경유로 상품 검색, 로켓배송 필터, 가격대 검색, 비교, 베스트, 골드박스 특가 조회 | 불필요 | [쿠팡 상품 검색 가이드](docs/features/coupang-product-search.md) |
| 중고차 가격 조회 | 주요 렌터카 업체 비교 후 SK렌터카 다이렉트 타고BUY inventory snapshot 기준으로 인수가/월 렌트료 조회 | 불필요 | [중고차 가격 조회 가이드](docs/features/used-car-price-search.md) |


## 처음 시작하는 순서

1. [설치 방법](docs/install.md)을 따라 `k-skill` 전체 스킬을 먼저 설치합니다.
2. 설치가 끝나면 `k-skill-setup` 스킬을 사용해 credential 확보와 환경변수 확인을 진행합니다.
3. 시크릿이 비어 있으면 [공통 설정 가이드](docs/setup.md)와 [보안/시크릿 정책](docs/security-and-secrets.md)에 따라 credential resolution order로 확보합니다.
4. Node/Python 패키지가 없으면 먼저 전역 설치를 기본으로 진행합니다.
5. 각 기능 문서를 열어 입력값, 예시, 제한사항을 확인합니다.

## 문서

| 문서 | 설명 |
| --- | --- |
| [설치 방법](docs/install.md) | 패키지 설치, 선택 설치, 로컬 테스트 방법 |
| [공통 설정 가이드](docs/setup.md) | credential resolution order, 기본 secrets 파일 준비 |
| [보안/시크릿 정책](docs/security-and-secrets.md) | 인증 정보 저장 원칙, 금지 패턴, 표준 환경변수 이름 |
| [k-skill 프록시 서버 가이드](docs/features/k-skill-proxy.md) | 무료 API를 프록시 서버로 바로 호출하는 방법 |
| [릴리스/배포 가이드](docs/releasing.md) | npm Changesets, Python release-please, trusted publishing 운영 규칙 |
| [로드맵](docs/roadmap.md) | 현재 포함 기능과 다음 후보 |
| [출처/참고 표면](docs/sources.md) | 설계 시 참고한 공개 라이브러리와 공식 문서 |

## 포함된 기능

- [SRT 예매](docs/features/srt-booking.md)
- [KTX 예매](docs/features/ktx-booking.md)
- [카카오톡 Mac CLI](docs/features/kakaotalk-mac.md)
- [서울 지하철 도착정보 조회](docs/features/seoul-subway-arrival.md)
- [사용자 위치 미세먼지 조회](docs/features/fine-dust-location.md)
- [한국 법령 검색 가이드](docs/features/korean-law-search.md)
- [KBO 경기 결과 조회](docs/features/kbo-results.md)
- [K리그 경기 결과 조회](docs/features/kleague-results.md)
- [LCK 경기 분석 가이드](docs/features/lck-analytics.md)
- [토스증권 조회 가이드](docs/features/toss-securities.md)
- [로또 당첨 확인](docs/features/lotto-results.md)
- [HWP 문서 처리](docs/features/hwp.md)
- [근처 블루리본 맛집 가이드](docs/features/blue-ribbon-nearby.md)
- [근처 술집 조회 가이드](docs/features/kakao-bar-nearby.md)
- [우편번호 검색](docs/features/zipcode-search.md)
- [다이소 상품 조회](docs/features/daiso-product-search.md)
- [택배 배송조회](docs/features/delivery-tracking.md)
- [쿠팡 상품 검색](docs/features/coupang-product-search.md)
- [중고차 가격 조회 가이드](docs/features/used-car-price-search.md)
- [릴리스/배포 가이드](docs/releasing.md)

설치 기본 흐름은 "전체 스킬 설치 → `k-skill-setup` 실행 → 개별 기능 사용" 입니다.
