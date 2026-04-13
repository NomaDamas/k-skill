# 생활쓰레기 배출정보 조회 가이드

## 이 기능으로 할 수 있는 일

- 시군구 기준 생활쓰레기 배출요일/시간 조회
- 음식물쓰레기/재활용품 배출방법 조회
- 배출장소, 미수거일, 관리부서 연락처 확인
- 공공데이터 원본 API를 k-skill-proxy `/v1/household-waste/info` 라우트로 감싸서 조회 + API 키는 프록시 주입

## 가장 중요한 규칙

스킬은 항상 `k-skill-proxy`의 `/v1/household-waste/info` 라우트를 호출한다.
사용자는 `DATA_GO_KR_API_KEY`를 직접 들고 있지 않고, `serviceKey`는 proxy 서버에서만 원본 API(`https://apis.data.go.kr/1741000/household_waste_info/info`)로 주입한다.

## 먼저 필요한 것

- 인터넷 연결
- 원본 API 접근 가능 환경
- API 키 주입용 proxy 접근 가능 환경

## 기본 조회 예시

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/household-waste/info' \
  --data-urlencode 'cond[SGG_NM::LIKE]=강남구' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'numOfRows=100'
```

클라이언트는 **`cond[SGG_NM::LIKE]`** 와 **`pageNo` / `numOfRows`**(또는 `page_no` / `num_of_rows`)를 **함께** 넘긴다. `pageNo` / `numOfRows` 값은 **반드시 `1` / `100`** 이어야 하고, 그 외 값이나 숫자만으로 표현되지 않는 문자열이면 proxy가 **`400`** 을 반환하고 upstream을 호출하지 않는다. upstream에는 항상 `pageNo=1`, `numOfRows=100`만 전달된다. `returnType`은 항상 `json`으로 강제된다. 원본 API의 `cond[DAT_CRTR_YMD::*]`, `cond[DAT_UPDT_PNT::*]` 같은 부가 필터는 현재 지원하지 않는다 — 일반 사용자 질의("강남구 쓰레기 배출 요일")는 시군구 검색만으로 충분하기 때문이다.

## 조회 흐름 권장 순서

1. 사용자에게 시/군/구를 먼저 확인한다.
2. 입력이 모호하면 상위 행정구역을 포함해 재질문한다.
3. proxy `/v1/household-waste/info` 라우트로 조회한다 (`serviceKey`는 proxy가 주입).
4. 배출장소/요일/시간/미수거일/문의처를 3~6개 포인트로 요약한다.
5. 결과가 여러 건이면 응답 항목을 `DAT_UPDT_PNT` 기준으로 클라이언트에서 정렬해 최신 항목을 우선 보여준다.

## 자주 보는 필드

- `SGG_NM`: 시군구명
- `MNG_ZONE_NM`, `MNG_ZONE_TRGT_RGN_NM`: 관리구역/대상지역
- `EMSN_PLC`, `EMSN_PLC_TYPE`: 배출장소/유형
- `LF_WST_EMSN_MTHD`, `FOD_WST_EMSN_MTHD`, `RCYCL_EMSN_MTHD`: 배출방법
- `LF_WST_EMSN_DOW`, `FOD_WST_EMSN_DOW`, `RCYCL_EMSN_DOW`: 배출요일
- `LF_WST_EMSN_BGNG_TM`, `LF_WST_EMSN_END_TM`: 생활쓰레기 배출시간
- `UNCLLT_DAY`: 미수거일
- `MNG_DEPT_NM`, `MNG_DEPT_TELNO`: 담당부서/연락처

## 참고 링크

- 공식 데이터 출처: 공공데이터포털 (`https://www.data.go.kr`)
- upstream API: `https://apis.data.go.kr/1741000/household_waste_info/info`
- 프록시 역할: 인증키(`DATA_GO_KR_API_KEY`) 서버 측 주입/보호
