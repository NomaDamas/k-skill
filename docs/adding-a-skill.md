# 새 스킬 추가 가이드

새 스킬을 k-skill에 추가하는 방법과 스킬이 동작하는 구조를 설명한다.

---

## 스킬이란

스킬은 AI 에이전트(Claude Code 등)가 특정 작업을 수행하는 방법을 정의한
문서+코드 묶음이다. 에이전트는 생성된 `SKILL.md` 어댑터를 통해
`@nomadamas/k-skill` CLI를 실행하고, CLI가 현재 런타임에 맞는 공통 profile과
스킬 고유 `instruction.md`를 조립해 출력한다.

스킬에는 네 가지 구현 유형이 있다.

| 유형 | 설명 | 예시 |
|------|------|------|
| **instruction 전용** | `instruction.md`의 명령만으로 동작 | `kakaotalk-mac`, `srt-booking` |
| **npm 패키지** | `packages/` 아래 Node.js 라이브러리로 구현 | `k-lotto`, `daiso-product-search` |
| **프록시 경유** | `k-skill-proxy`가 upstream API 키를 보관하고 HTTP로 중계 | `seoul-subway-arrival`, `fine-dust-location` |
| **Python 스크립트** | `scripts/`의 Python 파일 직접 실행 | `korean-spell-check`, `sillok-search` |

---

## 스킬의 구조

모든 스킬은 **저장소 루트에 디렉토리 하나**를 갖는다.

```
k-skill/
├── my-new-skill/          ← 스킬 디렉토리 (이름 = 스킬 이름)
│   ├── skill.json         ← 필수. frontmatter + profile 선언
│   ├── instruction.md     ← 필수. 사이트별 고유 workflow
│   ├── SKILL.md           ← 생성물. CLI adapter stub
│   ├── scripts/           ← 선택. helper
│   └── references/        ← 선택. 레퍼런스
├── packages/k-skill-cli/
│   ├── templates/         ← 공통 runtime/profile instruction
│   └── skills/            ← npm에 동봉되는 sync 결과
├── packages/              ← npm 패키지 유형일 때만
│   └── my-new-skill/
│       ├── package.json
│       ├── src/
│       └── test/
└── scripts/               ← Python 스크립트 유형일 때만
    └── my_new_skill.py
```

---

## skill.json 형식

`skill.json`이 frontmatter와 profile의 단일 원본이다.

```json
{
  "name": "my-new-skill",
  "description": "한 문장으로 이 스킬이 무엇을 하는지 설명한다.",
  "profiles": ["proxy", "lookup"],
  "frontmatter": "name: my-new-skill\ndescription: ...\nlicense: MIT\nmetadata:\n  category: utility\n  locale: ko-KR\n  phase: v1"
}
```

profile은 `docs/runtime-action-audit.md`와
`packages/k-skill-cli/src/assemble.js`의 목록을 따른다.

## instruction.md 형식

공통 vault/browser/proxy/action 규칙을 반복하지 않고 사이트별 내용만 작성한다.

```markdown
# My New Skill

## What this skill does

이 스킬이 무엇을 하는지 설명한다.

## When to use

- 사용 예시

## Workflow

사이트별 접근 경로와 실행 명령을 적는다.

## Done when

- 실제 완료 조건

## Failure modes

- 명시적 실패 모드
```

### skill.json 필드

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | ✅ | **디렉토리 이름과 정확히 일치**해야 한다 |
| `description` | ✅ | 에이전트 UI 표시용 한 줄 설명 |
| `profiles` | ✅ | 조립할 공통 capability/action profile 목록 |
| `frontmatter` | ✅ | 생성될 `SKILL.md`의 YAML frontmatter 원문 |

### 생성과 동기화

source를 수정한 뒤 반드시 실행한다.

```bash
npm run generate:skill-stubs
npm run sync:cli-skills
node scripts/generate-skill-stubs.js --check
node scripts/sync-cli-skills.js --check
```

