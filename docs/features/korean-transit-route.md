# 한국 대중교통 길찾기 가이드

## 이 기능으로 할 수 있는 일

- 출발지→도착지 도어투도어 대중교통 경로 조회 (지하철 + 버스 + 도보)
- ODsay LIVE API 기반 환승 정보, 소요시간, 요금 확인
- Kakao Local geocoding으로 주소·장소명→좌표 변환
- 추천순 / 최소시간 / 최소환승 옵션 선택

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인
- ODsay Server API Key 발급 및 호출 IP 화이트리스트 등록: https://lab.odsay.com
- Kakao REST API Key 발급 (지도/로컬 서비스 활성화): https://developers.kakao.com

## 필요한 환경변수

- `ODSAY_API_KEY` — ODsay LIVE API Server 키
- `KAKAO_REST_API_KEY` — Kakao Local REST API 키

두 값 모두 `~/.config/k-skill/secrets.env` 에 저장하거나 환경변수로 주입한다.

## 입력값

- 출발지 (주소, 장소명, 또는 좌표)
- 도착지 (주소, 장소명, 또는 좌표)
- 선택 사항: 경로 옵션 (`OPT=0` 추천순, `4` 최소시간, `5` 최소환승), `SearchPathType` (`0` 지하철+버스, `1` 지하철만, `2` 버스만)

## 기본 흐름

1. 출발지/도착지를 Kakao Local API(`address.json` → `keyword.json`)로 geocoding하여 좌표를 확보한다.
2. ODsay `searchPubTransPathT`에 출발/도착 좌표와 옵션을 전달한다.
3. 응답의 `result.path[]`를 3개 이내로 정리한다.
4. 각 경로의 `subPath[]`를 `trafficType`별로 표시하며, 첫/끝 도보 구간을 반드시 포함한다.

## 예시

### 좌표 직접 입력

```bash
set -a; . ~/.config/k-skill/secrets.env; set +a
KEY=$(python3 -c "import os,urllib.parse;print(urllib.parse.quote(os.environ['ODSAY_API_KEY'],safe=''))")
curl -s "https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${KEY}&SX=126.9706&SY=37.5559&EX=127.0276&EY=37.4979&OPT=0&SearchPathType=0"
```

### 주소→좌표→경로 (Python)

```python
import os, urllib.parse, urllib.request, json

H = {'Authorization': 'KakaoAK ' + os.environ['KAKAO_REST_API_KEY']}

def geocode(q):
    for ep, name in [('address', 'address_name'), ('keyword', 'place_name')]:
        url = f'https://dapi.kakao.com/v2/local/search/{ep}.json?query=' + urllib.parse.quote(q)
        req = urllib.request.Request(url, headers=H)
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read())
        if d.get('documents'):
            doc = d['documents'][0]
            return float(doc['x']), float(doc['y']), doc.get(name) or doc['address_name']
    return None

sx, sy, s_name = geocode('서울역')
ex, ey, e_name = geocode('강남역')
# 이후 ODsay searchPubTransPathT 호출
```

## 주의할 점

- ODsay Server 키는 **호출 IP 화이트리스트 등록이 필수**이다. 등록되지 않은 IP에서는 `error` 응답이 반환된다.
- 묣료 일일 한도는 5,000건이다. `searchPubTransPathT`와 `searchStation` 호출이 합산된다.
- 한국 외 좌표는 지원하지 않는다.
- 카카오맵/네이버지도 directions API는 대중교통 라우팅을 공개하지 않으므로 사용하지 말 것.
