# TourAPI 관광정보 조회 / Korea Tourism TourAPI Search

## What this skill does

한국관광공사 **TourAPI 4.0**(공공데이터포털 `한국관광공사_국문 관광정보 서비스_GW`, 데이터셋 `15101578`)를
**읽기 전용**으로 조회해 공식 관광 메타데이터를 정리한다.

- 지역/키워드/분류별 관광지·축제·숙박·음식점 검색
- 소개문, 주소, 좌표, 이용시간, 이미지 요약
- 여행 추천이나 일정 생성이 아니라 **공식 관광정보 후보 정리**까지만 한다.
- 예약·결제·전송·게시 같은 side effect는 하지 않는다.

## When to use

- "제주 관광지 알려줘"
- "이번 주 전주 축제 찾아줘"
- "경주 숙박 정보 보여줘"
- "부산 맛집을 관광공사 데이터로 조회해줘"
- "불국사 소개문이랑 이용시간 알려줘"

## Prerequisites / API key

upstream이 공공데이터포털 서비스키를 요구하므로 이 스킬은 **BYOK**다.

1. [공공데이터포털](https://www.data.go.kr/data/15101578/openapi.do)에서
   `한국관광공사_국문 관광정보 서비스_GW`(15101578)를 **활용신청**한다.
2. 발급받은 서비스키를 환경변수로 설정한다.

```bash
export KSKILL_TOURAPI_KEY="발급받은_서비스키"
# 대안: DATA_GO_KR_API_KEY (다른 공공데이터포털 스킬과 공유하는 일반 키)
```

- helper는 **환경변수만** 읽는다. dotenv/시크릿 파일은 읽지 않는다.
- 서비스키는 저장소, 문서, 채팅, 셸 인자에 평문으로 남기지 않는다.
- data.go.kr은 키를 "인코딩 키"와 "디코딩 키"로 함께 보여준다. 두 형식 모두 동작한다.
  helper가 `%XX`가 있으면 인코딩 키로 보고 그대로 쓰고, 없으면 디코딩 키로 보고 URL 인코딩한다.
- `--dry-run`은 실제 키 대신 `REDACTED`로 요청 URL만 보여준다.

## Official access path (discovered)

공식 REST 게이트웨이 하나만 쓴다. 화면 scraping이나 비공식 endpoint로 우회하지 않는다.

```text
https://apis.data.go.kr/B551011/KorService2/<operation>?serviceKey=<key>&_type=json
```

- 공통 인증/포맷 파라미터: `serviceKey`, `numOfRows`, `pageNo`, `MobileOS=ETC`, `MobileApp`, `_type=json`.
- `KorService1`은 폐기되었고, 4.0은 `KorService2` + `*2` operation이다
  (`KorService1/areaBasedList`는 `NO_OPENAPI_SERVICE_ERROR`를 돌려준다).
- 응답은 JSON이며 `response.header.resultCode == "0000"`이 정상이다. 결과가 없으면
  `response.body.items`가 빈 문자열, 단건이면 `item`이 객체로 온다.

### 사용하는 operation

| 명령 | operation | 필수 입력 | 비고 |
|------|-----------|-----------|------|
| `keyword` | `searchKeyword2` | `keyword` | 키워드 검색 |
| `area` | `areaBasedList2` | (없음) | 지역/분류 기반 목록 |
| `festival` | `searchFestival2` | `eventStartDate`(YYYYMMDD) | 축제/행사 |
| `stay` | `searchStay2` | (없음) | 숙박 |
| `detail` | `detailCommon2` + `detailIntro2` + `detailImage2` | `contentId` | 소개문·이용정보·이미지 |

- contentTypeId: `12` 관광지, `14` 문화시설, `15` 축제공연행사, `25` 여행코스,
  `28` 레포츠, `32` 숙박, `38` 쇼핑, `39` 음식점.
- `--content-type`/`--area-code`는 이름(`관광지`, `제주`) 또는 숫자 코드를 모두 받는다.
- `--arrange`: `A` 제목순, `C` 수정일순, `D` 생성일순 (`O`/`Q`/`R`은 이미지 있는 항목 순).

### 왜 이 경로인가

- **공식 문서화 API**: 스키마와 contentTypeId/areaCode 체계를 한국관광공사가 보장한다.
- **게이트웨이가 JSON 지원**: `_type=json`으로 파싱이 단순하고, 실패도 JSON 코드로 온다.
- **프록시 미경유(BYOK)**: upstream이 키를 요구하지만 이번 변경에서는 `k-skill-proxy` route를
  추가하지 않는다(별도 범위). 사용자가 직접 발급한 키를 환경변수로만 쓴다.

## Inputs

`keyword <검색어>`:

- `--content-type`, `--area-code`, `--sigungu-code`, `--cat1/2/3`, `--arrange`
- `--limit`(기본 10, 최대 100), `--page`(기본 1), `--json`, `--dry-run`, `--timeout`

`area` / `stay`: `keyword`와 같은 필터(`검색어` 제외)

`festival`: `--start-date`(필수), `--end-date`(선택) + 같은 필터

`detail <contentId>`: `--content-type`(선택), `--images`(기본 5)

## Workflow

1. 사용자 요청에서 검색어·지역·분류·기간을 뽑는다. 정보가 없으면 먼저 묻는다.
2. helper를 실행한다.

```bash
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- keyword "불국사" --limit 5
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- area --area-code 제주 --content-type 관광지 --limit 10
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- festival --start-date 20261001 --area-code 서울 --limit 10
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- stay --area-code 경북 --limit 5
npx -y @nomadamas/k-skill@0 exec tourapi-search scripts/tourapi_search.py -- detail 126508 --images 3
```

3. 목록에서 후보를 3~5개로 정리하고, 상세가 필요하면 `detail`로 `content_id`를 조회한다.
4. 응답은 공식 필드(제목, 주소, 좌표, 이용시간, 이미지) 중심으로 요약하고 출처가 TourAPI임을 밝힌다.

JSON 출력이 필요하면 `--json`을 붙인다. 네트워크 없이 요청 URL만 확인하려면 `--dry-run`을 쓴다.

## Output

```json
{
  "command": "detail",
  "operation": "detailCommon2+detailIntro2+detailImage2",
  "content_id": "126508",
  "item": {
    "content_id": "126508",
    "content_type_id": "12",
    "content_type": "관광지",
    "title": "불국사",
    "address": "경북 경주시 불국로 385",
    "lat": 35.7901,
    "lon": 129.3321,
    "overview": "...",
    "intro": { "usetime": "...", "restdate": "..." },
    "images": [{ "url": "...", "thumbnail": "...", "name": "..." }]
  }
}
```

## Fallback order

1. `keyword` 결과가 비면 `area`+`--content-type`으로 넓히거나 검색어를 줄여 재시도한다.
2. 지역이 너무 좁으면 `--area-code`를 인접 지역으로 넓힌다.
3. 축제는 `--start-date`를 오늘 이후로 두고 `--end-date` 없이 조회해 기간을 넓힌다.
4. `detail`에서 소개정보/이미지가 비어도 공통정보(제목·주소·좌표·소개문)는 그대로 제공한다.
5. 키/quota/upstream 장애는 우회하지 않고 실패 모드로 보고한다.

## Failure modes

- **키 없음**: `KSKILL_TOURAPI_KEY`/`DATA_GO_KR_API_KEY` 미설정 → 명시적 오류.
- **코드 30 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`**: 인증키 오타 또는 활용신청 미완료.
- **코드 20 `PERMISSION_DENIED`/`SERVICE_KEY_IS_NULL`**: 활용신청 미승인 또는 키 누락.
- **코드 22/23 quota/rate 초과**: 일일/초당 호출 한도 초과. 잠시 후 재시도.
- **코드 31**: 인증키 사용기한 만료. 포털에서 갱신.
- **코드 12 `NO_OPENAPI_SERVICE_ERROR`**: operation/버전 변경. `KorService2` 최신 operation 확인.
- **빈 결과**: 입력 조건이 좁거나 오탈자. 결과를 지어내지 말고 빈 결과를 알린다.
- **JSON 아님/`response` 없음**: 게이트웨이/upstream 변경 가능. 비공식 데이터로 대체하지 않는다.
- **`--limit` > 100**: TourAPI `numOfRows` 상한. 명시적으로 거부한다.

## Done when

- 사용자 입력이 TourAPI operation과 파라미터로 정규화됐다.
- 공식 응답에서 1건 이상 조회했거나, 명시적 빈 결과/실패 모드로 중단했다.
- 각 후보에 제목, contentType, 가능하면 주소·좌표·이용시간·이미지를 붙였다.
- 결과가 여행 추천이 아니라 공식 관광 메타데이터임을 밝혔다.

## Notes

- 공개 정보 조회 전용이다. 시스템적 대량 수집/DB 구축/차단 우회에 쓰지 않는다.
- 이미지 저작권은 공공누리 유형에 따른다. 기업 CI/BI 용도로 쓰지 않는다.
- 소개문(`overview`)·이용시간(`intro`)은 upstream 제공 값이며, 변경될 수 있다. 추정하지 않는다.
- `contentTypeId`/`areaCode` 체계는 TourAPI 문서를 따른다.
