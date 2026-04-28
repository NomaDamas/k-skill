# K-스킬 클리너 가이드

`k-skill-cleaner`는 K-스킬 묶음에서 사용자가 쓰지 않는 스킬을 찾기 위한 정리 보조 스킬이다. 몇 가지 인터뷰 답변과 로컬 코딩 에이전트 로그의 트리거 횟수 신호를 합쳐 삭제 후보와 검토 후보를 나눈다.

## 기본 흐름

1. 먼저 인터뷰로 보존할 스킬, 절대 쓰지 않는 스킬, 주로 쓰는 에이전트, 분석 기간을 확인한다.
2. 설치된 단독 스킬에서는 `python3 scripts/k_skill_cleaner.py`를 `k-skill-cleaner` 스킬 디렉터리 안에서 실행한다. 전체 저장소 checkout에서는 `python3 k-skill-cleaner/scripts/k_skill_cleaner.py` 또는 호환 wrapper `python3 scripts/k_skill_cleaner.py`를 사용할 수 있다.
3. helper는 root-level `SKILL.md` 디렉터리를 찾고, 사용자가 제공한 usage JSON 또는 로컬 로그를 스캔한다.
4. 결과 JSON의 `candidates`를 읽어 `remove`와 `review`를 분리한다.
5. 삭제는 추천 이후 사용자가 명시적으로 승인한 경우에만 진행한다.

## 트리거 횟수 확인 방법

| 에이전트 | 확인 위치 | 주의점 |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl`, `~/.claude/transcripts/**/*.jsonl` | 스킬 이벤트, `$skill` 언급, `SKILL.md` 로드 흔적을 best-effort로 센다. |
| Codex | `~/.codex/sessions/**/*.jsonl`, `~/.codex/log/**/*.log`, `.omx/logs/**/*.log` | 라우팅된 스킬명, `$skill` 호출, 스킬 파일 읽기 흔적을 센다. |
| OpenCode | `~/.local/share/opencode/**/*.jsonl`, `~/.config/opencode/**/*.jsonl` | 설치별 schema가 다를 수 있어 export된 transcript가 더 정확할 수 있다. |
| OpenClaw/ClawHub | `~/.openclaw/**/*.jsonl`, `~/.clawhub/**/*.jsonl` | 공개적으로 고정된 trigger-count schema를 가정하지 않는다. 가능하면 사용자가 export한 통계를 받는다. |
| Hermes Agent | `~/.hermes/**/*.jsonl`, `~/.config/hermes/**/*.jsonl` | 공개적으로 고정된 trigger-count schema를 가정하지 않는다. 가능하면 사용자가 export한 통계를 받는다. |

## 예시

```bash
python3 scripts/k_skill_cleaner.py \
  --skills-root . \
  --scan-default-logs \
  --days 90 \
  --never-use blue-ribbon-nearby,lotto-results \
  --keep k-skill-setup,k-skill-cleaner
```

`--days 90`은 최근 90일 window만 카운트한다. timestamp가 없는 로그 줄은 파일 mtime으로 포함/제외를 결정한다. 출력은 파일 삭제를 하지 않는 JSON 리포트다. `zero_triggers`나 `low_usage`만 있는 항목은 바로 삭제하지 말고 검토 후보로 남긴다. `interview_never_use`가 포함된 항목은 사용자의 의도가 확인된 삭제 후보로 보고한다.
