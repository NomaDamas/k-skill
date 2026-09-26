# HIRA 의료기관 상세정보 조회

## What this skill does

건강보험심사평가원(HIRA)이 공공데이터포털과 보건의료빅데이터개방시스템으로 공개하는 의료기관 OpenAPI를 조회해 병원·의원·약국의 기본정보(주소·전화·종별·홈페이지)와 상세정보(진료과목, 의료장비, 특수진료/진료가능분야, 진료시간·응급실 운영, 교통편, 병상·간호등급 등)를 요약한다.

> 이 스킬은 공식 공개데이터를 정리하는 **정보 제공 도구**이며 진단·처방·진료 판단이 아니다. 응급상황이면 API 조회보다 **119 또는 응급의료포털(E-Gen)** 안내를 먼저 한다.

조회 전용(read-only)이다. 예약·접수·결제·진료 신청 등 부작용이 있는 동작은 하지 않는다.

## When to use

- "서울 강남구 상급종합병원 목록 찾아줘"
- "이 병원 진료과목이랑 보유 의료장비(MRI/CT) 알려줘"
- "부산 서구 내과 의원 검색해줘"
- "○○병원 주소·전화·응급실 운영 여부 확인해줘"
- "특수진료(진료가능분야) 가능한 병원인지 봐줘"

## When not to use

- 진단·처방·복약 판단이 필요한 경우 (의료진 상담)
- 실시간 응급실 병상·응급 플래그가 필요한 경우 (`emergency-room-beds` / 119 / E-Gen)
- 민간 병원 후보·시술 후기 비교가 목적인 경우 (`gangnamunni-clinic-search`)
- 예약·접수·결제를 대신 실행하는 경우 (이 스킬 범위 아님)

## Official access path

1. 병원정보서비스 (데이터셋 `15001698`) — `getHospBasisList`
   - 공식 gateway: `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList`
   - 기관명·시도·시군구·읍면동·진료과목·종별로 의료기관을 검색하고 암호화 요양기호 `ykiho`를 얻는다.
   - 문서: <https://www.data.go.kr/data/15001698/openapi.do>
2. 의료기관별상세정보서비스 (데이터셋 `15001699`) — `MadmDtlInfoService2.8`
   - 공식 gateway: `https://apis.data.go.kr/B551182/MadmDtlInfoService2.8/{operation}`
   - 검색으로 얻은 `ykiho`로 상세 operation을 조회한다.
   - 문서: <https://www.data.go.kr/data/15001699/openapi.do>
3. 대안 안내면: 보건의료빅데이터개방시스템 Open API 이용안내 <https://opendata.hira.or.kr/op/opc/selectOpenApiInfoView.do>

공식 API가 기본 경로이며, 화면 scraping이나 비공식 endpoint로 우회하지 않는다.

### 상세 operation (section)

| section | operation | 내용 |
|---|---|---|
| `facility` | `getEqpInfo2.8` | 시설정보(주소·전화·종별·병상·홈페이지) |
| `schedule` | `getDtlInfo2.8` | 세부정보(진료시간·접수·주차·응급실 운영) |
| `departments` | `getDgsbjtInfo2.8` | 진료과목정보 |
| `equipment` | `getMedOftInfo2.8` | 의료장비정보 |
| `special` | `getSpclDiagInfo2.8` | 특수진료정보(진료가능분야) |
| `transport` | `getTrnsprtInfo2.8` | 교통정보 |
| `specialists` | `getSpcSbjtSdrInfo2.8` | 전문과목별 전문의 수 |
| `nursing` | `getNursigGrdInfo2.8` | 간호등급정보 |
| `staff` | `getEtcHstInfo2.8` | 기타인력수 |

기본 section은 `facility,schedule,departments,equipment,special`이다. 전체는 `--sections all`.

## Inputs / Outputs

- 입력
  - 검색: `--name`, `--sido-cd`, `--sggu-cd`, `--emdong`, `--dgsbjt-cd`, `--cl-cd`, `--page-no`, `--num-of-rows`
  - 상세: `--ykiho` 또는 `--name`(+지역 필터), `--sections`
- 출력
  - 검색: `ykiho`, `name`, `type`, `address`, `phone`, `homepage`, `sido`, `sigungu`, `dong`, `established` (JSON은 `--json`)
  - 상세: section별 `operation`, `label`, `total_count`, `items`와 `source`/`disclaimer`

`numOfRows`는 최대 100까지 허용한다. 요양기호(`ykiho`)는 HIRA가 1:1로 매칭한 암호화 값이며 별도 복호화는 제공하지 않는다.

## Credential requirements (BYOK)

