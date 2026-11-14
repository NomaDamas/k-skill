# k-skill — Hermes Agent plugin

한국 일상·업무 스킬 130+개(KTX/SRT, 당근, 쿠팡, 다이소, 미세먼지, 주유소, 공시지가, 법령, 공공데이터, 병원/약국, 부동산, 주식/공시, 맞춤법 …)를 Hermes Agent 도구로 제공합니다.

플러그인은 스킬 로직을 다시 구현하지 않습니다. 지침·헬퍼 스크립트·레퍼런스는 모두 공식 `@nomadamas/k-skill` CLI에서 가져오므로 다른 에이전트와 동작이 같고 항상 최신입니다.

## 설치

```bash
hermes plugins install NomaDamas/k-skill/hermes-plugin --enable
```

필요 조건: Hermes Agent, Node.js 18+ (`k-skill` 바이너리 또는 `npx`). 확인:

```bash
hermes k-skill doctor
```

## 에이전트 도구

| 도구 | 역할 |
| --- | --- |
| `kskill_search` | 한/영 키워드로 스킬 검색 (오프라인) |
| `kskill_instructions` | 스킬의 전체 실행 지침 (`k-skill instruct`) |
| `kskill_exec` | 번들 헬퍼 스크립트 실행 (`k-skill exec`, 셸 미경유 argv) |
| `kskill_read` | 번들 레퍼런스 읽기 (`k-skill read`) |

번들 스킬 `k-skill:k-skill`이 위 도구를 쓰는 순서를 안내합니다. 사람용 진입점: 채팅 `/kskill <키워드>`, 셸 `hermes k-skill search|show|run|doctor`.

## 설정

| 환경변수 | 의미 |
| --- | --- |
| `KSKILL_CLI` | CLI 실행 명령 override (예: `node /path/to/packages/k-skill-cli/bin/k-skill.js`) |
| `KSKILL_ANALYTICS_DISABLED=1` | CLI 사용 통계 비활성화 |

API 키가 필요한 스킬은 각 스킬 지침을 따릅니다(`~/.config/k-skill/secrets.env` 등). 플러그인은 자격증명을 읽거나 저장하지 않습니다.

## 개발

`catalog.json`은 `scripts/generate-hermes-catalog.js`가 `skill.json`/`instruction.md`에서 생성합니다. 스킬을 추가·수정하면 `node scripts/generate-hermes-catalog.js`를 실행하세요(`npm run lint`가 최신 여부를 검사). 테스트: `PYTHONPATH=hermes-plugin/tests python3 -m unittest discover -s hermes-plugin/tests`.
