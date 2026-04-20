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

"사용자 로그인" 컬럼은 **사용자 본인이 직접 로그인/시크릿을 들고 있어야 하는지** 만 표시합니다. `k-skill-proxy` 등 운영자가 관리하는 키는 사용자 입장에서는 **불필요**로 분류합니다. **선택사항**은 사용자가 운영자 키를 직접 들고 있으면 더 풍부한 경로가 켜지고, 없으면 기본 경로(보통 운영자가 관리하는 hosted fallback)로 그대로 동작하는 경우를 말합니다.

| 할 수 있는 일 | 설명 | 사용자 로그인 | 문서 |
| --- | --- | --- | --- |
| SRT 예매 | SRT 열차 조회, 예약, 예약 확인, 취소 | 필요 | [SRT 예매 가이드](docs/features/srt-booking.md) |
| KTX 예매 | KTX/Korail 열차 조회, 예약, 예약 확인, 취소 | 필요 | [KTX 예매 가이드](docs/features/ktx-booking.md) |
| 카카오톡 Mac CLI | macOS에서 카카오톡 대화 조회, 검색, 메시지 전송 | 불필요 | [카카오톡 Mac CLI 가이드](docs/features/kakaotalk-mac.md) |
| 서울 지하철 도착정보 조회 | 서울 지하철 역 기준 실시간 도착 예정 열차 확인 | 불필요 | [서울 지하철 도착정보 가이드](docs/features/seoul-subway-arrival.md) |
| 지하철 분실물 조회 | 지하철 역/물품명 기준 공식 LOST112 분실물 검색 조건과 유실물센터 진입점 안내 | 불필요 | [지하철 분실물 조회 가이드](docs/features/subway-lost-property.md) |
| 긱뉴스 조회 | GeekNews 공개 RSS/Atom 피드 기반 최신 글 목록, 검색, 상세 확인 | 불필요 | [긱뉴스 조회 가이드](docs/features/geeknews-search.md) |
| 한국 날씨 조회 | 기상청 단기예보 기반 한국 날씨 조회 | 불필요 | [한국 날씨 조회 가이드](docs/features/korea-weather.md) |
| 사용자 위치 미세먼지 조회 | 현재 위치 또는 지역 기준 PM10/PM2.5 미세먼지 조회 | 불필요 | [사용자 위치 미세먼지 조회 가이드](docs/features/fine-dust-location.md) |
| 한강 수위 정보 조회 | 한강 관측소 기준 현재 수위·유량·기준수위 확인 | 불필요 | [한강 수위 정보 가이드](docs/features/han-river-water-level.md) |
| 한국 법령 검색 | 한국 법령/조문/판례/유권해석 검색 | 불필요 | [한국 법령 검색 가이드](docs/features/korean-law-search.md) |
| 한국 개인정보처리방침·이용약관 자동 생성 | Next.js 프로젝트에 개인정보보호법·약관규제법·전자상거래법 기반 개인정보처리방침/이용약관/쿠키 배너/동의 모달을 생성하는 `kimlawtech/korean-privacy-terms` (Apache-2.0) thin wrapper | 불필요 | [한국 개인정보처리방침·이용약관 자동 생성 가이드](docs/features/korean-privacy-terms.md) |
| 한국 부동산 실거래가 조회 | 아파트/오피스텔/빌라/단독주택 실거래가·전월세·지역코드 조회 | 불필요 | [한국 부동산 실거래가 조회 가이드](docs/features/real-estate-search.md) |
| 장학금 검색 및 조회 | 한국장학재단·전국 대학교·재단·기업 장학 공고를 검색해 금액·자격·지원구간·링크를 정리하고 KST 기준 현재 날짜 마감 상태와 조건별 필터링까지 제공 | 불필요 | [장학금 검색 및 조회 가이드](docs/features/korean-scholarship-search.md) |
| 생활쓰레기 배출정보 조회 | 시군구 기준 생활쓰레기·음식물·재활용 배출요일·시간·장소·관리부서 확인 | 불필요 | [생활쓰레기 배출정보 조회 가이드](docs/features/household-waste-info.md) |
| 학교 급식 식단 조회 | 교육청·학교명으로 NEIS 학교 검색·급식 식단 조회 | 불필요 | [학교 급식 식단 조회 가이드](docs/features/k-schoollunch-menu.md) |
| 도서관 도서 조회 | 도서관 정보나루 기반 도서 검색, 상세, 소장 도서관, 도서관별 소장 여부 조회 | 불필요 | [도서관 도서 조회 가이드](docs/features/library-book-search.md) |
| 의약품 안전 체크 | 식약처 e약은요·안전상비의약품 정보를 인터뷰-first 흐름으로 프록시 조회 | 불필요 | [의약품 안전 체크 가이드](docs/features/mfds-drug-safety.md) |
| 식품 안전 체크 | 식약처 부적합 식품·식품안전나라 회수 정보를 인터뷰-first 흐름으로 프록시 조회 | 불필요 | [식품 안전 체크 가이드](docs/features/mfds-food-safety.md) |
| 한국 주식 정보 조회 | KRX 상장 종목 검색, 기본정보, 일별 시세 조회 | 불필요 | [한국 주식 정보 조회 가이드](docs/features/korean-stock-search.md) |
| 조선왕조실록 검색 | 조선왕조실록 키워드 검색과 왕별/연도별 필터, 기사 발췌 조회 | 불필요 | [조선왕조실록 검색 가이드](docs/features/joseon-sillok-search.md) |
| 한국 특허 정보 검색 | 한국 특허/실용신안 키워드 검색 및 출원번호 상세 조회 | 필요 | [한국 특허 정보 검색 가이드](docs/features/korean-patent-search.md) |
| 근처 가장 싼 주유소 찾기 | 현재 위치 기준 근처 최저가 주유소 조회 | 불필요 | [근처 가장 싼 주유소 찾기 가이드](docs/features/cheap-gas-nearby.md) |
| 근처 공중화장실 찾기 | 현재 위치 기준 근처 공중화장실/개방화장실 조회 | 불필요 | [근처 공중화장실 찾기 가이드](docs/features/public-restroom-nearby.md) |
| 근처 공영주차장 찾기 | 현재 위치 기준 근처 공영주차장 위치·요금·운영시간 조회 | 불필요 | [근처 공영주차장 찾기 가이드](docs/features/parking-lot-search.md) |
| KBO 경기 결과 조회 | 날짜별 KBO 경기 일정, 결과, 팀별 필터링 | 불필요 | [KBO 결과 가이드](docs/features/kbo-results.md) |
| KBL 경기 결과 조회 | 날짜별 KBL 경기 일정, 결과, 팀별 필터링, 현재 순위 확인 | 불필요 | [KBL 경기 결과 가이드](docs/features/kbl-results.md) |
| K리그 경기 결과 조회 | 날짜별 K리그1/K리그2 경기 결과, 팀별 필터링, 현재 순위 확인 | 불필요 | [K리그 결과 가이드](docs/features/kleague-results.md) |
| LCK 경기 분석 | LCK 경기 결과, 현재 순위, live turning point, 밴픽, 패치 메타, 팀 파워 레이팅 | 불필요 | [LCK 경기 분석 가이드](docs/features/lck-analytics.md) |
| 토스증권 조회 | 토스증권 계좌 요약, 포트폴리오, 시세, 주문내역, 관심종목 조회 | 필요 | [토스증권 조회 가이드](docs/features/toss-securities.md) |
| 하이패스 영수증 발급 | 하이패스 사용내역 조회 및 영수증 출력 payload 준비 | 필요 | [하이패스 영수증 발급 가이드](docs/features/hipass-receipt.md) |
| 로또 당첨 확인 | 로또 최신 회차, 특정 회차, 번호 대조 | 불필요 | [로또 결과 가이드](docs/features/lotto-results.md) |
| HWP 문서 처리 | `.hwp/.hwpx` → Markdown/JSON 변환, 문서 비교, 양식 필드 추출, Markdown→HWPX 역변환 | 불필요 | [HWP 문서 처리 가이드](docs/features/hwp.md) |
| ~~근처 블루리본 맛집~~ ⚠️ 지원 중단 | ~~현재 위치 기준 근처 블루리본 선정 맛집 조회~~ | ~~불필요~~ | ~~[근처 블루리본 맛집 가이드](docs/features/blue-ribbon-nearby.md)~~ |
| 근처 술집 조회 | 현재 위치 기준 영업 상태·메뉴·좌석·전화번호가 포함된 근처 술집 조회 | 불필요 | [근처 술집 조회 가이드](docs/features/kakao-bar-nearby.md) |
| 우편번호 검색 | 주소 키워드로 우편번호 + 공식 영문주소 조회 | 불필요 | [우편번호 검색 가이드](docs/features/zipcode-search.md) |
| 다이소 상품 조회 | 다이소 매장별 상품 재고 확인 | 불필요 | [다이소 상품 조회 가이드](docs/features/daiso-product-search.md) |
| 마켓컬리 상품 조회 | 마켓컬리 상품 검색, 현재 가격, 할인 여부, 품절 여부 조회 | 불필요 | [마켓컬리 상품 조회 가이드](docs/features/market-kurly-search.md) |
| 올리브영 검색 | 올리브영 매장·상품·재고 조회 | 불필요 | [올리브영 검색 가이드](docs/features/olive-young-search.md) |
| 올라포케 역삼 포케 | 올라포케 역삼점 메뉴, 매장 정보, 이벤트 참여 흐름 안내 | 불필요 | [올라포케 역삼 포케 가이드](docs/features/hola-poke-yeoksam.md) |
| 택배 배송조회 | CJ대한통운·우체국 송장 번호로 배송 상태 조회 | 불필요 | [택배 배송조회 가이드](docs/features/delivery-tracking.md) |
| 쿠팡 상품 검색 | 쿠팡 상품 검색, 로켓배송 필터, 가격대 검색, 비교, 베스트, 골드박스 특가 조회 | 선택사항 (운영 키 있으면 로컬 HMAC 경로, 없으면 hosted fallback) | [쿠팡 상품 검색 가이드](docs/features/coupang-product-search.md) |
| 번개장터 검색 | 번개장터 검색, 상세조회, 선택적 찜/채팅, AI TOON export | 불필요 | [번개장터 검색 가이드](docs/features/bunjang-search.md) |
| 중고차 가격 조회 | 중고차 인수가/월 렌트료 비교 조회 | 불필요 | [중고차 가격 조회 가이드](docs/features/used-car-price-search.md) |
| 한국어 맞춤법 검사 | 한국어 텍스트 맞춤법/문법 검사 및 교정안 정리 | 불필요 | [한국어 맞춤법 검사 가이드](docs/features/korean-spell-check.md) |
| 네이버 블로그 리서치 | 네이버 블로그 검색, 원문 읽기, 이미지 다운로드, 한국어 콘텐츠 교차 검증 | 불필요 | [네이버 블로그 리서치 가이드](docs/features/naver-blog-research.md) |
| 네이버 쇼핑 가격비교 | 네이버 검색 Open API 우선, 공개 BFF JSON fallback으로 상품 후보·현재 노출가·판매처 링크 비교 | 불필요 | [네이버 쇼핑 가격비교 가이드](docs/features/naver-shopping-search.md) |
| 한국어 글자 수 세기 | 한국어 텍스트의 글자 수·줄 수·UTF-8/NEIS byte 수를 결정론적으로 계산 | 불필요 | [한국어 글자 수 세기 가이드](docs/features/korean-character-count.md) |

