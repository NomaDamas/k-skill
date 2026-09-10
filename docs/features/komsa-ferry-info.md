# KOMSA 연안여객선 정보 조회 가이드

`komsa-ferry-info`는 한국해양교통안전공단(KOMSA) MTIS Open API를 통해 연안여객선 운항 일정과 선박·항로 정보를 조회하는 read-only 스킬이다.

## 빠른 사용

```bash
npx -y @nomadamas/k-skill@0 exec komsa-ferry-info scripts/komsa_ferry_info.py -- \
  schedules --date 20260824 --limit 10
```

지원 dataset은 `schedules`, `vessels`, `ports`, `license-routes`, `operation-routes`, `status`다. 기본 호출은 hosted `k-skill-proxy`를 사용하며 운영자 키는 프록시 서버에만 보관한다.

## 공식 출처와 제한

- KOMSA MTIS 포털: <https://mtisopenapi.komsa.or.kr/>
- API 목록: <https://mtisopenapi.komsa.or.kr/cop/api/totApiInfolist.do>
- API 매뉴얼: <https://mtisopenapi.komsa.or.kr/uat/ugp/apiManual.do>

운항정보는 예매 가능 좌석·결제 상태가 아니며, 예매·결제·로그인 자동화는 수행하지 않는다. API 키가 없으면 proxy가 `503 upstream_not_configured`를 반환한다.
