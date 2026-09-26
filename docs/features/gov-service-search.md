# 정부24 공공서비스(혜택) 검색

`gov-service-search`는 정부24 공공서비스(혜택) 정보 OpenAPI(data.go.kr 15113968)로 키워드·소관기관·분야·지역 기준으로 지원금·민원·정부서비스를 검색하고, 신청 방법·소관기관·온라인 신청 URL·지원조건을 조회한다. 조회 전용하는 스킬이다.

공공데이터포털의 **행정안전부_대한민국 공공서비스(혜택) 정보** (data.go.kr dataset `15113968`, 정부24와 동일한 실시간 정보)를 조회한다. upstream은 odcloud gateway 세 endpoint다.

- `serviceList` → `list`: 공공서비스 목록 (서비스명·소관기관·소관기관유형·사용자구분·서비스분야·수정일시 필터)
- `serviceDetail` → `detail`: 개별 서비스 상세 (서비스목적, 신청방법, 신청기한, 온라인신청사이트URL, 구비서류, 문의처, 근거 법령)
- `supportConditions` → `conditions`: 개별 서비스 지원조건 (성별·대상연령·중위소득·생애주기/가구/업종 코드)

이 helper는 조회 전용이다. `detail` 응답의 `온라인신청사이트URL`·`신청방법`·`구비서류`까지 요약해 주고, 실제 신청은 사용자가 공식 사이트에서 진행한다.

## 기본 경로

1. **`--via-proxy` (권장, route 배포 후)**: `k-skill-proxy`가 upstream 키를 보관하고 `/v1/gov24/*` 세 route로 중계한다. 사용자 키가 필요 없다. upstream이 키를 요구하므로 AGENTS.md의 free API proxy policy상 narrow allowlist + cache + rate limit 대상 route 후보다. **이 route는 아직 배포되지 않았을 수 있다** — helper에는 경로 계약만 구현돼 있고, `404`/`503`이면 다음 fallback을 쓴다.
   - `GET /v1/gov24/service-list`, `GET /v1/gov24/service-detail`, `GET /v1/gov24/support-conditions` (쿼리 파라미터는 아래 Inputs와 동일, `serviceKey`는 프록시 서버가 주입)
2. **BYOK 직접 호출 (기본)**: `--via-proxy` 없이 실행하면 `https://api.odcloud.kr/api/gov24/v3/<operation>`을 `Authorization` 헤더로 호출한다.
3. **키가 없을 때**: `--dry-run`으로 요청 URL/파라미터를 확정한 뒤, 사용자에게 위 발급 절차를 안내한다. 정부24 웹(<https://www.gov.kr>)의 서비스 검색 화면에서 같은 키워드로 확인하는 것은 가능하지만, 그 화면을 자동 우회·스크래핑하는 경로는 이 스킬의 범위가 아니다. CAPTCHA·본인인증은 우회하지 않는다.

## 실패 모드

- `exit 2` 입력 오류: 페이지/perPage 범위 초과, 날짜 형식 오류(불가능한 달력 날짜 포함), `updated_since > updated_until`, `detail`/`conditions`에서 `--service-id` 누락.
- `exit 3` 인증키 없음: `KSKILL_GOV24_API_KEY`가 환경변수·vault·`~/.config/k-skill/secrets.env` 어디에도 없음. 발급 절차를 안내하고 `--dry-run`으로 요청 점검.
- `exit 4` 네트워크 오류: DNS/연결 실패·타임아웃. `--via-proxy`면 프록시 다운 메시지가 함께 나온다.
- `401/403` 또는 envelope `code`가 `-401`/`20`/`30`/`31`: 키 미등록·만료·활용신청 미승인, Encoding 키 사용 등. data.go.kr `15113968` 활용신청 상태와 Decoding 키를 확인한다.
- `429` 또는 코드 `22`/`23`: 일일 한도(개발계정 10,000건) 또는 초당 한도 초과. 잠시 후 재시도하거나 트래픽 증설을 신청한다.
- `5xx`: upstream 장애/점검. 같은 요청을 반복하지 말고 잠시 후 재시도하며, 결과가 없으면 "조회 실패"로 보고한다.
- 비-JSON 응답(HTML 등) 또는 JSON이지만 문서화된 봉투(`data` 배열)가 아닌 응답(예: `[]`): upstream 차단·점검·계약 위반. 본문 앞부분만 요약해 `exit 5`로 실패 보고한다(성공한 빈 결과로 처리하지 않음).
- 빈 `data` 배열: 조건에 맞는 서비스 없음. 키워드/기관/분야를 넓히거나 `--page`를 늘린다. 지역·대상 client filter로 0건이 됐다면 `client_filter.upstream_returned`를 확인한다.
- `--via-proxy`에서 `404`: 프록시 route 미배포. `503 upstream_not_configured`: 프록시에 upstream 키 없음. 둘 다 BYOK 직접 호출로 전환한다.
- `conditions` 코드 해석: `JA0110`(연령 시작)·`JA0111`(연령 종료)이 `0`/빈 값이면 그 방향 제한 없음으로 본다. `--gender`도 `JA0101`(남)·`JA0102`(여) 코드가 둘 다 빈 값이면 성별 제한 없음으로 본다. 이 해석은 upstream 문서에 명시돼 있지 않으므로 원문 숫자를 함께 표기하고, 최종 자격은 `상세조회URL`에서 확인한다.
- 지역·대상 client filter는 본문 문자열 매칭이라, 본문에 지역명이 없는 전국 서비스는 `--region`에서 빠질 수 있다. 0건이라고 서비스가 없다는 뜻이 아니다.

## 참고

- 스킬 정의: `npx -y @nomadamas/k-skill@0 instruct gov-service-search`
- CLI: `npx -y @nomadamas/k-skill@0 exec gov-service-search scripts/gov_service_search.py -- --help`
