# 공유누리 공공시설 검색

## What this skill does

`sharenuri-facility-search`는 행정안전부 **공유누리**(공공개방자원 포털, `https://www.eshare.go.kr`)의 로그인 없이 열려 있는 통합검색 표면을 호출해 전국 공공개방자원을 조회한다.

- 대상: 공유누리에 등록된 공공개방자원 전체 — 시설·공간(대관), 물품(대여), 연구·실험장비, 교육·강좌, 공연·전시·행사 (5개 대분류, 2026-09-12 실측)
- 검색 조건: 키워드, 시·도, 시군구, 자원 대분류, 무료 여부, 인터넷 예약 가능 여부
- 상세 조회: 자원분류, 명칭, 장소, 제공기관, 담당자, 예약방법, 예약문의, 이용대상, 이용정원, 심사여부, 이용요금 등 기본정보 표

조회 전용이다. 공유누리 로그인, 예약 신청, 결제, 신청서 제출은 자동화하지 않는다. 예약은 상세 URL의 공식 화면에서 사용자가 직접 진행하도록 안내한다.

## Public access path discovered

### Primary source: 공유누리 통합검색 (인증키·로그인 불필요)

2026-09-12 curl 실측으로 확인한 공개 read-only 경로다. 모두 익명 세션 쿠키만으로 동작했다.

| 용도 | 경로 | 비고 |
| --- | --- | --- |
| 세션 시작 | `GET /UserPortal/adv/unifdSearch/UnifiedSearchMainView.do` | 검색 POST 전 1회 호출해 쿠키 확보 |
| 자원 검색 | `POST /UserPortal/adv/unifdSearch/ConditionsSearch.do` | HTML fragment 반환, `collection=resource_cate1`이 자원정보 |
| 시군구 코드 | `POST /UserPortal/comm/zip/selectsigunguList.do` (`addr=<시도코드>`) | JSON 반환 |
| 대분류 코드 | `POST /UserPortal/Upm/searchUserPortalRsrcCls.do` (`rsrcClsCd=1`) | JSON 반환 |
| 상세 페이지 | `GET /UserPortal/<Upv 경로>/index.do?rsrc_no=<번호>&rsrc_dcd=<코드>` | 로그인 없이 기본정보 표 열람 가능 |

검색 파라미터(통합검색 화면 JS `getterDetailParameters()` 기준): `searchWrd`, `ctrd`(시·도 코드), `sigg`(시군구 코드), `mj_rsrc_cls_cd`(대분류), `free_yn=Y`(무료만), `intnet_rsrv_psbl_yn=Y`(인터넷 예약 가능만), `sort=RANK`, `order=DESC`, `pageIndex`(1부터), `viewType=UnitPage`.

검색 결과의 `rsrcDcd` 7~9번째 자리(예: `CPS001.002` → `002`)로 상세 페이지 경로를 고른다 (화면 JS `fnNewPageResourceDetail` 기준): `001`→`Upv/UprResrcGym`, `002`/`098`→`Upv/UprResrcFacl`, `003`→`Upv/UprResrcCamp`, `004`→`Upv/UprResrcEqp`, `005`→`Upv/UprResrcGds`, `006`→`Upv/UprResrcEdu`, `007`→`Upv/UprResrcExpr`, `008`→`Upv/UprResrcPfm`, `009`→`Upv/UprResrcEvnt`.

실측 근거 (2026-09-12):

- `searchWrd=회의실` → 총 5,828건, 첫 페이지 10건 반환
- `searchWrd=회의실&ctrd=11&sigg=11680&free_yn=Y` (서울 강남구 무료) → 총 8건
- 존재하지 않는 검색어 → `총 0건` + "목록이 없는" 마크업
- 상세 `rsrc_no=FF20O3200420` → 200, 기본정보 표(자원분류~이용요금) 확인

### Fallback / 공식 대안 (인증키 필요, 이 스킬에서는 사용하지 않음)

같은 데이터를 공식 키 기반 API로도 받을 수 있다. 레포 정책상 "인증 없이 동작하는 공개 read-only endpoint"가 있으므로 프록시 route는 추가하지 않았다.

- 공유누리 OPEN API (`https://www.eshare.go.kr/OpenApi/Info/index.do`): 담당자 승인제 인증키 발급
- 공공데이터포털: `행정안전부_공공개방자원 물품 목록`(data.go.kr 15077523), `행정안전부_공공개방자원 문화숙박시설 목록`(15077518), `행정안전부_공공개방자원 관리기관 정보`(15076186) 등 — 활용신청 후 서비스키 필요

## When to use