`SKILL.md`와 `packages/k-skill-cli/skills/`는 생성/sync 결과이므로 직접 수정하지
않는다.

---

## 유형별 구현 방법

### A. instruction 전용 스킬

에이전트가 조립된 instruction 안의 bash/python 코드를 직접 실행한다.

1. 디렉토리 생성: `mkdir my-new-skill`
2. `my-new-skill/skill.json` 작성
3. `my-new-skill/instruction.md` 작성
4. stub 생성과 CLI bundle sync 실행

외부 라이브러리나 서버 없이 동작해야 한다.

### B. npm 패키지 스킬

`packages/my-new-skill/`에 Node.js 구현체를 만들고, 루트 디렉토리
`my-new-skill/instruction.md`에서 공개 CLI/API를 호출한다.

```
packages/my-new-skill/
├── package.json    # name, version, main, exports 필수
├── README.md
├── src/
│   └── index.js
└── test/
    └── index.test.js
```

`package.json`에 `"name": "my-new-skill"` 설정 후 루트 `package.json`의 `workspaces`에 등록한다.

npm에 배포하려면 `.changeset/` 파일을 추가한다 (`docs/releasing.md` 참고).

### C. 프록시 경유 스킬

upstream API 키를 사용자에게 노출하지 않으려면 `k-skill-proxy`를 경유한다.

1. `packages/k-skill-proxy/src/server.js`에 새 read-only route 추가
2. `instruction.md` Workflow에 `curl $KSKILL_PROXY_BASE_URL/v1/...` 형태로 호출 작성
3. upstream API 키는 gpu01의 production `.env`에 보관하고 systemd runtime에 주입한다

프록시 route 변경은 `main`에 merge되면 gpu01 cron을 통해 프로덕션에 자동 배포된다 (`AGENTS.md`, `docs/deploy-k-skill-proxy.md` 참고).

### D. Python 스크립트 스킬

스킬 디렉토리의 `scripts/my_skill.py`를 만들고 `instruction.md`에서 helper를
호출한다. `npm run sync:cli-skills`가 helper를 통합 CLI 패키지에도 동봉한다.

---

## 크롤링/검색 스킬을 만들 때: site-agnostic discovery 먼저

웹사이트를 조회하거나 크롤링하는 스킬의 최종 산출물은 결국 **그 사이트에 맞는 site-dependent 접근 방법**이다. 다만 처음부터 특정 화면 구조나 임시 우회법을 감으로 고정하지 않는다. 먼저 `insane-search`식 접근처럼 **사이트에 상관없이 반복 가능한 탐색 절차**를 적용해 대상 사이트에서 실제로 안정적인 경로를 찾아낸 뒤, 그 발견 결과를 해당 스킬의 site-dependent 지식으로 패키징한다.

적용 대상:

- 검색 결과/상세 페이지를 읽어야 하는 스킬
- 공식 API 문서가 없거나 불완전한 사이트
- PC 페이지, 모바일 페이지, RSS, sitemap, 정적 JSON, 공개 데이터 호출 등 여러 입구가 있을 수 있는 사이트
- 브라우저에서는 보이지만 단순 HTTP 요청에서는 빈 화면/차단/로그인 유도만 보이는 사이트

권장 절차:

1. **공개 입구부터 찾기**: 공식 API, 공개 JSON, RSS/Atom, sitemap, 검색 폼, 모바일 페이지, 정적 파일처럼 사이트가 공개적으로 제공하는 경로를 먼저 확인한다.
2. **브라우저 동작을 관찰하기**: 화면을 직접 긁기 전에 검색/상세 화면이 어떤 공개 데이터 요청을 통해 채워지는지 확인한다.
3. **안정적인 경로를 우선하기**: 화면 선택자보다 공개 데이터 호출, 문서화된 endpoint, RSS/sitemap처럼 구조가 덜 흔들리는 경로를 선호한다.
4. **차단과 빈 응답을 실패로 분리하기**: HTTP 성공만으로 완료로 보지 말고, 실제 결과 본문이 있는지 확인한다. 로그인벽, 봇 검사, 빈 껍데기 페이지는 별도 실패 모드로 적는다.
5. **site-dependent 방법을 명시적으로 패키징하기**: 탐색 과정에서 확인한 검색 URL, 필수 파라미터, 결과 해석 규칙, fallback 순서를 `SKILL.md`와 패키지 코드에 좁고 명확하게 기록한다.
6. **권한 경계를 지키기**: 돌쇠에서는 vault/CloakBrowser/`clarify` 계약을 이용해 지원되는 로그인·결제·제출을 수행한다. CAPTCHA, 본인인증, 전자서명, 법률상 제한, 사이트가 지원하지 않는 흐름은 우회하지 않는다.

