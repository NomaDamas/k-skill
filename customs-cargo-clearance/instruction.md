# 수입화물 통관 진행 조회

관세청 UNI-PASS 화물통관진행정보 공식 API를 통해 화물관리번호 또는 Master/House B/L 기준 통관 이벤트와 현재 상태를 조회한다. 통관 결과를 관세 신고·법률 판단·납부 완료로 해석하지 않는다.

## Workflow

```bash
npx -y @nomadamas/k-skill@0 exec customs-cargo-clearance scripts/customs_cargo_clearance.py -- \
  --hbl-no HBL123 --bl-year 2024
```

프록시 route는 `GET /v1/customs/cargo-clearance`다. `cargMtNo` 또는 `hblNo`/`mblNo`와 `blYear`를 사용한다. 기본 upstream은 <https://unipass.customs.go.kr/>이며 3년 이내 데이터만 조회 가능하다.

운영자 키는 `DATA_GO_KR_API_KEY`로 proxy 서버에만 주입한다. 키는 PR·issue·chat에 넣지 않는다.

## Failure modes

- `400 bad_request`: 식별자 누락 또는 B/L 연도 형식 오류.
- `503 upstream_not_configured`: proxy 운영자 키 미설정.
- `502 upstream_forbidden`: UNI-PASS 활용신청·키·quota 문제.
- `504 upstream_timeout`: 공식 API 시간 초과.
