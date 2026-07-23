# KERIS Academic Search

## What this skill does

KERIS가 운영하는 RISS 검색 Open API에서 학위논문, 국내외 학술논문, 단행본, 연구보고서, 학술지 메타데이터를 조회한다. 제목, 저자, 발행처, 연도, RISS 상세 링크, API가 반환한 원문 유무/무료 표시를 요약한다.

조회 전용이다. 기관 로그인, 구독 권한 우회, 복사·대출 신청, 유료 결제, 원문 다운로드는 자동화하지 않는다.

## Official access path

1. 기본 경로: 사용자 본인의 RISS 검색 API 키로 상류(`https://www.riss.kr/openApi`)를 직접 호출한다. 이 스킬은 `k-skill-proxy`를 사용하지 않는다.
2. 상류 계약: `key`, `version=1.0`, `type`별 XML, `rsnum`, `rowcount(최대 100)`
3. 공식 문서: RISS API 센터(<https://www.riss.kr/apicenter/apiMain.do>)의 학위논문/국내학술논문/해외학술논문/단행본/연구보고서/학술지 검색 API 정보

### RISS API 키 발급

RISS 검색 Open API 키는 **공익 목적의 비영리 기관/대학에만** 무료로 발급된다(향후 민간 확대 예정). data.go.kr 키와 완전히 별개다.

1. RISS(<https://www.riss.kr>)에 기관 소속으로 회원가입/로그인
2. RISS API 센터 → **RISS 검색 API** 선택 → 이용신청(<https://riss.kr/openAPI/OpenApiRegisterFinal.do>)
3. KERIS 담당자 심사·승인 후 인증키(`key` 파라미터) 발급
4. 발급받은 키를 `KSKILL_RISS_API_KEY`(호환 `RISS_API_KEY`) 환경변수 또는 `~/.config/k-skill/secrets.env`에 설정

공공데이터포털 데이터셋 `15071949`는 RISS 종합목록의 정적 파일/카탈로그 현황 관련 표면이다. 기사·논문 검색 API가 아니므로 검색 fallback으로 사용하지 않는다. 데이터셋 `3046254`는 관련 카탈로그 항목이지만 실제 검색 계약은 RISS API 센터와 `/openApi`를 기준으로 한다.

## Commands

```bash
python3 scripts/keris_academic.py search --keyword '인공지능 교육'
python3 scripts/keris_academic.py search --title '대학도서관' --author '김연구' --resource-type T
python3 scripts/keris_academic.py search --keyword '한국어 교육' --resource-type D --page 2 --page-size 20 --json
```

검색 필드는 `keyword`, `title`, `author`, `subject`, `publisher`이며 하나 이상 필요하다. `page`는 1 이상, `pageSize`는 1~100이다. RISS의 `rsnum`은 `(page-1)*pageSize+1`로 계산한다. 실제 호출에는 사용자 RISS 키가 필요하다.

여러 upstream type을 합치는 `ALL`과 `A`는 첫 페이지에서 type별 결과를 round-robin으로 합친다. 정확한 후속 페이지가 필요하면 `T`, `D`, `B` 또는 실제 단일 자료유형 검색을 사용한다. 결합 검색은 upstream을 type 수만큼 호출한다.

사용자 resource type alias:

- `ALL`: 공식 `T/A/O/U/F/S`를 모아 최대 `pageSize`건 반환
- `T`: 학위논문, 공식 `T`
- `A`: 국내+해외 학술논문, 공식 `A/O`
- `D`: 국내 학술논문(domestic article) 호환 alias, 공식 `A`
- `B`: 단행본(book) 호환 alias, 공식 `U`

응답 item의 `resource_type`에는 alias가 아니라 실제 RISS 코드를 보존한다.

## Credentials

```bash
python3 scripts/keris_academic.py search --keyword '교육 데이터' --resource-type ALL --dry-run
```

- RISS 키: `KSKILL_RISS_API_KEY`, 없으면 compatibility `RISS_API_KEY`, 이후 `~/.config/k-skill/secrets.env`
- `DATA_GO_KR_API_KEY`는 RISS 검색에 사용하지 않는다
- `--dry-run`은 키를 발급받기 전에도 호출 URL을 확인할 수 있으며 키를 `REDACTED`로 표시한다
- 키가 없으면 실행을 중단하고 RISS API 센터 발급 안내를 출력한다

## Output and fallback order

1. 검색 성공 결과를 제목, 저자, 발행처/학술지, 연도, 링크, 원문 상태로 요약한다.
2. 키가 없으면 RISS API 센터에서 검색 API 키를 발급받도록 안내한다.
3. RISS 장애/쿼터/파싱 오류를 웹 scraping이나 data.go.kr `15071949`로 대체하지 않는다.
4. 빈 결과는 성공(`items: []`)으로 유지하고 검색어/자료유형을 조정한다.

## Failure modes

- missing key: 실행 중단 + RISS API 센터 키 발급 안내(exit 1)
- invalid input: 입력 검증 오류 메시지(exit 1)
- RISS 인증 오류 또는 HTTP 401/403: 키/기관 권한 확인 안내(exit 1)
- 호출량/쿼터 초과 또는 HTTP 429: 쿼터 초과 안내(exit 1)
- upstream network/HTTP failure: 네트워크/HTTP 오류 메시지(exit 1)
- empty/malformed/unexpected XML: XML 파싱 오류 메시지(exit 1)
- empty result: 성공 응답과 빈 `items`
- login/licensed full text: 상세 링크만 제공하고 자동 다운로드하지 않음

## Done when

- 검색 조건과 실제 RISS 자료유형이 명시됐다.
- 결과 또는 typed failure를 제공했다.
- 원문 유무 표시는 API 값으로만 설명했고 접근권한을 보장하거나 다운로드를 자동화하지 않았다.
