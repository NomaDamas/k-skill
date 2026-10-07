# 사업자 실사 종합 (biz-health-check)

`biz-health-check` 스킬은 사업자등록번호(+상호/지역) 하나로 무료 공공 데이터 6종을 한 번에 교차 조회해 실사 리포트 한 장을 만든다. 같은 레포의 단품 스킬 helper를 그대로 재사용한다(단일 진실원천).

## 묶는 단품 스킬

| 섹션 | 단품 스킬 | 경로 |
| --- | --- | --- |
| 국세청 사업자등록 상태 | `nts-business-registration` | proxy |
| 국민연금 가입 사업장 | `national-pension-workplace` | proxy |
| 국세 체납 명단공개 | `nts-tax-delinquency` | 직접(무인증) |
| 금융위 기업기본정보 | `fsc-corporate-info` | proxy |
| 조달청 부정당제재 | `g2b-sanctioned-supplier` | proxy |
| 지방행정 인허가 영업상태 | `localdata-business-status` | 직접(무인증) |

## 설계 원칙

- 점수·등급·"위험" 같은 해석 라벨을 산출하지 않는다. 각 항목의 사실 + 출처 + 조회시각만 병렬한다.
- 한 항목 조회가 실패해도 전체를 막지 않고 그 항목만 `unavailable` + 사유로 강등한다.
- 단품 helper를 찾지 못하면 해당 섹션만 건너뛰고 나머지를 진행한다.
- 상태 정상/제재 0건과 특정 공고의 참가자격은 별개다. 공고별 최종 원문·기준일과 회사 서류로 별도 확인한다.
- 제재 조회 실패(`lookup_failed`/`unavailable`)를 제재 없음(`no_active_sanctions`)으로 해석하지 않는다. 제재 섹션은 성공 응답의 `upstream_response`와 원래 `coverage.checked_at`을 그대로 포함한다.

## 인증/시크릿

- 사용자 측 필수 시크릿 없음.
- proxy 섹션(국세청 상태·국민연금·금융위·부정당)은 운영 서버의 `DATA_GO_KR_API_KEY`로 동작한다.
- 무인증 섹션(체납·인허가)은 키 없이 사용자 머신에서 직접 동작한다.

## 예시

```bash
npx -y @nomadamas/k-skill@0 exec biz-health-check scripts/biz_health_check.py -- 124-81-00998 --name "삼성전자"

npx -y @nomadamas/k-skill@0 exec biz-health-check scripts/biz_health_check.py -- --name "호텔샬롬" --region 제주제주시 --industry 숙박업
```

## 입력

- `b_no`: 사업자등록번호 10자리(하이픈 허용) — 상태조회·부정당제재에 필요
- `--name`: 상호·법인명 — 국민연금·금융위·체납·인허가에 필요
- `--region`: 시군구 — 인허가(동네 사업장) 조회에 필요
- `--industry`: 인허가 업종(여러 번 지정 가능)

## 공식 출처

- 각 단품 스킬 문서의 공식 출처를 따른다. 통합 목록은 [sources](../sources.md)의 "사업자 실사" 항목 참조.
