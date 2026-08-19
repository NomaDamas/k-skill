# 의약품 안전 체크 가이드

## 이 기능으로 할 수 있는 일

- 식약처 공식 `의약품개요정보(e약은요)` 조회
- 식약처 공식 `안전상비의약품 정보` 조회
- 제품명 기준으로 효능, 사용법, 주의사항, 상호작용, 이상반응, 보관법 요약
- 증상 언급 시 **인터뷰-first** 흐름으로 red flag 확인
- 사용자 API key 없이 `k-skill-proxy` 경유 조회

## 먼저 필요한 것

- 인터넷 연결
- `python3`
- 설치된 `mfds-drug-safety` skill 안에 `scripts/mfds_drug_safety.py` helper 포함
- `k-skill-proxy`의 `/v1/mfds/drug-safety/lookup` route가 있는 hosted/self-host 프록시 접근
- `DATA_GO_KR_API_KEY` 는 사용자 쪽이 아니라 **프록시 운영 서버** 환경에 있어야 한다

> 이 helper 는 증상 질문에 대한 직접 진단을 하지 않는다. 증상이 있으면 바로 단정하지 말고 먼저 되묻는다.

## 법적 경계 (약사법·의료법)

이 스킬은 허가사항 **조회 도구**다. "정확한 상담은 약사에게" 같은 면책 문구만으로는 아래 금지선이 해제되지 않는다. 의료법 제27조제1항은 "의료인이 아니면 누구든지 의료행위를 할 수 없으며"로 행위 자체를 금지하므로, 실질적 완화는 **답변 범위 제한**이다.

| 근거 조문 | 금지 행위 | 벌칙 |
|---|---|---|
| 의료법 제27조제1항 | 진단·확진, 처방, 복용량 지시, 처방약 중단 권고 | 의료법 제87조의2제2항제2호 (5년/5천만원) |
| 약사법 제23조제1항 | 조제에 해당하는 배합·분할 지시 | 약사법 제93조제1항제3호 (5년/5천만원) |
| 약사법 제44조제1항 | 약국개설자가 아닌 자의 의약품 판매·거래 중개 | 약사법 제93조제1항제7호 (5년/5천만원) |
| 약사법 제61조의2제1항 | 불법 판매 알선·광고, 해외직구·개인거래 구매 경로 안내 | 약사법 제95조제1항제10호의2 |
| 약사법 제68조 | 허가사항을 넘는 효능 단정, 전문의약품 홍보성 권유 | 약사법 제95조제1항제10호 (1년/1천만원) |

약사법 제44조는 "의약품 판매" 조항이지 의약품 정보 제공을 금지하는 규정이 아니다. 조문 확인 기준은 약사법(법률 제21109호, 2026-06-21 시행)·의료법(법률 제21524호, 2026-04-07 시행)이다.

건강정보 처리: 증상·기저질환·복약이력은 「개인정보 보호법」 제23조 민감정보다. `lookup` 은 제품명과 `limit` 만 프록시로 보내며 증상 텍스트는 전송하지 않는다. `interview` 출력의 `legal_boundary` 필드가 이 경계를 그대로 실어 나른다.

## 공식 표면

- 공공데이터포털 문서: `https://www.data.go.kr/data/15075057/openapi.do`
- e약은요 endpoint: `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`
- 공공데이터포털 문서: `https://www.data.go.kr/data/15097208/openapi.do`
- 안전상비의약품 endpoint: `https://apis.data.go.kr/1471000/SafeStadDrugService/getSafeStadDrugInq`
- 프록시 route: `https://k-skill-proxy.nomadamas.org/v1/mfds/drug-safety/lookup`

## 권장 인터뷰 질문

증상이나 복용상황이 있으면 먼저 아래를 확인한다.

- 누가 복용하려는지 (본인/아이/임산부/고령자)
- 어떤 약을 이미 먹었는지 / 지금 먹으려는지
- 언제부터 얼마나 복용했는지
- 현재 증상과 시작 시점
- 복용 중인 다른 약, 기저질환, 알레르기
- 응급 red flag: `호흡곤란`, `의식저하`, `심한 발진`, `지속되는 구토/흉통`

red flag 가 있으면 **즉시 119·응급실·의료진** 안내가 우선이다.

## 기본 흐름

1. `npx -y @nomadamas/k-skill@0 exec mfds-drug-safety scripts/mfds_drug_safety.py -- interview ...` 로 되묻기 질문 세트를 준비한다.
2. red flag 가 없고 약 이름이 확인되면 `lookup` 으로 프록시 route를 조회한다.
3. 효능/주의/상호작용/부작용을 짧게 정리한다.
4. `같이 먹어도 되나?` 질문에는 공식 문구를 근거로만 말하고 최종 판단은 약사·의료진 확인이 필요하다고 밝힌다.

## CLI 예시

```bash
npx -y @nomadamas/k-skill@0 exec mfds-drug-safety scripts/mfds_drug_safety.py -- interview \
  --question "타이레놀이랑 판콜 같이 먹어도 되나요?" \
  --symptoms "두드러기와 어지러움"
```

```bash
npx -y @nomadamas/k-skill@0 exec mfds-drug-safety scripts/mfds_drug_safety.py -- lookup --item-name "타이레놀" --item-name "판콜"
```

## 출력 예시 포맷

```json
{
  "query": {
    "item_names": ["타이레놀", "판콜"],
    "limit": 5
  },
  "items": [
    {
      "source": "drug_easy_info",
      "item_name": "타이레놀정160밀리그램",
      "company_name": "한국얀센",
      "efficacy": "감기로 인한 발열 및 동통에 사용합니다.",
      "interactions": "다른 해열진통제와 함께 복용하지 마십시오."
    }
  ],
  "proxy": {
    "name": "k-skill-proxy"
  }
}
```

## 검증 메모

2026-04-13 기준 로컬에서 아래를 실제 실행해 helper 동작을 확인했다.

- `npx -y @nomadamas/k-skill@0 exec mfds-drug-safety scripts/mfds_drug_safety.py -- --help`
- `npx -y @nomadamas/k-skill@0 exec mfds-drug-safety scripts/mfds_drug_safety.py -- interview --question "타이레놀이랑 판콜 같이 먹어도 되나요?" --symptoms "두드러기와 어지러움"`
- 프록시 route 기준으로 `lookup` 호출 URL 구성이 `/v1/mfds/drug-safety/lookup` 로 향하는지 검증

즉, helper 자체와 인터뷰 흐름은 검증했고, live 성공 경로는 프록시 서버에 `DATA_GO_KR_API_KEY` 가 준비된 환경에서 바로 이어서 검증할 수 있다.
