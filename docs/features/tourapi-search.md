# TourAPI 관광정보 조회 가이드

## 개요

`tourapi-search`는 한국관광공사 **TourAPI 4.0**(공공데이터포털 데이터셋 `15101578`,
`한국관광공사_국문 관광정보 서비스_GW`)을 **읽기 전용**으로 조회하는 스킬이다.
지역·키워드·분류별로 관광지, 축제/행사, 숙박, 음식점 같은 공식 관광 메타데이터를
찾고 소개문, 주소, 좌표, 이용시간, 이미지를 정리한다.

여행 추천이나 일정 생성이 아니라 **공식 관광정보 후보 정리**까지가 범위다.
`myrealtrip-search`(상품 검색), `kakao-map`(장소 검색)과 달리 관광공사가 제공하는
관광 콘텐츠 메타데이터를 조회한다.

## 접근 경로

공식 REST 게이트웨이 하나만 사용한다.

```text
https://apis.data.go.kr/B551011/KorService2/<operation>?serviceKey=<key>&_type=json
```

공통 인증/포맷 파라미터는 `serviceKey`, `numOfRows`, `pageNo`, `MobileOS=ETC`,
`MobileApp`, `_type=json`이다. `KorService1`은 폐기되었고 4.0은 `KorService2`와
`*2` operation을 쓴다(`KorService1/*`는 `NO_OPENAPI_SERVICE_ERROR`를 돌려준다).

| 명령 | operation | 필수 입력 |
|------|-----------|-----------|
| `keyword` | `searchKeyword2` | `keyword` |
| `area` | `areaBasedList2` | 없음 |
| `festival` | `searchFestival2` | `eventStartDate`(YYYYMMDD) |
| `stay` | `searchStay2` | 없음 |
| `detail` | `detailCommon2` + `detailIntro2` + `detailImage2` | `contentId` |

`contentTypeId`는 `12` 관광지, `14` 문화시설, `15` 축제공연행사, `25` 여행코스,
`28` 레포츠, `32` 숙박, `38` 쇼핑, `39` 음식점이다. `--content-type`/`--area-code`는
이름(`관광지`, `제주`) 또는 숫자 코드를 모두 받는다.

## 인증 (BYOK)

이 스킬은 사용자가 발급한 서비스키를 환경변수로 받는 **BYOK** 방식이다.
이번 범위에서는 `k-skill-proxy` route를 추가하지 않는다.

```bash
export KSKILL_TOURAPI_KEY="발급받은_서비스키"
# 대안: DATA_GO_KR_API_KEY
```

helper는 환경변수만 읽고 dotenv/시크릿 파일은 읽지 않는다. data.go.kr이 함께
제공하는 인코딩 키와 디코딩 키를 모두 지원한다(`%XX`가 있으면 인코딩 키로 판단).
`--dry-run`은 실제 키 대신 `REDACTED`로 요청 URL만 출력한다.

## 명령 예시

```bash
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- keyword "불국사" --limit 5
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- area --area-code 제주 --content-type 관광지 --limit 10
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- festival --start-date 20261001 --area-code 서울 --limit 10
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- stay --area-code 경북 --limit 5
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- detail 126508 --images 3
```

`--json`은 정규화된 JSON을, `--dry-run`은 네트워크 호출 없이 요청 URL을 출력한다.
`--limit`은 TourAPI `numOfRows` 상한에 맞춰 최대 100이다.

## 출력과 fallback

기본은 한국어 요약, `--json`은 정규화된 항목이다. 목록 항목은 `content_id`,
`content_type`, `title`, `address`, `lat`, `lon`, `tel`, `event_start_date`,
`first_image_thumbnail` 등을 담고, `detail`은 여기에 `overview`(소개문),
`intro`(이용시간 등 upstream 소개정보), `images`를 더한다.

fallback 순서는 키워드 결과가 비면 지역+분류로 넓히고, 지역이 좁으면 인접 지역으로
넓히고, 축제는 기간을 넓히는 순이다. 소개정보/이미지가 비어도 공통정보는 그대로
제공하며, 결과를 지어내지 않는다.

## 실패 모드

- 키 없음: `KSKILL_TOURAPI_KEY`/`DATA_GO_KR_API_KEY` 미설정
- 코드 30 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`: 인증키 오타 또는 활용신청 미완료
- 코드 20 `PERMISSION_DENIED`/`SERVICE_KEY_IS_NULL`: 활용신청 미승인 또는 키 누락
- 코드 22/23: 일일/초당 호출 한도 초과
- 코드 31: 인증키 사용기한 만료
- 코드 12 `NO_OPENAPI_SERVICE_ERROR`: operation/버전 변경
- 빈 결과: 조건이 좁거나 오탈자. 빈 결과를 그대로 알림
- JSON 아님/`response` 없음: 게이트웨이/upstream 변경. 비공식 데이터로 대체하지 않음

## 테스트

`tourapi-search/tests/test_tourapi_search.py`가 `urllib.request.urlopen`을 mock해
URL 구성, 게이트웨이/결과 코드 처리, 응답 파싱, 상세 병합, dry-run 키 마스킹을
검증한다. 실제 네트워크는 쓰지 않는다.

```bash
python3 -m unittest discover -s tourapi-search -q
```
