# PRD: Issue 56 - Han River water-level proxy endpoint

## Goal
한강홍수통제소(HRFCO) Open API의 `waterlevel/info` + `waterlevel/list/10M` 를 `k-skill-proxy` 의 공개 read-only endpoint로 감싸서, 최종 사용자가 별도 ServiceKey 없이 한강 수위·유량을 조회할 수 있게 한다.

## User story
- 사용자는 "한강대교 지금 수위 어때?"처럼 관측소명 또는 관측소코드로 현재 수위와 유량을 빠르게 확인하고 싶다.
- 에이전트는 proxy가 주는 현재 관측값과 기준 수위를 요약해 답변한다.

## Scope
- `k-skill-proxy` 에 HRFCO waterlevel summary endpoint 추가
- proxy 환경변수/README/가이드 문서 반영
- 신규 han-river-water-level skill 및 기능 문서 추가
- 문서 회귀 테스트 + proxy server tests 추가

## Non-goals
- `rainfall` / `dam` / `bo` / `fldfct` 전체 확장
- private/auth-required proxy 도입
- 지도 기반 위치 추천 또는 관측소 선택 UX 고도화

## Acceptance criteria
1. proxy server 가 공개 read-only endpoint 로 HRFCO 현재 수위/유량을 요약 제공한다.
2. upstream HRFCO ServiceKey 는 proxy 서버 환경변수로만 관리된다.
3. endpoint 는 관측소명/관측소코드 기준 최신 관측시각, 수위, 유량, 기준수위를 포함한 JSON 을 반환한다.
4. 신규 skill/docs 는 hosted proxy 기본 경로와 무-key client workflow 를 문서화한다.
5. 로컬 테스트 및 최소 1회 실제 서버 실행/요청 검증을 완료한다.
