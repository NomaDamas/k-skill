---
name: korean-transit-route
description: Korean door-to-door public transit routing (subway + bus + walking) via ODsay LIVE API with Kakao geocoding for address-to-address queries. Use when the user asks for 지하철/버스/대중교통 길찾기, 환승 경로, 소요시간, or transit directions between two places in Korea.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# korean-transit-route

한국 대중교통(지하철+버스+도보) 도어투도어 길찾기 스킬. ODsay LIVE API + Kakao Local geocoding.

## When to use

- "강남에서 잠실 지하철로 어떻게 가?"
- "서울역 → 인천공항 대중교통 경로"
- "환승 가장 적은 경로", "최소 시간 경로"

## Credentials

- 환경변수 `ODSAY_API_KEY` 가 있으면 사용. 없으면 `~/.config/k-skill/secrets.env` 에서 로드.
- ODsay Server 키는 호출 IP 화이트리스트 등록 필수. 발급은 https://lab.odsay.com

## Inputs

자연어 입력에서 출발/도착을 추출. 좌표가 없으면 **반드시 geocoding 먼저** (ODsay는 좌표만 받음).

### Geocoding (필수 선행 단계)

`KAKAO_REST_API_KEY` 사용. 두 엔드포인트를 순서대로 시도:

1. `https://dapi.kakao.com/v2/local/search/address.json?query=<주소>` — 도로명/지번 주소
2. 결과 없으면 `https://dapi.kakao.com/v2/local/search/keyword.json?query=<장소명>` — 상호명/랜드마크

헤더: `Authorization: KakaoAK <KAKAO_REST_API_KEY>`. 응답 `documents[0].x`(경도), `.y`(위도) 사용.

```python
import os, urllib.parse, urllib.request, json
H={'Authorization':'KakaoAK '+os.environ['KAKAO_REST_API_KEY']}
def geocode(q):
    for ep,name in [('address','address_name'),('keyword','place_name')]:
        url=f'https://dapi.kakao.com/v2/local/search/{ep}.json?query='+urllib.parse.quote(q)
        d=json.loads(urllib.request.urlopen(urllib.request.Request(url,headers=H),timeout=10).read())
        if d.get('documents'):
            x=d['documents'][0]; return float(x['x']), float(x['y']), x.get(name) or x['address_name']
    return None
```

지하철역명만 정확히 알 때는 ODsay `searchStation` 도 OK 하지만, 도어투도어 결과를 원하면 **실제 출발지/도착지 좌표**를 써야 첫/끝 도보 구간이 계산됨.

## Core call

```bash
set -a; . ~/.config/k-skill/secrets.env; set +a
KEY=$(python3 -c "import os,urllib.parse;print(urllib.parse.quote(os.environ['ODSAY_API_KEY'],safe=''))")
curl -s "https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${KEY}&SX=${SX}&SY=${SY}&EX=${EX}&EY=${EY}&OPT=0&SearchPathType=${TYPE}"
```

Parameters:
- `SX,SY` 출발 경도/위도, `EX,EY` 도착 경도/위도 (WGS84)
- `OPT`: `0` 추천순(기본), `4` 최소시간, `5` 최소환승
- `SearchPathType`: `0` 지하철+버스, `1` 지하철만, `2` 버스만

## Response shape

`result.path[]` 배열, 각 path:
- `pathType`: 1=지하철, 2=버스, 3=지하철+버스
- `info.totalTime`(분), `info.payment`(원), `info.subwayTransitCount`, `info.busTransitCount`, `info.totalWalk`(m), `info.firstStartStation`, `info.lastEndStation`
- `subPath[]`: 구간별. `trafficType` 1=지하철 2=버스 3=도보. 지하철이면 `lane[0].name`, `startName`, `endName`, `passStopList.stations[]`(경유역)

## Recommended output (door-to-door)

`subPath` 의 각 구간을 `trafficType` 별로 표시. 첫/끝 도보 구간은 출발지·도착지에서 역까지 실제 도보를 의미하므로 **반드시 포함**.

```
🚇 범안로95번길 32 → SKT타워
경로 1: 54분 · 1,950원 · 환승 2회 · 도보 688m
  🚶 도보 1분
  🚌 19번 부천범박힐스테이트 → 역곡역 (9분)
  🚶 도보 2분
  🚇 1호선 역곡 → 종각 (15정거장, 35분)
  🚶 도보 7분
```

3개 이내 경로 비교 권장. `OPT=4`(최소시간) / `OPT=5`(최소환승) 옵션을 사용자가 선호 표시하면 그쪽으로 호출.

## Helpers

좌표 모르고 역명만 아는 경우 — `searchStation` 으로 변환:

```bash
curl -s "https://api.odsay.com/v1/api/searchStation?apiKey=${KEY}&stationName=강남&CID=1000"
```

`CID=1000` = 수도권. 결과 `result.station[].x,y` 가 좌표.

## Limits

- 무료 일 5,000건. `searchPubTransPathT` + `searchStation` 호출이 합산되니 한 질문당 호출 최소화.
- 응답에 `error` 키 있으면 즉시 사용자에게 표시(ApiKey/IP 문제 진단에 유용).
- 한국 외 좌표는 지원 안 함.

## Don'ts

- 카카오맵/네이버지도 directions API로 대중교통 라우팅 시도하지 말 것 (둘 다 운전·도보만 공개).
- 키를 절대 응답에 노출하지 말 것.