- upstream이 API key를 요구하므로 **사용자 본인 키(BYOK)** 를 쓴다. 사용자 측 필수 시크릿이며 repo·GitHub Actions에 저장하지 않는다.
- 키 탐색 순서: `KSKILL_HIRA_API_KEY` → `DATA_GO_KR_API_KEY` (환경변수 우선, 그다음 `~/.config/k-skill/secrets.env`).
- 검색에는 데이터셋 `15001698`, 상세에는 `15001699` 활용신청이 각각 필요하다(개발·운영 모두 자동승인 대상이나 활성화 전에는 인증 오류가 날 수 있다).
- 헬퍼는 키를 출력·로그·에러 메시지·`--dry-run` 결과에 남기지 않는다(`--dry-run`은 `REDACTED`로 가린다).
- 이 스킬은 현재 hosted `k-skill-proxy` route를 쓰지 않는다. 프록시 경유로 바꾸려면 프록시 서버 route 추가가 선행돼야 하며 이 스킬 변경 범위가 아니다.

## Commands

```bash
npx -y @nomadamas/k-skill@0 exec hira-medical-institution-search scripts/hira_medical_institution_search.py -- search \
  --name "서울삼성병원" --sggu-cd 110019 --num-of-rows 20
```

```bash
npx -y @nomadamas/k-skill@0 exec hira-medical-institution-search scripts/hira_medical_institution_search.py -- search \
  --sido-cd 110000 --dgsbjt-cd 01 --json
```

```bash
npx -y @nomadamas/k-skill@0 exec hira-medical-institution-search scripts/hira_medical_institution_search.py -- detail \
  --ykiho "JDQ4MTg4MDE2MzQxMDI4MjAwMQ==" --sections facility,departments,equipment,special
```

```bash
npx -y @nomadamas/k-skill@0 exec hira-medical-institution-search scripts/hira_medical_institution_search.py -- detail \
  --name "서울삼성병원" --sections all --json
```

```bash
npx -y @nomadamas/k-skill@0 exec hira-medical-institution-search scripts/hira_medical_institution_search.py -- search \
  --name "서울삼성병원" --dry-run
```

## Fallback order

1. 기관명·지역·진료과 필터가 충분하면 `getHospBasisList`로 검색해 `ykiho`를 확정한다.
2. `ykiho`가 있으면 바로 상세 section을 조회한다.
3. 이름만 있고 결과가 여러 건이면 추정하지 않고 `--ykiho`로 하나를 지정하라고 안내한다.
4. 결과가 0건이면 지역·진료과·종별 필터를 좁히거나 정확한 기관명을 다시 요청한다.
5. official API 장애·인증/쿼터 오류에는 비공식 데이터로 대체하지 않고 명시적으로 실패한다.

## Failure modes

- empty result: 해당 조건에 기관이 없음(`resultCode 03`은 오류가 아니라 빈 결과로 처리)
- missing key: `KSKILL_HIRA_API_KEY`/`DATA_GO_KR_API_KEY` 미설정 → 키 설정과 데이터셋 `15001698`/`15001699` 활용신청 안내
- auth/permission (`20`/`30`/`31`): 활용신청·승인 상태·키 등록 확인
- quota (`22`): 일일 호출 한도 초과 → 초기화 후 재시도 또는 트래픽 증설 신청
- rate limit (`23`): 초당 호출 초과 → 잠시 후 재시도
- invalid parameter (`10`): 코드/기관명 형식 확인
- unknown/deprecated operation (`12`): operation 이름 확인
- gateway/upstream 장애 (`01`/`04`/`05`/`29`): 잠시 후 재시도
- HTTP `401`/`403`/`429`, 네트워크/타임아웃: 재시도 후에도 실패하면 운영/키 상태 확인
- malformed JSON/XML 또는 비정상 메타데이터: 캐시하지 않고 명시적 오류로 중단
- ambiguous name: 검색 결과 여러 건 → `--ykiho` 지정 필요

## Response policy

- 공식 응답에 있는 사실만 요약하고, 진단·처방·응급 판단이나 병원 추천 순위를 만들지 않는다.
- "이 병원이 좋다/나쁘다" 같은 평가나 민간 후기와 섞지 않는다. 평가성 정보는 별도 공식 평가 자료로 확인한다.
- 응급 증상이 언급되면 조회보다 119/E-Gen 안내를 먼저 한다.
- 원문 출처(건강보험심사평가원, 데이터셋 번호)와 조회 시점을 함께 남긴다.

## Done when

- 검색 입력을 `getHospBasisList` 쿼리로 정규화해 `ykiho`를 확정했거나, 명시적 실패 모드로 중단했다.
- 요청한 section의 공식 상세정보를 조회해 주소·전화·진료과목·장비·특수진료 중 해당 항목을 요약했다.
- 응급상황이면 119/E-Gen 안내를 우선했고, 진단·처방을 하지 않았다.
