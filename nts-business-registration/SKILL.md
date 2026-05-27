---
name: nts-business-registration
description: 국세청 사업자등록정보 진위확인 및 사업자등록 상태조회를 공공데이터포털 API(k-skill-proxy 경유)로 수행한다.
license: MIT
metadata:
  category: business
  locale: ko-KR
  phase: v1
---

# 국세청 사업자등록정보 진위확인 및 상태조회

## What this skill does

공공데이터포털의 **국세청_사업자등록정보 진위확인 및 상태조회 서비스**를 `k-skill-proxy` 경유로 호출해 다음을 확인한다.

- `status`: 사업자등록번호 기준 상태조회 (`계속사업자`, `휴업자`, `폐업자`, 과세유형 등 upstream 응답 그대로 포함)
- `validate`: 사업자등록번호 + 개업일자 + 대표자명(및 선택 필드) 기준 진위확인

## When to use

- "이 사업자등록번호가 계속사업자인지 확인해줘"
- "사업자등록번호 상태조회해줘"
- "사업자등록번호, 개업일, 대표자명으로 진위확인해줘"
- 거래처 등록 전 공식 NTS/공공데이터포털 기준 확인이 필요할 때

## Prerequisites

- 인터넷 연결
- `python3`
- 설치된 skill payload 안에 `scripts/nts_business_registration.py` helper 포함
- hosted/self-host `k-skill-proxy`의 `/v1/nts-business/status`, `/v1/nts-business/validate` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털에서 `국세청_사업자등록정보 진위확인 및 상태조회 서비스` 활용신청이 되어 있어야 한다.

## Validate privacy boundary

- `validate`는 대표자명(`p_nm`), 개업일자(`start_dt`), 주소·상호 같은 선택 메타데이터를 hosted proxy와 공공데이터포털 upstream으로 전송한다.
- hosted proxy는 `validate` 성공 응답을 캐시하지 않고, 프록시 `query` echo를 붙이지 않으며, upstream이 요청값을 되돌려도 민감 입력 필드를 응답에서 제거한다.
- 프록시의 기본 Fastify request logging은 꺼져 있다. 운영자가 별도 로그를 켠 self-host 환경에서는 요청 본문 로깅 정책을 직접 점검해야 한다.
- hosted proxy 경유가 부담스러운 진위확인 업무는 `KSKILL_PROXY_BASE_URL`로 직접 운영하는 self-host proxy를 지정한다.

## Official surfaces

- 공공데이터포털 문서: `https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15081808`
- 상태조회 upstream: `POST https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=...`
- 진위확인 upstream: `POST https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=...`
- 프록시 route: `POST /v1/nts-business/status`, `POST /v1/nts-business/validate`

## Inputs

### 상태조회

- `b_no`: 사업자등록번호 10자리. 하이픈은 허용되며 helper/proxy가 숫자만 남긴다.
- 한 요청은 최대 100개까지 보낸다.

### 진위확인

필수:

- `b_no`: 사업자등록번호 10자리
- `start_dt`: 개업일자 `YYYYMMDD` (하이픈/점 허용)
- `p_nm`: 대표자 성명

선택:

- `p_nm2`: 대표자 성명2
- `b_nm`: 상호
- `corp_no`: 법인등록번호
- `b_sector`: 주업태명
- `b_type`: 주종목명
- `b_adr`: 사업장주소

텍스트 필드는 NTS 입력 규격에 맞춰 보수적으로 길이를 제한한다(`p_nm`/`p_nm2` 30자, `b_nm` 200자, `b_sector`/`b_type` 100자, `b_adr` 500자). `corp_no`는 제공할 경우 숫자 13자리여야 한다.

## Workflow

1. 사용자 입력에서 사업자등록번호는 숫자 10자리인지 확인한다.
2. 상태조회만 필요하면 `status`를 호출한다.
3. 진위확인은 최소 `b_no`, `start_dt`, `p_nm`이 있을 때만 호출한다.
4. 개인정보/거래처 정보는 필요한 필드만 보내고, 프록시 응답을 그대로 보존하되 핵심 상태/진위 결과를 짧게 요약한다.
5. upstream이 `upstream_not_configured`, 활용신청 미승인, 인증키 오류 등을 반환하면 설정/승인 문제로 안내한다.

## CLI examples

```bash
python3 scripts/nts_business_registration.py status \
  --b-no 123-45-67890
```

```bash
python3 scripts/nts_business_registration.py validate \
  --business-json '{"b_no":"123-45-67890","start_dt":"2020-01-31","p_nm":"홍길동","b_nm":"테스트상사"}'
```

## Direct proxy examples

```bash
curl -fsS -X POST "$KSKILL_PROXY_BASE_URL/v1/nts-business/status" \
  -H 'content-type: application/json' \
  -d '{"b_no":["123-45-67890"]}'
```

```bash
curl -fsS -X POST "$KSKILL_PROXY_BASE_URL/v1/nts-business/validate" \
  -H 'content-type: application/json' \
  -d '{"businesses":[{"b_no":"123-45-67890","start_dt":"20200131","p_nm":"홍길동"}]}'
```

## Failure modes

- `400 bad_request`: 사업자등록번호가 10자리가 아니거나 진위확인 필수 필드가 빠짐.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY`가 없음.
- upstream 인증/활용신청 오류: API 키가 해당 서비스에 승인되지 않았거나 만료/오류 상태.
- 빈 결과 또는 진위불일치: 공식 응답의 `valid`, `valid_msg`, `b_stt` 값을 그대로 근거로 설명한다.

## Done when

- 상태조회는 공식 응답의 `b_stt`, `b_stt_cd`, `tax_type` 등 핵심 필드를 확인했다.
- 진위확인은 `valid`, `valid_msg` 결과를 확인했다.
- API 키는 사용자에게 요구하지 않고 프록시 서버에만 둔다는 점을 지켰다.