> ## ⚠️ 근처 블루리본 맛집 스킬 — 지원 중단
>
> **블루리본 측이 `www.bluer.co.kr` 에 자동화 접근 전면 차단을 적용해 스킬이 더 이상 동작하지 않습니다.**
>
> - 브라우저·`curl`·Playwright·TLS impersonation 등 가능한 우회를 모두 검증했지만 nginx 단에서 403이 반환되며, 같은 가구 공인 IP로도 특정 장비만 차단되는 상황이 관측되었습니다.
> - 유료 회원권 보유자도 접근이 막히는 사례가 확인되었습니다. 복구 여부와 일정은 블루리본 측 정책에 전적으로 달려 있어 이 레포에서 대응할 수 있는 범위를 벗어났습니다.
> - 해당 스킬 디렉토리(`blue-ribbon-nearby/`)와 관련 프록시 라우트는 히스토리 보존을 위해 당분간 남겨두지만, **새 프로젝트에서는 해당 스킬을 사용하지 마세요.** 차단이 해제되는 날이 오면 이 안내를 제거하고 재검증하겠습니다.

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
- [지하철 분실물 조회 가이드](docs/features/subway-lost-property.md)
- [긱뉴스 조회 가이드](docs/features/geeknews-search.md)
- [한국 날씨 조회 가이드](docs/features/korea-weather.md)
- [사용자 위치 미세먼지 조회](docs/features/fine-dust-location.md)
- [한강 수위 정보 가이드](docs/features/han-river-water-level.md)
- [한국 법령 검색 가이드](docs/features/korean-law-search.md)
- [한국 개인정보처리방침·이용약관 자동 생성 가이드](docs/features/korean-privacy-terms.md)
- [한국 부동산 실거래가 조회 가이드](docs/features/real-estate-search.md)
- [장학금 검색 및 조회 가이드](docs/features/korean-scholarship-search.md)
- [생활쓰레기 배출정보 조회 가이드](docs/features/household-waste-info.md)
- [학교 급식 식단 조회 가이드](docs/features/k-schoollunch-menu.md)
- [도서관 도서 조회 가이드](docs/features/library-book-search.md)
- [의약품 안전 체크 가이드](docs/features/mfds-drug-safety.md)
- [식품 안전 체크 가이드](docs/features/mfds-food-safety.md)
- [한국 주식 정보 조회 가이드](docs/features/korean-stock-search.md)
- [조선왕조실록 검색 가이드](docs/features/joseon-sillok-search.md)
- [한국 특허 정보 검색 가이드](docs/features/korean-patent-search.md)
- [근처 가장 싼 주유소 찾기 가이드](docs/features/cheap-gas-nearby.md)
- [근처 공중화장실 찾기 가이드](docs/features/public-restroom-nearby.md)
- [근처 공영주차장 찾기 가이드](docs/features/parking-lot-search.md)
- [KBO 경기 결과 조회](docs/features/kbo-results.md)
- [KBL 경기 결과 가이드](docs/features/kbl-results.md)
- [K리그 경기 결과 조회](docs/features/kleague-results.md)
- [LCK 경기 분석 가이드](docs/features/lck-analytics.md)
- [토스증권 조회 가이드](docs/features/toss-securities.md)
- [하이패스 영수증 발급 가이드](docs/features/hipass-receipt.md)
- [로또 당첨 확인](docs/features/lotto-results.md)
- [HWP 문서 처리](docs/features/hwp.md)
- [근처 블루리본 맛집 가이드](docs/features/blue-ribbon-nearby.md)
- [근처 술집 조회 가이드](docs/features/kakao-bar-nearby.md)
- [우편번호 검색](docs/features/zipcode-search.md)
- [다이소 상품 조회](docs/features/daiso-product-search.md)
- [마켓컬리 상품 조회 가이드](docs/features/market-kurly-search.md)
- [올리브영 검색 가이드](docs/features/olive-young-search.md)
- [올라포케 역삼 포케 가이드](docs/features/hola-poke-yeoksam.md)
- [택배 배송조회](docs/features/delivery-tracking.md)
- [쿠팡 상품 검색](docs/features/coupang-product-search.md)
- [번개장터 검색 가이드](docs/features/bunjang-search.md)
- [중고차 가격 조회 가이드](docs/features/used-car-price-search.md)
- [한국어 맞춤법 검사 가이드](docs/features/korean-spell-check.md)
- [네이버 블로그 리서치 가이드](docs/features/naver-blog-research.md)
- [네이버 쇼핑 가격비교 가이드](docs/features/naver-shopping-search.md)
- [한국어 글자 수 세기 가이드](docs/features/korean-character-count.md)
- [릴리스/배포 가이드](docs/releasing.md)

설치 기본 흐름은 "전체 스킬 설치 → `k-skill-setup` 실행 → 개별 기능 사용" 입니다.
