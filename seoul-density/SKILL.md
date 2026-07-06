---
name: seoul-density
description: 서울 주요 121개 핫스팟 장소의 실시간 혼잡도와 인구 현황을 조회한다. 지금 강남역이 얼마나 붐비는지, 홍대 인파가 얼마나 되는지 물어볼 때 사용한다.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Seoul Density

## What this skill does

서울 실시간 도시데이터 API(data.seoul.go.kr)를 호출해 121개 핫스팟의 **현재 혼잡도 단계**(여유 / 보통 / 약간 붐빔 / 붐빔)와 **추정 인구 범위**를 반환한다.

데이터는 KT·SKT 통신 신호 기반 추계치이며, 5분 주기로 갱신되나 호출 시점 기준 약 15분 전 값이다.

## When to use

- "지금 강남역 얼마나 붐벼?"
- "홍대 지금 인파 어때?"
- "명동 지금 사람 많아?"
- "여의도한강공원 지금 여유로워?"

## Prerequisites

별도 API 키 발급 없이 그대로 쓸 수 있다. 모든 호출은 **k-skill-proxy 경유**다.

- 기본 프록시 URL: `https://k-skill-proxy.nomadamas.org` — 프록시 서버가 `SEOUL_OPEN_API_KEY`를 보유하고 있어 사용자는 키 없이 호출만 하면 된다.
- `KSKILL_PROXY_BASE_URL` 환경변수로 프록시 주소를 바꿀 수 있다(예: 별도 self-host 프록시).

## Single entrypoint

이 스킬의 모든 동작은 **단일 진입점**을 통한다. OS·CWD에 관계없이 동일하게 동작하도록 절대 경로 + Python launcher fallback을 사용한다:

```bash
# macOS / Linux / Git-bash
python3 "$SKILL_DIR/scripts/seoul_density.py" <subcommand> [args]

# Windows (PowerShell): py 런처 또는 python
py -3 "$env:SKILL_DIR\scripts\seoul_density.py" <subcommand> [args]
```

`$SKILL_DIR`은 이 SKILL.md가 위치한 디렉토리다(`~/.claude/skills/seoul-density` 또는 레포의 `seoul-density/`). 호출 예시는 아래 Workflow 참조.

첫 사용 시 `Bash(python3 *seoul_density.py:*)` (또는 PowerShell 환경에서 `PowerShell(py -3 *seoul_density.py*)`) 패턴 한 번만 승인하면 이후 호출은 모두 자동 허용된다. 외부 dependency는 없고 Python 표준 라이브러리만 사용한다.



### Subcommands

| 명령 | 설명 |
|------|------|
| `list [--json]` | 지원 121개 장소 목록 (카테고리별) |
| `match <키워드> [--limit N] [--json]` | 사용자 입력 → 지원 장소명 매칭 |
| `query <장소명> [--json]` | 실시간 혼잡도/인구 조회 (사람이 읽는 요약 또는 JSON) |

## Workflow

### 1. 모호한 입력은 match로 후보 확인 (선택)

사용자가 "홍대 인파"처럼 모호하게 말하면 먼저 후보를 확인한다.

```bash
python3 "$SKILL_DIR/scripts/seoul_density.py" match "홍대" --json
# → ["홍대 관광특구", "홍대입구역(2호선)"]
```

후보가 1개면 바로 `query`로 넘어가도 되고(스크립트가 자동 매칭), 여러 개면 어느 쪽인지 사용자에게 확인한다.

### 2. 혼잡도 조회

키워드 1개만 매칭되면 자동으로 보정한다.

```bash
# macOS / Linux / Git-bash
python3 "$SKILL_DIR/scripts/seoul_density.py" query "강남역"

# Windows PowerShell
py -3 "$env:SKILL_DIR\scripts\seoul_density.py" query "강남역"
```

출력 예시:

```
장소: 강남역
혼잡도: 약간 붐빔
인구 추정: 24000~26000명
기준 시각: 2026-05-14 09:30
상황: 사람이 몰려있을 수 있어요
```

기계적 후처리가 필요하면 `--json` 플래그를 쓴다:

```bash
python3 "$SKILL_DIR/scripts/seoul_density.py" query "강남역" --json
```

자동 매칭을 끄고 싶으면 `--no-auto`를 쓴다.

## Done when

- 장소명, 혼잡도 단계, 추정 인구 범위(최소~최대), 기준 시각, 혼잡도 메시지를 사용자에게 전달했다.

## Failure modes

| 상황 | 동작 |
|------|------|
| 프록시 정상 응답 | 별도 키 불필요, 즉시 결과 반환 |
| 지원하지 않는 장소명 (`exit 1`) | `match` 결과로 후보 제안 |
| 프록시 HTTP/네트워크 오류 (`exit 1`) | stderr에 사유 출력, `KSKILL_PROXY_BASE_URL` 점검 또는 5분 후 재시도 안내 |
| 새벽 01~05시 빈 응답 | 실시간 데이터 미제공 시간대임을 안내 |
| 일일 할당량 초과 | 다음 날 재시도 안내 |

## Notes

- 인구 수치는 실제값이 아닌 **추계치** (KT·SKT 통신 신호 데이터 기반).
- 데이터는 호출 시점 기준 **약 15분 전** 값.
- 단일 진입점 외에 `curl`, `python3 -c`, `source` 같은 inline 명령을 직접 실행하지 말 것. 그렇게 하면 사용자가 매번 별도 승인을 받아야 한다.
- 새 카테고리/장소가 추가되면 `seoul-density/scripts/seoul_density.py`의 `AREAS` 딕셔너리만 갱신한다.
