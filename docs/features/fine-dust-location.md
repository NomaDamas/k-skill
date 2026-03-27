# 사용자 위치 미세먼지 조회 가이드

## 이 기능으로 할 수 있는 일

- 사용자 위치 위도/경도로 가까운 측정소 찾기
- 위치 권한이 없을 때 지역명/행정구역 fallback으로 측정소 찾기
- PM10, PM2.5, 등급, 조회 시각 요약

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인
- 에어코리아 OpenAPI key

## 필요한 시크릿

- `AIR_KOREA_OPEN_API_KEY`

## 입력값

- 우선: 현재 위치 위도/경도
- fallback: 지역명/행정구역 힌트 또는 측정소명

## 기본 흐름

1. 좌표가 있으면 측정소정보 API `getNearbyMsrstnList` 로 가까운 측정소를 찾습니다.
2. 좌표를 못 받거나 nearby 결과가 비면 측정소정보 API `getMsrstnList` 로 지역명/행정구역 fallback을 사용합니다.
3. 선택된 측정소 이름으로 대기오염정보 API `getMsrstnAcctoRltmMesureDnsty` 를 호출합니다.
4. PM10, PM2.5, 등급, 조회 시점/조회 시각을 함께 요약합니다.

## 예시

좌표 기반 1차 조회:

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" \
  'curl -sG "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList" \
    --data-urlencode "serviceKey=${AIR_KOREA_OPEN_API_KEY}" \
    --data-urlencode "returnType=json" \
    --data-urlencode "numOfRows=10" \
    --data-urlencode "pageNo=1" \
    --data-urlencode "dmX=37.5665" \
    --data-urlencode "dmY=126.9780"'
```

지역 fallback:

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" \
  'curl -sG "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList" \
    --data-urlencode "serviceKey=${AIR_KOREA_OPEN_API_KEY}" \
    --data-urlencode "returnType=json" \
    --data-urlencode "numOfRows=50" \
    --data-urlencode "pageNo=1" \
    --data-urlencode "addr=서울 강남구"'
```

실시간 측정값:

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" \
  'curl -sG "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty" \
    --data-urlencode "serviceKey=${AIR_KOREA_OPEN_API_KEY}" \
    --data-urlencode "returnType=json" \
    --data-urlencode "numOfRows=100" \
    --data-urlencode "pageNo=1" \
    --data-urlencode "stationName=중구" \
    --data-urlencode "dataTerm=DAILY" \
    --data-urlencode "ver=1.4"'
```

helper script 반복 검증:

```bash
python3 scripts/fine_dust.py report \
  --station-file scripts/fixtures/fine-dust-stations.json \
  --measurement-file scripts/fixtures/fine-dust-measurements.json \
  --lat 37.5665 \
  --lon 126.9780
```

## fallback / 대체 흐름

- 위치 권한이 없으면 지역명/행정구역을 먼저 받습니다
- 지역명도 없으면 측정소명을 직접 받습니다
- `getNearbyMsrstnList` 결과가 비면 `getMsrstnList` 로 재시도합니다

## 주의할 점

- 실시간 수치라 조회 시각을 같이 적어야 합니다
- PM10/PM2.5 값이 `-` 이거나 비정상이면 등급도 함께 재확인합니다
- 위치 기반이라고 해도 실제 기준은 “가까운 측정소” 이므로 주소 중심점과 오차가 있을 수 있습니다