`SKILL.md`에는 최소한 아래 내용을 남긴다.

- 어떤 공개 접근 경로를 선택했는지와 그 이유
- 검색/상세 조회의 입력값과 출력값
- 기본 경로가 실패했을 때의 fallback 순서
- 빈 결과, 차단, 로그인 필요, upstream 변경 등 실패 모드
- 시크릿/인증이 필요한지 여부와 저장소에 절대 넣지 않을 값

새 dependency는 기본값으로 추가하지 않는다. 기존 Node.js/Python 표준 기능, 이미 있는 패키지, 또는 `k-skill-proxy`의 좁은 allowlist route로 해결할 수 있는지 먼저 확인한다.

---

## 브라우저가 필요한 스킬: k-skill-browser-runtime

로그인된 브라우저 세션이나 렌더링 의존 화면이 필요한 스킬은 `k-skill-browser-runtime`을 기본 런타임으로 쓴다 ([브라우저 런타임 문서](browser-runtime.md) 참고).

1. **돌쇠에서는 CloakBrowser가 우선이다**: 내장 browser tool이 CloakBrowser를 제공하거나 `CLOAKBROWSER_PEEK_TOKEN`이 있으면 그 표면을 먼저 쓴다.
2. **portable fallback은 런타임을 선호한다**: 돌쇠가 아니거나 CloakBrowser를 사용할 수 없으면 인라인 CDP/Playwright 연결 로직을 새로 짜지 말고 런타임의 `connect()`/`runJob()`과 typed stop rule을 쓴다.
3. **semver 의존성**: `package.json`의 `dependencies`는 `"k-skill-browser-runtime": "^0.1.0"` 처럼 semver로 고정한다. `workspace:` 프로토콜은 npm publish를 깨뜨리므로 쓰지 않는다.
4. **typed stop rule 노출**: portable fallback은 인증·CAPTCHA·결제·전자서명·되돌릴 수 없는 제출 경계를 typed stop으로 노출한다. 돌쇠에서는 인증은 vault action으로 재개하고, 결제·최종 제출은 `clarify` 승인 후 재개하되 CAPTCHA·본인인증·전자서명은 우회하지 않는다.
5. **사이트별 로직은 스킬 안에**: navigation, selector, 파싱, fallback 순서와 실제 action path는 각 스킬의 `SKILL.md`와 패키지 코드에 좁고 명확하게 기록한다.
6. **공개/직접 HTTP 우선**: 브라우저 없이 잡히는 공개 endpoint(RSS/sitemap/공개 JSON/문서화된 API)를 조회에 먼저 쓰고, 계정 액션이 필요하면 같은 결과를 CloakBrowser/공식 브라우저 흐름으로 이어간다.

기본 환경변수: `KSKILL_BROWSER_PROVIDER`(기본 `auto` — macOS는 Aside → BrowserOS → Chrome CDP, 기타 플랫폼은 BrowserOS → Aside → Chrome CDP), `KSKILL_BROWSEROS_CDP_URL`(기본 `http://127.0.0.1:9100`), `KSKILL_CHROME_CDP_URL`(기본 `http://127.0.0.1:9222`), `KSKILL_ASIDE_COMMAND`(기본 `aside`). Aside는 공개 `aside repl` 표면만 쓰고 비공개 CDP/daemon port에 의존하지 않는다. CAPTCHA/로그인/결제/전자서명/되돌릴 수 없는 제출 자동화 우회는 하지 않는다.

