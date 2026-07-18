---
name: building-register-search
description: Use when the user asks to look up a Korean building-register title record by address, PNU, legal-dong code, or parcel number.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# Building Register Search

## What this skill does

국토교통부 건축물대장정보 서비스의 표제부(`getBrTitleInfo`)를 조회한다. 주소, 19자리 PNU, 또는 법정동 코드와 지번을 입력받아 주용도, 연면적, 지상/지하 층수, 사용승인일, 관리번호와 주소 식별 필드를 반환한다.

이 스킬은 건축물의 행정대장 정보만 조회한다. 소유권, 근저당, 가압류 등 권리관계는 확인하지 않으며, 그 목적에는 별도 `iros-registry-automation` 스킬을 사용한다.

## Official access path

1. 공공데이터포털 데이터셋 `15134735`
2. 공식 endpoint `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo`
3. portable XML 응답을 프록시가 파싱해 JSON으로 정규화
4. 주소 입력 시 hosted/self-host proxy의 `/v1/kakao-local/geocode?q=...`로 법정동 `b_code`와 지번을 확정한 뒤 `/v1/building-register/title` 호출

공식 API가 기본 경로이며 화면 scraping이나 비공식 endpoint로 우회하지 않는다.

## Commands

```bash
python3 scripts/building_register.py title --address '서울 강남구 역삼동 123-4'
python3 scripts/building_register.py title --pnu 1168010100101230004
python3 scripts/building_register.py title --sigungu-cd 11680 --bjdong-cd 10100 --plat-gb-cd 0 --bun 123 --ji 4
python3 scripts/building_register.py title --pnu 1168010100101230004 --json
```

PNU는 `sigunguCd(5) + bjdongCd(5) + 토지구분(1) + bun(4) + ji(4)`의 19자리다. PNU 토지구분 `1`(일반 토지)은 건축물대장 API `platGbCd=0`, `2`(산)는 `platGbCd=1`로 변환한다. 개별 필드나 주소 결과로 PNU를 구성할 때도 API 값 `0`은 PNU `1`, API 값 `1`은 PNU `2`로 역변환한다. `--plat-gb-cd`를 직접 입력할 때는 PNU 값이 아니라 건축물대장 API 값이며 공식 값 `0`, `1`, `2`를 허용한다. API 값 `2`는 그대로 조회에 전달하되 대응하는 표준 PNU 토지구분이 없으므로 PNU를 구성하지 않는다. 개별 입력의 `bun`, `ji`는 4자리로 왼쪽 zero-padding되며 `ji` 생략 시 `0000`이다. `pageNo` 기본값은 1, `numOfRows` 기본값은 10이고 최대 100이다.

주소 입력은 proxy mode 전용이다. Kakao 응답에서 정확히 하나의 주소, 10자리 법정동 `b_code`, 본번, 산 여부를 얻어야 한다. 결과가 여러 개이거나 장소명 fallback만 있거나 필지 정보가 빠졌으면 추정하지 않고 중단한다.

## Direct mode

```bash
python3 scripts/building_register.py title --pnu 1168010100101230004 --direct
python3 scripts/building_register.py title --pnu 1168010100101230004 --direct --dry-run
```

`--direct`는 주소를 받지 않는다. `KSKILL_BUILDING_REGISTER_API_KEY`, 그다음 `DATA_GO_KR_API_KEY`, 마지막으로 `~/.config/k-skill/secrets.env`의 같은 키 순서로 찾는다. Kakao direct credential은 사용하지 않는다. `--dry-run`은 실제 키를 `REDACTED`로 가린다.

hosted proxy 사용자는 키가 필요 없다. self-host 운영자 또는 direct 사용자는 공공데이터포털 키 발급과 별개로 데이터셋 `15134735`에 **별도 활용신청**해야 한다. 이 데이터셋은 자동승인 대상이지만 활성화 전 호출은 인증 오류가 될 수 있다.

## Output

기본 출력은 한국어 요약이고 `--json`은 정규화된 payload를 출력한다. 주요 필드는 `mgmBldrgstPk`, `regstrKindCdNm`, `platPlc`, `newPlatPlc`, `sigunguCd`, `bjdongCd`, `platGbCd`, `bun`, `ji`, `mainPurpsCdNm`, `totArea`, `grndFlrCnt`, `ugrndFlrCnt`, `useAprDay`다. API가 제공한 그 밖의 유용한 표제부 원문 필드와 데이터셋/operation/upstream/XML source metadata도 보존한다.

## Fallback order

1. PNU가 있으면 바로 건축물대장 route를 호출한다.
2. 법정동 코드와 필지가 있으면 건축물대장 API 의미의 개별 필드로 같은 route를 호출한다.
3. 주소만 있으면 proxy Kakao geocode로 법정동 코드와 필지를 확정한 뒤 building route를 호출한다.
4. 주소가 모호하거나 필지가 없으면 사용자에게 더 정확한 지번 주소 또는 PNU를 요청한다.
5. official API 장애, 인증/쿼터 오류에는 비공식 데이터로 대체하지 않는다.

## Failure modes

- empty result: 해당 필지에 표제부가 없거나 입력 코드/지번이 맞지 않음
- ambiguous address: Kakao 결과가 하나로 확정되지 않음
- missing parcel or `b_code`: 장소명/도로명만으로 필지를 확정할 수 없음
- `upstream_not_configured`: self-host proxy에 `DATA_GO_KR_API_KEY`가 없음
- HTTP 401/403 or semantic auth XML: 데이터셋 `15134735` 활용신청/활성화 확인
- quota/service limit: 공공데이터포털 이용량과 서비스 상태 확인 후 재시도
- empty/invalid XML: upstream 응답 오류로 처리하며 캐시하지 않음
- proxy down: 잠시 후 재시도하거나 self-host 운영자에게 문의

## Done when

- 주소 또는 PNU/법정동+필지 입력이 하나의 조회 필지로 정규화됐다.
- 표제부 결과와 source metadata를 제공했거나 명시적 실패 모드로 중단했다.
- 건축물대장 정보와 등기부 권리관계를 혼동하지 않았다.
