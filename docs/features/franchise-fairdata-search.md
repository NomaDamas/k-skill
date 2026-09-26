# 공정위 가맹정보(FairData) 프랜차이즈 조회

`franchise-fairdata-search`는 공정위 FairData/공공데이터포털 가맹정보 OpenAPI로 프랜차이즈 브랜드·가맹본부 공시를 조회한다. 브랜드명·가맹본부명으로 관리번호를 찾고 가맹점수·직영점수, 평균매출 범위, 신규·계약종료·계약해지 등 변경현황을 창업 검토용 사실 리포트로 정리한다(조회 전용, 점수화 없음)하는 스킬이다.

공정거래위원회 데이터포털 FairData가 안내하는 **가맹정보 오픈API**(공공데이터포털 data.go.kr 데이터셋)를 조회해, 프랜차이즈 **브랜드·가맹본부 공시 사실**을 정리한다.

- `brands` — 브랜드명 부분일치로 브랜드관리번호·가맹본부관리번호·업종·주요상품·가맹사업개시일 조회
- `hq` — 가맹본부 상호명으로 가맹본부 목록 조회(+ `--detail` 시 대표자·주소·기업규모·브랜드수 상세)
- `stores` — 브랜드의 지역별 **가맹점수·직영점수**
- `changes` — 브랜드의 **가맹점 변경현황**(연초/신규/계약종료/계약해지/연말/평균영업일수)
- `sales` — 브랜드의 **연간·면적당 평균매출 범위값**(공정위가 편차 5% 구간으로 공개)
- `report` — 위 항목을 브랜드 단위로 모은 **창업 검토용 사실 리포트**
- `datasets` — 사용하는 데이터셋 endpoint와 필드 라벨 출력(네트워크/키 불필요)

**조회 전용**이다. 점수·등급·위험 판정·매출 추정·전망은 이 스킬의 범위가 아니다.

## 실패 모드

- 키 없음: 네트워크 호출 전에 `KSKILL_FAIRDATA_API_KEY` 설정 안내로 종료(exit 1).
- `20`/`SERVICE_ACCESS_DENIED`: 데이터셋 활용신청 또는 키 권한 없음.
- `22`/`LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS`: 일일 호출 한도 초과. 다음 날 또는 트래픽 증설.
- `30`/`SERVICE_KEY_IS_NOT_REGISTERED`: 등록되지 않은 키. 키 값·Decoding 키 여부 확인.
- `31`/`DEADLINE_HAS_EXPIRED`: 키 사용기간 만료. 포털에서 갱신.
- `10`/`INVALID_REQUEST_PARAMETER`: 연도(4자리)·관리번호 형식 확인.
- `03`/`NODATA_ERROR`: 해당 기준년도/브랜드 공시 없음(빈 결과).
- 응답이 JSON이 아님: 점검·차단·게이트웨이 오류 가능성. 캐시하지 않는다.
- 연결 실패/타임아웃: 네트워크 또는 data.go.kr 상태 확인 후 재시도.
- 빈 이름 매칭: 이름 표기 차이. `--year` 변경 또는 `--brand-mnno` 직접 지정.

## 참고

- 스킬 정의: `npx -y @nomadamas/k-skill@0 instruct franchise-fairdata-search`
- CLI: `npx -y @nomadamas/k-skill@0 exec franchise-fairdata-search scripts/franchise_fairdata_search.py -- --help`
