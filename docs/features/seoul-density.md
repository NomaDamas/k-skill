# 서울 실시간 혼잡도 조회 가이드

## 이 기능으로 할 수 있는 일

- 서울 주요 121개 핫스팟의 실시간 혼잡도 단계(여유 / 보통 / 약간 붐빔 / 붐빔) 확인
- KT·SKT 통신 신호 기반 추정 인구 범위(`AREA_PPLTN_MIN ~ AREA_PPLTN_MAX`) 확인
- 기준 시각(`PPLTN_TIME`)과 혼잡도 메시지(`AREA_CONGEST_MSG`) 같이 확인
- 별도 사용자 `SEOUL_OPEN_API_KEY` 없이 `k-skill-proxy` 로 조회

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인

## 기본 경로

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/seoul-density/citydata` 로 요청한다.

사용자는 별도 서울 열린데이터 광장 OpenAPI key 를 직접 발급받을 필요는 없다. upstream key 는 proxy 서버에서만 `SEOUL_OPEN_API_KEY` 로 관리한다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 쓴다.

## 입력값

- `area` — 지원 장소명 (예: `강남역`, `홍대 관광특구`, `여의도한강공원`)

지원 장소 전체 목록은 `seoul-density/SKILL.md` 의 `AREAS` 카테고리 또는 다음 명령으로 확인한다:

```bash
python3 seoul-density/scripts/seoul_density.py list
```

## 기본 흐름

1. client/skill 은 기본 hosted path 또는 `KSKILL_PROXY_BASE_URL` 아래 `/v1/seoul-density/citydata` endpoint 를 호출한다.
2. proxy 는 서울 열린데이터 광장 `citydata_ppltn/1/1/{area}` 를 `SEOUL_OPEN_API_KEY` 와 함께 호출한다.
3. 응답을 그대로 돌려주며, `proxy.cache.hit` 메타데이터를 추가한다.

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-density/citydata" \
  --data-urlencode 'area=강남역'
```

스킬 CLI 사용 예시:

```bash
python3 seoul-density/scripts/seoul_density.py query "강남역"
```

예상 응답 (요약):

```json
{
  "SeoulRtd.citydata_ppltn": [
    {
      "AREA_NM": "강남역",
      "AREA_CONGEST_LVL": "약간 붐빔",
      "AREA_PPLTN_MIN": "24000",
      "AREA_PPLTN_MAX": "26000",
      "PPLTN_TIME": "2026-05-14 09:30",
      "AREA_CONGEST_MSG": "사람이 몰려있을 수 있어요"
    }
  ],
  "RESULT": { "RESULT.CODE": "INFO-000" }
}
```

## fallback / 대체 흐름

- `KSKILL_PROXY_BASE_URL` 을 별도로 넣으면 해당 proxy 를 우선 사용한다.
- 기본 hosted path 는 `https://k-skill-proxy.nomadamas.org/v1/seoul-density/citydata` 이다.
- self-host 운영자는 서버 쪽에만 `SEOUL_OPEN_API_KEY` 를 넣는다 (사용자 쪽에는 키가 필요 없다).

## 주의할 점

- 인구 수치는 실제값이 아닌 **추계치** (KT·SKT 통신 신호 데이터 기반).
- 데이터는 호출 시점 기준 **약 15분 전** 값이며 5분 주기로 갱신된다.
- 새벽 01~05시는 실시간 데이터가 제공되지 않을 수 있다.
- 일일 호출 할당량 초과 시 다음 날 재시도해야 한다.
- 지원하지 않는 장소명을 넣으면 빈 응답이 돌아오므로 스킬의 `match` 서브커맨드로 후보를 먼저 확인한다.

## 참고 표면

- 공식 API 안내: `https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do`
- 서울 열린데이터 광장: `https://data.seoul.go.kr`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
