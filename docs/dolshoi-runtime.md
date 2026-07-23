# Dolshoi Runtime Contract

이 문서는 k-skill의 돌쇠 우선 실행 계약과 portable fallback을 관리한다. 실제 설치된 각 스킬은 `docs/` 없이 단독으로 존재할 수 있으므로, 모든 top-level `SKILL.md`에는 `docs/adding-a-skill.md`의 짧은 `## Runtime contract (required)` 블록이 원문 그대로 들어간다.

## 배포 제약

- Vercel `skills add --skill <name>`은 선택한 스킬 디렉터리만 설치할 수 있다.
- symlink 설치와 `--copy` 설치 모두 지원되므로 저장소 바깥 상대 참조에 의존하면 안 된다.
- Dolshoi desktop의 k-skill projection도 checkout의 top-level `SKILL.md` 디렉터리만 `<HERMES_HOME>/skills/k-skill/`로 복사하고 `docs/`는 포함하지 않는다.
- 따라서 공통 정책은 짧은 portable block으로 각 스킬에 포함하고, 이 문서에는 중복되기 쉬운 근거와 유지보수 설명만 둔다.

## Capability detection

제품 이름, 경로, user-agent 문자열을 추측하지 말고 실제 사용 가능한 capability를 검사한다.

### Credential action mode

다음 두 조건이 모두 참일 때만 활성화한다.

1. `DOLSHOI_ACTION_BROKER_URL`이 설정되어 있다.
2. `vault-run`이 `PATH`에서 실행 가능하다.

Dolshoi desktop은 turn 시작 시 loopback action broker와 one-shot key를 child environment에 주입하고 `vault-run` asset directory를 `PATH` 앞에 둔다. broker seed/start가 best-effort로 실패할 수 있으므로 한 신호만으로 credential mode를 선언하지 않는다.

capability가 있으면 `vault-run <capability_id> <action> [args...]`를 사용한다. 필요한 service login이 없으면 `request_vault_credential` tool을 호출한다. 이 tool은 앱의 vault 입력 UI를 열고, 저장 성공 시 같은 turn에 새 capability를 돌려줄 수 있다. 모델은 username/password/key 원문을 요청하거나 출력하지 않는다.

### CloakBrowser mode

다음 중 하나면 활성화한다.

- 에이전트의 내장 browser tool/provider가 CloakBrowser로 식별된다.
- `CLOAKBROWSER_PEEK_TOKEN`이 설정되어 있다.

CloakBrowser mode는 credential action mode와 독립적이다. browser가 가능하지만 broker가 실패할 수 있고, 반대도 가능하다. CloakBrowser mode에서는 내장 browser tool을 먼저 사용하고, generic `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP는 사용할 수 없을 때의 fallback이다.

장기적으로 dolshoi가 안정적인 `DOLSHOI_RUNTIME=1` 계약을 제공하면 이 문서와 portable block의 감지 순서를 갱신한다. 현재 코드에서 host-authoritative인 실제 capability 신호를 사용하므로 없는 변수를 지어내지 않는다.

## Action completion model

돌쇠에서 사용자가 행동을 요청하면 조회 결과는 중간 산출물이다.

1. 공개 HTTP/API로 후보를 조회한다.
2. 공식 계정 surface가 필요하면 CloakBrowser 또는 provisioned `vault-run` action으로 전환한다.
3. 장바구니, 초안 작성, 좌석 선택, 임시 선점처럼 되돌릴 수 있는 단계는 계속 수행한다.
4. 결제, 메시지/메일 전송, 최종 제출, 취소, 계정 상태 변경, 공개 게시처럼 비가역 외부 효과 직전에 `clarify`를 호출한다.
5. `clarify`에는 정확한 대상, 금액 또는 payload, 발생할 효과를 넣는다. 승인되면 같은 turn에 실행하고 실제 결과를 확인한다.

단순 조회 요청을 임의로 구매/전송으로 확대하지 않는다. 사용자가 요청한 outcome 범위 안에서만 action-first로 동작한다.

## Hard boundaries

다음 경계는 돌쇠에서도 우회하지 않는다.

- 법률상 금지된 자동화
- 법원 입찰처럼 현장 방문이 필수인 행위
- CAPTCHA 또는 대기열 우회
- PASS/공동인증서/OTP 등 본인인증
- 전자서명 또는 사용자 본인의 법률·의료·세무 판단
- 공식 사이트가 제공하지 않는 action

이 경우 완료 기준은 “조회만 했다”가 아니라, 가능한 가장 가까운 합법적 공식 단계를 실행하고 사용자가 이어갈 정확한 화면·문서·입력값을 준비한 상태다.

## Generic fallback

돌쇠 capability가 없으면 기존 k-skill 호환성을 유지한다.

- declared environment variables
- host-provided secret vault
- `~/.config/k-skill/secrets.env` (`0600`)
- `k-skill-browser-runtime` provider chain
- typed stop reason과 manual handoff

generic runtime에서도 가능한 한 민감값의 채팅 평문 입력을 피하고 host가 제공하는 secure input을 우선한다.

## Maintainer checklist

- 모든 top-level `SKILL.md`의 portable block이 byte-for-byte 동일한가
- 새 credential skill이 Dolshoi에서 `request_vault_credential`로 복구 가능한가
- 새 browser skill이 CloakBrowser-first와 generic fallback을 모두 설명하는가
- action skill이 조회 결과를 실제 action으로 연결하는가
- 비가역 효과 직전에만 `clarify`가 위치하는가
- hard boundary를 무리하게 제거하지 않았는가

전체 스킬의 현재 분류는 [Runtime Action Audit](runtime-action-audit.md)에서 관리한다.
