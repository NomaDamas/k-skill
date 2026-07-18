# 건축물대장 표제부 조회 가이드

## 개요

`building-register-search`는 공공데이터포털 데이터셋 `15134735`의 국토교통부 건축물대장정보 서비스 `getBrTitleInfo`를 조회한다. 공식 XML 응답을 `k-skill-proxy`가 파싱해 표제부 항목과 pagination/source metadata를 JSON으로 반환한다.

건축물대장은 건축물의 용도, 면적, 층수, 사용승인일 같은 행정대장 정보다. 소유권, 근저당, 가압류 등 등기 권리관계는 포함하지 않는다. 권리관계 확인은 [등기부등본 자동화 가이드](iros-registry-automation.md)를 별도로 사용한다.

## 입력 경로

주소는 proxy mode에서 `/v1/kakao-local/geocode?q=...&limit=2`를 먼저 호출한다. 정확히 하나의 Kakao `address` 문서에서 10자리 법정동 `b_code`, `mountain_yn`, `main_address_no`, `sub_address_no`를 읽고 건축물대장 API의 개별 필드로 `/v1/building-register/title`을 호출한다. 모호한 결과, 키워드 장소 결과, 법정동 코드/본번 누락은 명시적으로 중단한다.

```bash
python3 scripts/building_register.py title --address '서울 강남구 역삼동 123-4'
python3 scripts/building_register.py title --pnu 1168010100101230004
python3 scripts/building_register.py title \
  --sigungu-cd 11680 --bjdong-cd 10100 --plat-gb-cd 0 --bun 123 --ji 4
```

PNU는 `sigunguCd(5) + bjdongCd(5) + 토지구분(1) + bun(4) + ji(4)`의 19자리다. PNU 토지구분 `1`(일반 토지)은 건축물대장 API `platGbCd=0`, `2`(산)는 `platGbCd=1`로 변환한다. 개별 입력의 `--plat-gb-cd`는 PNU 숫자가 아니라 건축물대장 API 값이다. `bun`과 `ji`는 각각 4자리로 zero-padding되고 `ji` 생략 시 `0000`이다. `pageNo=1`, `numOfRows=10`이 기본이며 `numOfRows` 최대값은 100이다.

## Hosted와 direct

hosted proxy는 사용자 키가 필요 없다. route는 caller의 `serviceKey`를 거부하고 서버의 `DATA_GO_KR_API_KEY`만 upstream에 주입한다.

```bash
python3 scripts/building_register.py title --pnu 1168010100101230004 --direct
```

direct mode는 PNU 또는 개별 코드/필지만 지원하고 주소 geocoding은 지원하지 않는다. 키 우선순위는 `KSKILL_BUILDING_REGISTER_API_KEY` -> `DATA_GO_KR_API_KEY` -> `~/.config/k-skill/secrets.env`다. `--dry-run`은 키를 `REDACTED`로 표시한다.

self-host 운영자와 direct 사용자는 공공데이터포털에서 키를 발급받은 뒤 데이터셋 `15134735`의 활용신청을 별도로 완료해야 한다. 자동승인 대상이어도 서비스 활성화 전에는 401/403 또는 인증 오류 XML이 반환될 수 있다.

## 출력과 fallback

기본은 한국어 요약, `--json`은 normalized JSON이다. `mainPurpsCdNm`, `totArea`, `grndFlrCnt`, `ugrndFlrCnt`, `useAprDay`, `platPlc`, `newPlatPlc`, `mgmBldrgstPk`와 API의 유용한 원문 필드를 보존한다.

접근 순서는 PNU 직접 조회, 법정동 코드+필지 정규화, proxy 주소 geocode 순이다. 주소가 모호하거나 필지가 빠지면 더 정확한 지번/PNU를 요청한다. official API 인증, 쿼터, 장애 시 비공식 화면 scraping으로 우회하지 않는다.

## 실패 모드

- 결과 0건: 해당 필지에 표제부가 없거나 입력 필지가 다름
- 주소 모호/필지 누락: 법정동 `b_code`와 본번을 확정하지 못함
- `503 upstream_not_configured`: self-host proxy 서버 키 누락
- `502 upstream_forbidden`: 401/403, gateway auth XML, semantic auth result code
- quota/service error: 이용량 또는 공공데이터포털 서비스 상태 확인
- 빈 응답/잘못된 XML: upstream invalid response, 캐시하지 않음
- proxy down: 재시도 또는 운영자 확인
