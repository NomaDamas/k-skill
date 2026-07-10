# API Keys 발급 가이드

k-skill-proxy가 주입할 수 있는 모든 API 키의 발급처와 방법을 정리한다.

전부 **무료**다. 발급받은 키를 `proxy-secrets.env` 파일에 넣는다.

## 필수 키 (대부분의 스킬을 커버)

### DATA_GO_KR_API_KEY — 공공데이터포털

- **발급 URL**: https://www.data.go.kr → 회원가입 → 마이페이지 → "인증키 신청"
- **용도**: 부동산 실거래가, 학교 급식 식단, 의약품 안전, 식품 안전, 국민연금 사업장, 금융위 기업정보, 나라장터 발주/제재, K-Startup, 생활쓰레기 배출정보 등
- **특이사항**: 키가 percent-encoding 되어 복사됨. 그대로 넣어도 된다
- **복수 서비스**: 이 키 하나로 공공데이터포털의 모든 open API에 접근 가능

### KOSIS_API_KEY — 국가통계포털

- **발급 URL**: https://kosis.kr/openapi/ → 회원가입 → "활용신청" (상시신청)
- **용도**: 한국 공식 통계 (인구, 물가, 고용 등) 검색/조회
- **특이사항**: 활용신청 후 승인까지 최대 1~2일 소요 가능

### KMA_OPEN_API_KEY — 기상청

- **발급 URL**: https://www.data.go.kr/data/15084084/openapi.do (기상청 단기예보 조회서비스) → "활용신청"
- **용도**: 한국 날씨 조회

### AIR_KOREA_OPEN_API_KEY — 에어코리아

- **발급 URL**: https://www.data.go.kr/data/15073861/openapi.do (대기오염정보 조회 서비스) → "활용신청"
- **용도**: 미세먼지(PM10/PM2.5) 조회

### SEOUL_OPEN_API_KEY — 서울 열린데이터광장

- **발급 URL**: https://data.seoul.go.kr/ → 회원가입 → "인증키 신청"
- **용도**: 서울 지하철 도착정보, 실시간 혼잡도, 따릉이 대여소

### KAKAO_REST_API_KEY — Kakao Developers

- **발급 URL**: https://developers.kakao.com/ → 로그인 → "내 애플리케이션" → 앱 생성 → REST API 키 발급
- **용도**: 카카오맵 장소 검색, 주소↔좌표 변환, 자동차 길찾이, 근처 술집
- **특이사항**: 발급 후 "플랫폼 설정"에서 Web 플랫폼을 추가하고 사이트 도메인을 등록해야 할 수 있음

### OPINET_API_KEY — 오피넷

- **발급 URL**: https://www.opinet.co.kr/ → "오피넷 오픈API" 하단 → 신청서 다운로드/이메일 신청
- **용도**: 근처 가장 싼 주유소 조회
- **특이사항**: 이메일 심사 후 발급 (1~3일)

### HRFCO_OPEN_API_KEY — 한국하천정보

- **발급 URL**: https://www.data.go.kr/data/15096280/openapi.do (하천수위수질개방서비스) → "활용신청"
- **용도**: 한강 수위 정보

---

## 선택 키 (특정 스킬만 필요)

### KRX_API_KEY — 한국거래소

- **발급 URL**: https://data.krx.co.kr/ → "회원가입" → 마이페이지 → "OPEN API 신청"
- **용도**: 한국 주식 정보 조회 (KRX 상장 종목 검색, 시세)
- **특이사항**: 웹에서만 신청 가능, 이메일 승인 필요

### DATA4LIBRARY_AUTH_KEY — 도서관 정보나루

- **발급 URL**: https://data4library.kr/ → 회원가입 → "API 활용 신청"
- **용도**: 도서관 도서 검색, 상세 조회, 소장 도서관 확인

### KEDU_INFO_KEY — 교육행정정보시스템 (NEIS)

- **발급 URL**: https://open.neis.go.kr/ → 회원가입 → "API 활용신청"
- **용도**: 학교 검색, 학교 급식 식단 조회

### FOODSAFETYKOREA_API_KEY — 식품안전정보포털

- **발급 URL**: https://www.foodsafetykorea.go.kr/api/openApiInfo.do → "API 신청"
- **용도**: 식품 안전 (식약처 부적합 식품, 회수 정보 보충)
- **특이사항**: `DATA_GO_KR_API_KEY`만으로도 식품 안전 기본 기능이 동작함. 이 키는 추가 데이터용

### NAVER_SEARCH_CLIENT_ID + NAVER_SEARCH_CLIENT_SECRET — Naver Developers

- **발급 URL**: https://developers.naver.com/ → "Application 등록" → "검색" API 선택
- **용도**: 네이버 쇼핑 검색, 네이버 뉴스 검색
- **특이사항**: Client ID와 Client Secret 두 개가 한 쌍으로 필요

### LAW_OC — 국가법령정보센터

- **발급 URL**: https://open.law.go.kr → 회원가입 → "OPEN API 안내" → 인증키 신청
- **용도**: 한국 법령/조문/판례/유권해석 검색
- **특이사항**: `OC` 파라미터값만 사용. 이메일 주소 기반 발급

---

## 런타임 환경변수 (선택)

proxy 동작을 미세 조정할 때 설정한다. 기본값으로 충분하다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `KSKILL_PROXY_HOST` | `0.0.0.0` | 바인드 주소 |
| `KSKILL_PROXY_PORT` | `8080` | 포트 (`PORT` 환경변수로도 덮어쓰기 가능) |
| `KSKILL_PROXY_CACHE_TTL_MS` | `300000` (5분) | 응답 캐시 유지 시간 |
| `KSKILL_PROXY_RATE_LIMIT_WINDOW_MS` | `60000` (1분) | rate limit 윈도우 |
| `KSKILL_PROXY_RATE_LIMIT_MAX` | `60` | 분당 최대 요청 수 |

## proxy-secrets.env 전체 템플릿

```bash
# === 필수 (대부분의 스킬) ===
DATA_GO_KR_API_KEY=발급받은키
KOSIS_API_KEY=발급받은키
KMA_OPEN_API_KEY=발급받은키
AIR_KOREA_OPEN_API_KEY=발급받은키
SEOUL_OPEN_API_KEY=발급받은키
KAKAO_REST_API_KEY=발급받은키
OPINET_API_KEY=발급받은키
HRFCO_OPEN_API_KEY=발급받은키

# === 선택 (특정 스킬) ===
KRX_API_KEY=
DATA4LIBRARY_AUTH_KEY=
KEDU_INFO_KEY=
FOODSAFETYKOREA_API_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
LAW_OC=

# === 런타임 (기본값으로 충분) ===
KSKILL_PROXY_HOST=0.0.0.0
KSKILL_PROXY_PORT=8080
```
