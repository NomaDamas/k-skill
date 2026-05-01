# 새 스킬 추가 가이드

새 스킬을 k-skill에 추가하는 방법과 스킬이 동작하는 구조를 설명한다.

---

## 스킬이란

스킬은 AI 에이전트(Claude Code 등)가 특정 작업을 수행하는 방법을 정의한 문서+코드 묶음이다. 에이전트는 `SKILL.md`를 읽고 거기 적힌 워크플로우를 따라 실행한다.

스킬에는 네 가지 구현 유형이 있다.

| 유형 | 설명 | 예시 |
|------|------|------|
| **SKILL.md 전용** | 문서만으로 동작 (에이전트가 bash/python 직접 실행) | `kakaotalk-mac`, `srt-booking` |
| **npm 패키지** | `packages/` 아래 Node.js 라이브러리로 구현 | `k-lotto`, `blue-ribbon-nearby` |
| **프록시 경유** | `k-skill-proxy`가 upstream API 키를 보관하고 HTTP로 중계 | `seoul-subway-arrival`, `fine-dust-location` |
| **Python 스크립트** | `scripts/`의 Python 파일 직접 실행 | `korean-spell-check`, `sillok-search` |

---

## 스킬의 구조

모든 스킬은 **저장소 루트에 디렉토리 하나**를 갖는다.

```
k-skill/
├── my-new-skill/          ← 스킬 디렉토리 (이름 = 스킬 이름)
│   ├── SKILL.md           ← 필수. 에이전트가 읽는 핵심 파일
│   └── (지원 파일들)       ← 선택. 스크립트, 데이터 등
├── packages/              ← npm 패키지 유형일 때만
│   └── my-new-skill/
│       ├── package.json
│       ├── src/
│       └── test/
└── scripts/               ← Python 스크립트 유형일 때만
    └── my_new_skill.py
```

---

## SKILL.md 형식

`SKILL.md`는 YAML frontmatter + Markdown 본문으로 구성된다.

```markdown
---
name: my-new-skill
description: 한 문장으로 이 스킬이 무엇을 하는지 설명한다. 에이전트 UI에 표시된다.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# My New Skill

## What this skill does

이 스킬이 무엇을 하는지 한두 문단으로 설명한다.

## When to use

- "사용자가 이런 말을 할 때"
- "또는 이런 상황일 때"

## Prerequisites

- Node.js 18+ (필요하면)
- 패키지 설치 명령

## Workflow

### 1. 첫 번째 단계

설명과 실행할 코드를 적는다.

```bash
# 실행할 명령어
```

### 2. 두 번째 단계

...

## Done when

- 이런 조건이 만족되면 완료다

## Failure modes

- 예상 가능한 실패 상황

## Notes

- 특이사항, 보안 정책 등
```

### frontmatter 필드

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | ✅ | **디렉토리 이름과 정확히 일치**해야 한다 |
| `description` | ✅ | 에이전트 UI 표시용 한 줄 설명 |
| `license` | ✅ | 항상 `MIT` |
| `metadata.category` | ✅ | `utility` / `transit` / `travel` / `messaging` / `legal` / `setup` 등 |
| `metadata.locale` | ✅ | `ko-KR` |
| `metadata.phase` | ✅ | `v1` (안정) / `v1.5` (기능 추가 중) |

---

## 유형별 구현 방법

### A. SKILL.md 전용 스킬

에이전트가 `SKILL.md` 안의 bash/python 코드를 직접 실행한다.

1. 디렉토리 생성: `mkdir my-new-skill`
2. `my-new-skill/SKILL.md` 작성
3. Workflow 섹션에 에이전트가 따를 단계별 명령어를 적는다

외부 라이브러리나 서버 없이 동작해야 한다.

### B. npm 패키지 스킬

`packages/my-new-skill/`에 Node.js 구현체를 만들고, 루트 디렉토리 `my-new-skill/SKILL.md`에서 `require('my-new-skill')`로 호출한다.

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

1. `packages/k-skill-proxy/src/server.js`에 새 route 추가
2. `SKILL.md` Workflow에 `curl $KSKILL_PROXY_BASE_URL/v1/...` 형태로 호출 작성
3. upstream API 키는 서버의 `~/.config/k-skill/secrets.env`에만 보관

프록시 서버는 main 브랜치에 merge되어야 프로덕션에 반영된다 (`CLAUDE.md` 참고).

### D. Python 스크립트 스킬

`scripts/my_skill.py`를 만들고 `SKILL.md`에서 `python3 scripts/my_skill.py`로 호출한다.

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
6. **권한 경계를 지키기**: 인증, 결제, CAPTCHA, 약관상 제한이 필요한 경로는 자동화하지 말고 사용자 개입 또는 실패 모드로 처리한다.

`SKILL.md`에는 최소한 아래 내용을 남긴다.

- 어떤 공개 접근 경로를 선택했는지와 그 이유
- 검색/상세 조회의 입력값과 출력값
- 기본 경로가 실패했을 때의 fallback 순서
- 빈 결과, 차단, 로그인 필요, upstream 변경 등 실패 모드
- 시크릿/인증이 필요한지 여부와 저장소에 절대 넣지 않을 값

새 dependency는 기본값으로 추가하지 않는다. 기존 Node.js/Python 표준 기능, 이미 있는 패키지, 또는 `k-skill-proxy`의 좁은 allowlist route로 해결할 수 있는지 먼저 확인한다.

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

인증이 필요한 스킬은 아래 우선순위로 credential을 확보한다.

1. 이미 환경변수에 있으면 → 그대로 사용
2. 에이전트 vault(1Password, Bitwarden, macOS Keychain) → 주입
3. `~/.config/k-skill/secrets.env` → 파일에서 읽기
4. 아무것도 없으면 → 사용자에게 물어보고 3번에 저장

시크릿 변수 이름 규칙: `KSKILL_<서비스명>_<항목>` (예: `KSKILL_SRT_ID`)

절대 하지 말 것:
- 시크릿을 저장소에 커밋
- 프록시 upstream 키를 클라이언트에 노출
- 사용자 확인 없이 side-effect가 있는 작업 실행

---

## 체크리스트

새 스킬을 PR 올리기 전에 확인한다.

- [ ] `my-new-skill/SKILL.md` 작성 완료
- [ ] frontmatter `name`이 디렉토리 이름과 일치
- [ ] `npm run ci` 통과 (`./scripts/validate-skills.sh` 포함)
- [ ] npm 패키지라면 `packages/`에 구현체와 테스트 추가
- [ ] npm 패키지라면 `.changeset/*.md` 파일 추가 (반드시 **기능 PR에서**, Version Packages PR에서 추가하지 말 것)
- [ ] 프록시 경유라면 `k-skill-proxy/src/server.js`에 route 추가하고 main에 merge
- [ ] 크롤링/검색 스킬이라면 공개 접근 경로, fallback 순서, 차단/로그인/빈 결과 실패 모드 문서화
- [ ] 시크릿이 있다면 `KSKILL_` 접두사 규칙 준수 및 `docs/setup.md` 업데이트
- [ ] `docs/features/my-new-skill.md` 작성 (선택, 상세 가이드)

---

## 관련 문서

- [공통 설정 가이드](setup.md) — 시크릿 설정 방법
- [릴리스와 자동 배포](releasing.md) — npm 패키지 배포 흐름
- [보안/시크릿 정책](security-and-secrets.md) — 인증 정보 취급 원칙
