# Test Spec: Issue 56 - Han River water-level proxy endpoint

## Regression coverage
1. `packages/k-skill-proxy/test/server.test.js` 에 HRFCO endpoint allowlist/serviceKey injection/public access/cache/ambiguous station assertions 추가
2. `scripts/skill-docs.test.js` 에 신규 han-river-water-level skill/docs/README/setup/sources/roadmap 노출면 검증 추가
3. root `npm test` 와 proxy workspace tests 가 모두 통과

## Manual verification
1. `node packages/k-skill-proxy/src/server.js` 로 로컬 서버 기동
2. health 와 새 HRFCO endpoint 를 실제 HTTP 요청으로 확인
3. station name / station code / 잘못된 입력에 대한 보수적 응답 확인
