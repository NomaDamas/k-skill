# HIRA 의료기관 상세정보 조회

`hira-medical-institution-search`는 건강보험심사평가원(HIRA) 병원정보서비스·의료기관별상세정보 OpenAPI를 BYOK 인증키로 조회해 병원·의원·약국의 위치·진료과목·장비·특수진료 정보를 요약하는 read-only 스킬하는 스킬이다.

건강보험심사평가원(HIRA)이 공공데이터포털과 보건의료빅데이터개방시스템으로 공개하는 의료기관 OpenAPI를 조회해 병원·의원·약국의 기본정보(주소·전화·종별·홈페이지)와 상세정보(진료과목, 의료장비, 특수진료/진료가능분야, 진료시간·응급실 운영, 교통편, 병상·간호등급 등)를 요약한다.

> 이 스킬은 공식 공개데이터를 정리하는 **정보 제공 도구**이며 진단·처방·진료 판단이 아니다. 응급상황이면 API 조회보다 **119 또는 응급의료포털(E-Gen)** 안내를 먼저 한다.

조회 전용(read-only)이다. 예약·접수·결제·진료 신청 등 부작용이 있는 동작은 하지 않는다.

## 사용 예시

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

## 실패 모드

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

## 참고

- 스킬 정의: `npx -y @nomadamas/k-skill@0 instruct hira-medical-institution-search`
- CLI: `npx -y @nomadamas/k-skill@0 exec hira-medical-institution-search scripts/hira_medical_institution_search.py -- --help`
