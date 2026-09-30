# 한·미 국채시장 분석

`government-bond-analysis`는 한국 국고채(KTB)와 미국 국채(UST)의 일별 금리 변화를 공식 데이터로 계산하고, 같은 형식의 대화형 분석이나 HTML 보고서로 정리한다. 일반적인 경제통계 검색보다 국채 금리의 날짜·단위·만기 정렬과 비교 검증에 초점을 둔다.

## 데이터와 범위

| 항목 | 원천 | 처리 |
| --- | --- | --- |
| 한국 국고채 2·3·5·10·20·30년 | 한국은행 ECOS 일별 시장금리 | 여섯 만기의 공통 관측일, 연% 단위, bp 변화 검증 |
| 미국 국채 2·3·5·10·20·30년 | 미국 재무부 일별 par yield | 원본 날짜·만기·단위를 검증해 커브 변화 계산 |
| 한·미 10년 금리차 | 위 두 원천 | 동일 관측일이 있을 때만 계산 |
| 주요 일정 | 국채 발행기관·중앙은행의 공식 일정 | 실제 페이지에서 확인된 입찰일·정책 결정일만 표시 |

기본 대화 출력은 **상태·관측일 → 핵심 변화 → 만기별 표 → 커브·한미 차이 → 주요 일정 → 확인 사항·출처** 순서다. 두 시장 중 한 원천이 실패하면 얻은 수치를 보존하면서 `INCOMPLETE`를 표시한다. 공식 일정 근거가 없으면 일정 섹션에 `공식 일정 미확인`이라고 쓴다. 과거와 같은 결과가 필요할 때는 원자료와 검증 정보를 저장한 evidence를 재생한다.

## 사용 예시

```bash
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --base 2026-09-18 --as-of 2026-09-22 --out ./bond-report
npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/cli.mjs -- --market both --replay ./bond-report/evidence.mjson --out ./bond-replay
```

한국 시장만 보려면 `--preset dashboard`로 전일·1주·전월말 변화와 스프레드를 한 번에 조회할 수 있다. `--json`은 기계 처리용이고 `--out`은 파일 보고서가 필요할 때만 쓴다. 주요 일정의 공식 원문을 확인했으면 `--schedule-evidence FILE`로 추가한다. 증거 파일의 필드·검증 기준과 실패 상태는 [스킬 안내](../../government-bond-analysis/instruction.md)와 [방법론](../../government-bond-analysis/references/methodology.md)에 있다.

실시간 호가, 개별 채권 가격평가, 매매 추천은 제공하지 않는다. 같은 날짜의 양국 금리도 종가 시점이 달라 동시 거래 가격이나 환헤지 비용으로 해석하지 않는다.

## 검증

TypeScript 원본을 `.mjs` 실행 파일로 컴파일한 뒤 `npx -y @nomadamas/k-skill@0 exec government-bond-analysis scripts/harness.mjs --`로 날짜, 단위, 결측, 원문 체크섬, 일정 근거 및 evidence 재생을 포함한 결정론적 검사를 실행한다.
