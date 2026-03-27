---
name: fine-dust-location
description: 에어코리아 공식 API에서 미세먼지(PM10)와 초미세먼지(PM2.5)를 사용자 위치 또는 지역 fallback 기준으로 조회한다.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Fine Dust By Location

## What this skill does

사용자 위치정보(위도/경도) 또는 지역명 fallback을 바탕으로 가까운 측정소를 고른 뒤, 에어코리아 공식 OpenAPI에서 미세먼지(PM10)와 초미세먼지(PM2.5) 실측값을 조회한다.

## When to use

- "지금 내 위치 미세먼지 어때?"
- "여기 공기질 괜찮아?"
- "강남 쪽 초미세먼지 수치 알려줘"

## Prerequisites

- 에어코리아 OpenAPI key
- `sops` and `age` installed
- common setup reviewed in `../k-skill-setup/SKILL.md`
- secret policy reviewed in `../docs/security-and-secrets.md`
- Python 3

## Required secrets

- `AIR_KOREA_OPEN_API_KEY`

## Inputs

- 우선 입력: 사용자 위치 위도/경도
- fallback 입력: 지역명/행정구역 힌트 또는 측정소명

## Workflow

### 1. Stop for secure registration when the API key is missing

`AIR_KOREA_OPEN_API_KEY`, `~/.config/k-skill/secrets.env`, `~/.config/k-skill/age/keys.txt` 중 하나라도 없으면 다음 식으로 안내하고 멈춘다.

```text
이 작업에는 AIR_KOREA_OPEN_API_KEY 가 필요합니다.
값을 채팅창에 붙여 넣지 말고 ~/.config/k-skill/secrets.env.plain 에 직접 채운 뒤
sops 로 ~/.config/k-skill/secrets.env 로 암호화해 주세요.
암호화가 끝나면 plaintext 파일은 지우고 bash scripts/check-setup.sh 로 다시 확인해 주세요.
```

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" 'test -n "$AIR_KOREA_OPEN_API_KEY"'
```

### 2. Prefer the official location-first measuring-station lookup

좌표를 이미 알고 있으면 측정소정보 API의 `getNearbyMsrstnList` 로 가까운 측정소를 찾는다.

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

### 3. Use the official fallback when the user cannot provide precise coordinates

현재 위치 권한이 없거나 `getNearbyMsrstnList` 결과가 비면, 같은 측정소정보 API의 `getMsrstnList` 로 지역명/행정구역 또는 측정소명 fallback을 건다.

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

이 스킬의 fallback/폴백 규칙은 다음 순서를 기본으로 한다.

1. 위도/경도 → `getNearbyMsrstnList`
2. 지역명/행정구역 → `getMsrstnList`
3. 측정소명 직접 지정 → `getMsrstnAcctoRltmMesureDnsty`

### 4. Query the official real-time measurement API

선택한 가까운 측정소 이름으로 대기오염정보 API `getMsrstnAcctoRltmMesureDnsty` 를 호출해 PM10/PM2.5 와 등급을 가져온다.

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

### 5. Prefer the helper script for repeatable summaries

반복 실행이나 fixture 검증에는 `python3 scripts/fine_dust.py report ...` 경로를 우선한다.

```bash
python3 scripts/fine_dust.py report \
  --station-file scripts/fixtures/fine-dust-stations.json \
  --measurement-file scripts/fixtures/fine-dust-measurements.json \
  --lat 37.5665 \
  --lon 126.9780
```

실전 호출은 같은 CLI에 `--region-hint` 또는 `--station-name` fallback을 줄 수 있다.

### 6. Keep the answer compact and explicit

응답에는 아래만 먼저 정리한다.

- 가까운 측정소
- 조회 시점/조회 시각
- PM10 값과 등급
- PM2.5 값과 등급
- 좌표 기반 조회인지, 지역 fallback인지

## Done when

- 사용자 위치 또는 fallback 입력으로 가까운 측정소를 골랐다
- PM10, PM2.5, 등급, 조회 시점을 보여줬다
- 위치 자동 인식이 없을 때의 대체 흐름을 설명했다

## Failure modes

- API key 미설정
- 위치 좌표 없이 지역 힌트도 없는 경우
- nearby API 결과가 비어 지역 fallback이 필요한 경우
- 측정소명 표기 불일치

## Notes

- 실시간 값은 수시로 바뀌므로 답변에 조회 시점을 같이 적는다
- issue #17 승인 코멘트대로 두 가지 OpenAPI(측정소정보 + 대기오염정보)를 함께 사용한다
