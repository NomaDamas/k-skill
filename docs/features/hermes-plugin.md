# Hermes Agent 플러그인

`hermes-plugin/` 디렉터리는 k-skill 전체를 [Hermes Agent](https://hermes-agent.nousresearch.com) 플러그인 하나로 묶은 것이다. 스킬 로직을 다시 구현하지 않고 공식 `@nomadamas/k-skill` CLI를 호출하므로 다른 에이전트와 동작이 같다.

## 설치와 확인

```bash
hermes plugins install NomaDamas/k-skill/hermes-plugin --enable
hermes k-skill doctor
```

- Hermes Agent, Node.js 18+ (`k-skill` 바이너리 또는 `npx`)가 필요하다. 플러그인 자체는 Python 의존성이 없다.
- 설치된 `k-skill`이 오래돼 새 스킬을 모르면(`unknown skill`) 자동으로 `npx -y @nomadamas/k-skill@0`로 재시도한다. `KSKILL_CLI`를 지정하면 그 명령만 사용한다.

## 구성

| 구성요소 | 이름 | 역할 |
| --- | --- | --- |
| 도구 | `kskill_search` | `catalog.json` 오프라인 검색(이름·설명·한국어 트리거·카테고리, 모든 단어가 매칭돼야 함) |
| 도구 | `kskill_instructions` | `k-skill instruct <skill>` — 런타임 인지 최신 지침 |
| 도구 | `kskill_exec` | `k-skill exec <skill> scripts/<f> -- <args>` — 셸 없이 argv 배열로 실행, 타임아웃 기본 60초(최대 300초) |
| 도구 | `kskill_read` | `k-skill read <skill> references/<f>` |
| 슬래시 | `/kskill <키워드>` | 채팅에서 카탈로그 검색 |
| CLI | `hermes k-skill search\|show\|run\|doctor` | 터미널용 진입점. `doctor`는 CLI 버전·카탈로그 최신 여부 점검 |
| 스킬 | `k-skill:k-skill` | 도구 사용 순서와 승인 규칙 안내 |

## 안전 경계

- `skill`은 `^[a-z0-9][a-z0-9-]*$`, `script`/`file`은 `scripts/` 또는 `references/` 아래 상대경로만 허용하고 `..`는 거부한다.
- 자식 프로세스는 stdin을 닫고, 시간 초과 시 프로세스 그룹을 종료하며, 출력은 80,000자로 자른다.
- 플러그인은 자격증명을 읽거나 저장하지 않는다. 결제·전송·제출 같은 비가역 행동 전 `clarify` 승인은 각 스킬 지침과 번들 스킬이 요구한다.

## 유지보수

- `hermes-plugin/catalog.json`은 `skill.json`과 `instruction.md`의 `## When to use` 인용 문구에서 `node scripts/generate-hermes-catalog.js`로 생성한다. 스킬을 추가·삭제·수정하면 다시 생성해 커밋한다. `npm run lint`가 `--check`로 최신 여부를 검증한다.
- `hermes-plugin/`은 스킬 디렉터리가 아니므로 `validate-skills.sh`, Manus 번들, Claude 플러그인 매니페스트 스캐너에서 제외된다.
- 테스트: `PYTHONPATH=hermes-plugin/tests python3 -m unittest discover -s hermes-plugin/tests` (`npm run test`에도 포함).
- Hermes 쪽 검증: `hermes plugins doctor hermes-plugin --ci`, `hermes plugins validate hermes-plugin` (최신 Hermes 필요).
