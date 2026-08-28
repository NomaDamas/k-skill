# 수입화물 통관 진행 조회 가이드

`customs-cargo-clearance`는 관세청 UNI-PASS 공식 API에서 화물관리번호 또는 Master/House B/L 기준 통관 진행 상태를 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec customs-cargo-clearance scripts/customs_cargo_clearance.py -- \
  --hbl-no HBL123 --bl-year 2024
```

공식 API는 UNI-PASS 회원가입과 OpenAPI 활용신청이 필요하며, 조회 가능 기간은 최근 3년이다. proxy 운영자는 `DATA_GO_KR_API_KEY`를 runtime secret으로 등록한다. 통관 조회는 신고·납부·법률 판단이 아니다.

공식 데이터 설명: <https://www.data.go.kr/data/15126268/openapi.do>