- "우리 동네 무료 회의실 예약 가능한 곳 찾아줘"
- "서울 강남구에서 대관 가능한 공공 강의실 조회해줘"
- "공유누리에서 캠핑장/체육관/주차장 검색해줘"
- "이 시설 예약 문의 전화번호랑 요금 알려줘"

## When not to use

- 예약 신청·결제·신청서 제출까지 자동화하려는 경우 (공유누리 로그인 영역, 하지 않음)
- 공유누리에 등록되지 않은 시설 (서울 공공서비스예약 등 지자체 자체 예약 시스템만 있는 시설은 안 잡힐 수 있음)
- 실시간 잔여 좌석/시간대별 예약 현황이 필요한 경우 (이 스킬은 자원 정보와 예약 경로만 다룬다)

## Prerequisites

- 인터넷 연결, `python3` (표준 라이브러리만 사용)
- 시크릿·API 키·로그인 불필요

## Inputs

- `search` 하위명령:
  - `--query`, `-q`: 검색어 (필수)
  - `--sido`: 시·도 이름 (예: `서울특별시`) 또는 `--ctrd`: 시·도 코드 (예: `11`)
  - `--sigg`: 시군구 코드 (`sigungu` 하위명령으로 조회, 예: 강남구 `11680`)
  - `--major-code`: 자원 대분류 코드 (`categories` 하위명령으로 조회, 예: 시설·공간(대관) `010000`)
  - `--free`: 무료 자원만, `--reservable`: 인터넷 예약 가능 자원만
  - `--page`: 시작 페이지 (기본 1), `--limit`: 최대 건수 (기본 10, 최대 50)
- `detail` 하위명령: `--rsrc-no`, `--rsrc-dcd` (검색 결과 항목의 값)
- `sigungu` 하위명령: `--ctrd` 시·도 코드
- `categories` 하위명령: 인자 없음
- 공통: `--json` 지정 시 JSON 출력 (기본은 사람용 텍스트)

## Workflow

### 1. 키워드로 검색

```bash
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  search --query 회의실 --limit 10
```

### 2. 지역·조건으로 좁히기

시군구 코드가 필요하면 먼저 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  sigungu --ctrd 11

npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  search --query 회의실 --sido 서울특별시 --sigg 11680 --free --json
```

### 3. 상세정보와 예약 경로 확인

```bash
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  detail --rsrc-no FF20O3200420 --rsrc-dcd CPS001.002
```

답변할 때는 결과가 나온 공식 출처(공유누리 상세 URL)를 함께 보여준다. 예약을 원하면 해당 상세 URL의 공식 화면에서 사용자가 직접 로그인·신청하도록 안내하고, 대신 예약하지 않는다.

## Done when

- 통합검색 `ConditionsSearch.do`를 호출해 총 건수와 항목(명칭·분류·위치·요금·상세 URL)을 얻었다.
- 요청한 필터(지역·무료·예약가능·대분류)가 요청 파라미터에 반영됐다.
- 상세 요청 시 기본정보 표의 예약방법·문의처·요금을 공식 상세 URL과 함께 전달했다.
- 로그인, 예약 신청, 결제, 신청서 제출은 실행하지 않았다.

## Failure modes

- `총 0건`: 조건에 맞는 자원이 없음. 검색어를 넓히거나 필터를 해제해 재시도한다.
- 시군구/대분류 응답이 JSON이 아님: 공유누리 화면 구조 변경 가능성. 공유누리 통합검색 화면(`https://www.eshare.go.kr/UserPortal/adv/unifdSearch/UnifiedSearchMainView.do`)을 브라우저로 직접 안내한다.
- 상세 페이지에서 기본정보를 찾지 못함: `rsrc_no`/`rsrc_dcd`가 오래됐거나 화면 구조 변경. 검색을 다시 실행해 최신 식별자를 얻는다.
- 연결 실패/타임아웃: 공유누리 서버 점검 또는 네트워크 문제. 잠시 후 재시도하며, 반복 호출로 우회하지 않는다.
- 공유누리 미등록 시설: 결과에 없다고 시설이 존재하지 않는 것은 아니다. 지자체 자체 예약 사이트(예: 서울 공공서비스예약)를 별도로 안내한다.

## Official surfaces

- 공유누리 포털: <https://www.eshare.go.kr>
- 통합검색 화면: <https://www.eshare.go.kr/UserPortal/adv/unifdSearch/UnifiedSearchMainView.do>
- 공유누리 OPEN API 안내: <https://www.eshare.go.kr/OpenApi/Info/index.do>
- 공공데이터포털 공유누리 데이터셋: <https://www.data.go.kr/data/15077523/openapi.do>, <https://www.data.go.kr/data/15077518/openapi.do>, <https://www.data.go.kr/data/15076186/openapi.do>