---

## 스킬 등록 & 검증

스킬은 **별도 레지스트리 없이 디렉토리 스캔으로 자동 발견**된다.

추가 후 검증:

```bash
npm run ci
```

이 명령은 `scripts/validate-skills.sh`를 실행해 다음을 확인한다.

- 루트 하위 모든 디렉토리에 `SKILL.md`가 있는지
- frontmatter가 `---`로 시작하는지
- `name` 필드가 있는지
- `description` 필드가 있는지
- `name` 필드 값이 디렉토리 이름과 일치하는지

---

## 시크릿이 필요한 스킬

인증이 필요한 스킬은 `skill.json`에 `vault` profile을 선언한다. CLI가 현재
런타임에 맞는 credential instruction을 조립한다.

1. `DOLSHOI_ACTION_BROKER_URL` + `vault-run`이면 provisioned capability 사용
2. 돌쇠에서 capability가 없으면 `request_vault_credential`로 앱 vault 입력 UI 호출
3. 그 외 환경은 이미 주입된 환경변수 → 에이전트 vault → 개인 dotenv 순서
4. 아무것도 없으면 호스트가 제공하는 가장 안전한 입력 방식으로 받고 개인 vault/dotenv에 저장

시크릿 변수 이름 규칙: `KSKILL_<서비스명>_<항목>` (예: `KSKILL_SRT_ID`)

절대 하지 말 것:
- 시크릿을 저장소에 커밋
- 프록시 upstream 키를 클라이언트에 노출
- 사용자 확인 없이 side-effect가 있는 작업 실행

---

## 체크리스트

새 스킬을 PR 올리기 전에 확인한다.

- [ ] `my-new-skill/SKILL.md` 작성 완료
- [ ] 정확한 `## Runtime contract (required)` 블록을 원문 그대로 포함
- [ ] frontmatter `name`이 디렉토리 이름과 일치
- [ ] `npm run ci` 통과 (`./scripts/validate-skills.sh` 포함)
- [ ] npm 패키지라면 `packages/`에 구현체와 테스트 추가
- [ ] npm 패키지라면 `.changeset/*.md` 파일 추가 (반드시 **기능 PR에서**, Version Packages PR에서 추가하지 말 것)
- [ ] 프록시 경유라면 `k-skill-proxy/src/server.js`에 route 추가하고 gpu01 production `.env` 및 자동 배포 smoke 구성이 맞는지 확인
- [ ] 크롤링/검색 스킬이라면 공개 접근 경로, fallback 순서, 차단/로그인/빈 결과 실패 모드 문서화
- [ ] 시크릿이 있다면 `KSKILL_` 접두사 규칙 준수 및 `docs/setup.md` 업데이트
- [ ] `docs/features/my-new-skill.md` 작성 (선택, 상세 가이드)
- [ ] 브라우저가 필요한 스킬이라면 돌쇠 CloakBrowser 우선, `k-skill-browser-runtime` semver fallback, typed stop rule, 직접 HTTP 우선, `workspace:` 미사용 확인 ([브라우저 런타임 문서](browser-runtime.md))
- [ ] 액션 가능한 스킬이라면 돌쇠에서 조회 뒤 실제 액션 경로와 `clarify` 비가역 승인 경계를 문서화

---

## 관련 문서

- [공통 설정 가이드](setup.md) — 시크릿 설정 방법
- [릴리스와 자동 배포](releasing.md) — npm 패키지 배포 흐름
- [보안/시크릿 정책](security-and-secrets.md) — 인증 정보 취급 원칙
- [브라우저 런타임](browser-runtime.md) — BrowserOS CDP 런타임과 stop rule
- [돌쇠 런타임 계약](dolshoi-runtime.md) — vault, CloakBrowser, action, approval, fallback 계약
- [전체 런타임 액션 감사표](runtime-action-audit.md) — 122개 스킬의 action mode와 완료 목표
