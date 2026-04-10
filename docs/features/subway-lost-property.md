# 지하철 분실물 조회 가이드

## 이 기능으로 할 수 있는 일

- 역명/물품명/기간 기준으로 LOST112 공식 검색 조건 정리
- 서울교통공사 유실물센터 공식 진입점 안내
- `SITE=V` 기준 지하철 등 외부기관 습득물 검색 payload 생성
- 공식 페이지 reachability를 보수적으로 점검

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- `python3`, `curl` 사용 가능 환경
- 인터넷 연결

## v1 범위

현재 공개 API는 명확하지 않으므로, 이 기능은 **안내형/하이브리드** 범위로 제공된다.

- 공식 LOST112 검색폼에 넣을 값을 구조화해 준다.
- 서울교통공사 유실물센터를 같이 열 수 있게 한다.
- 자동 결과 수집은 보장하지 않는다.

## 공식 경로

- LOST112 습득물 목록: `https://www.lost112.go.kr/find/findList.do`
- 서울교통공사 유실물센터: `https://www.seoulmetro.co.kr/kr/page.do?menuIdx=541`

LOST112에서 실제로 중요한 검색 조건은 아래와 같다.

- `SITE=V`: 경찰 이외 기관(지하철, 공항 등)
- `DEP_PLACE`: 보관장소/역명 키워드
- `PRDT_NM`: 물품명
- `START_YMD`, `END_YMD`: 검색 기간

## 기본 흐름

1. 사용자에게 역명, 물품명, 대략의 날짜를 먼저 받는다.
2. helper로 LOST112 payload와 referer가 포함된 runnable `curl` 예시를 생성한다. 예시 `curl` 은 응답 HTML을 `lost112-search-result.html` 로 저장한다.
3. 역명 그대로 검색한 뒤, 결과가 없으면 `역` 없는 키워드나 호선명으로 넓힌다.
4. 서울교통공사 유실물센터 페이지를 함께 열어 후속 절차를 확인한다.

## 예시

```bash
python3 scripts/subway_lost_property.py \
  --station 강남역 \
  --item 지갑 \
  --days 14
```

live reachability 확인까지 하려면:

```bash
python3 scripts/subway_lost_property.py \
  --station 강남역 \
  --item 지갑 \
  --days 14 \
  --verify-live
```

## 출력 예시에서 확인할 점

- `payload.SITE` 가 `V` 로 고정되어 있는지
- `payload.DEP_PLACE` 에 역명 키워드가 들어갔는지
- `curl_example` 에 `--referer https://www.lost112.go.kr/` 가 포함되어 있는지
- `curl_example` 에 `--output lost112-search-result.html` 가 포함되어 있는지
- `curl_example` 이 `https://www.lost112.go.kr/find/findList.do` 를 사용하는지
- `official_sources` 에 LOST112 와 서울교통공사 URL이 모두 들어 있는지

## 주의할 점

- 공식 사이트 응답이 느릴 수 있다.
- 역명 표기가 실제 보관장소 표기와 다를 수 있다.
- 공개 API가 확인되기 전까지는 완전 자동 조회형으로 취급하지 않는다.
