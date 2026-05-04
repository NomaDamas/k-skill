# 기여 가이드

`k-skill`에 기여해주셔서 감사합니다. 이 문서는 **외부 기여자가 처음 PR을 올리기 전에 반드시 알아야 할 규칙**만 한국어로 정리한 입구 문서입니다. 세부 운영 절차는 각 섹션에서 기존 문서 링크로 연결합니다.

운영자/유지보수자용 상세 규칙은 [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md), [`docs/`](docs/) 아래 문서에 그대로 남아 있고, 이 가이드와 충돌이 생기면 `AGENTS.md`가 우선합니다.

---

## 1. 커뮤니케이션 언어

- 이슈, PR 본문, 리뷰 코멘트, 커밋 메시지 등 **저장소 내 모든 커뮤니케이션은 한국어**를 사용합니다.
- 코드 주석은 한국어/영어 어느 쪽이든 무방하지만, 사용자에게 노출되는 문서/스킬 텍스트는 한국어로 작성합니다.
- 대상 사용자가 한국어 화자임이 명확한 프로젝트이므로(`README.md` 참고), 외부 라이브러리 인용 등 불가피한 경우를 제외하고는 한국어로 통일합니다.

---

## 2. 브랜치/PR 규칙

- **외부 기여자의 PR은 반드시 `dev` 브랜치를 base로 합니다.** `main` 대상 PR은 운영자(`@vkehfdl1`)만 생성할 수 있습니다.
- 기능/문서 작업 브랜치는 `dev`에서 분기합니다. 브랜치 이름은 자유지만 의도가 드러나는 prefix(`feat/...`, `fix/...`, `docs/...`)를 권장합니다.
- PR 제목과 본문은 한국어로 작성합니다. 본문에는 **무엇을/왜/어떻게** 변경했는지를 짧게 요약하고, 관련 이슈가 있다면 `Fixes #123` 형태로 연결합니다.
- 리뷰 후 머지 전략은 운영자가 정합니다. 외부 기여자는 별도 요청이 없으면 머지하지 않습니다.

> 운영자가 main에 직접 push할 수 있는 경로(예: 자동화 스크립트, Version Packages PR 머지)도 있지만, 이는 운영자 권한 영역이며 외부 기여자는 항상 `dev`를 통과해야 합니다.

---

## 3. 이슈 작성 요령

- 새 스킬 제안, 버그 리포트, 문서 개선 모두 GitHub Issue로 시작합니다.
- 이슈 본문에는 다음을 포함하면 좋습니다.
  - 어떤 사용자 시나리오에서 필요한 기능/수정인가
  - 현재 어떤 동작인지(재현 절차, 로그)
  - 기대 동작
  - 참고 링크(공식 API 문서, 공개 페이지 등)
- 이슈 라벨/마일스톤은 운영자가 부여합니다. 기여자는 본문만 충실히 작성하면 충분합니다.

---

## 4. 새 스킬 추가 체크리스트

새 스킬을 추가할 때는 [`docs/adding-a-skill.md`](docs/adding-a-skill.md)의 절차를 따릅니다. 외부 기여자 입장에서 **반드시 함께 갱신해야 할 표면**은 다음과 같습니다.

- [ ] 루트에 스킬 디렉터리 생성 (`<skill-name>/SKILL.md` 필수, frontmatter `name`은 디렉터리명과 일치)
- [ ] [`README.md`](README.md)의 **"어떤 걸 할 수 있나" 표**에 한 줄 추가
- [ ] [`README.md`](README.md)의 **"포함된 기능"** 목록에 링크 추가
- [ ] 상세 문서가 있다면 [`docs/features/<skill-name>.md`](docs/features/) 작성
- [ ] npm 패키지 형태라면 [`packages/<skill-name>/`](packages/) 아래 구현체와 테스트 추가, 루트 `package.json`의 `workspaces`에 자동 포함되는지 확인
- [ ] 시크릿이 필요한 스킬이라면 [`docs/setup.md`](docs/setup.md), [`docs/security-and-secrets.md`](docs/security-and-secrets.md)에 환경변수 이름(`KSKILL_*` 접두사) 추가
- [ ] 크롤링/검색 스킬이라면 [`docs/adding-a-skill.md`](docs/adding-a-skill.md)의 site-agnostic discovery 절차에 따라 **공개 접근 경로 / fallback 순서 / 차단·로그인·빈 결과 실패 모드**를 `SKILL.md`와 helper 코드에 명시
- [ ] `npm run ci` 통과 (`scripts/validate-skills.sh`가 frontmatter 규칙과 디렉터리/스킬 이름 일치를 검사)

> ⚠️ 테스트를 작성할 때 주의: **`.changeset/*.md` 파일이 존재한다고 단정하는 테스트**나 **워크스페이스 패키지의 `version` 필드를 고정하는 테스트**는 절대 작성하지 마세요. Changesets가 릴리스 흐름에서 이 파일/필드를 자동으로 변경하므로, 해당 테스트는 다음 릴리스 커밋에서 CI를 깨뜨립니다. 자세한 내용은 [`AGENTS.md`](AGENTS.md)와 [`CLAUDE.md`](CLAUDE.md)의 "Testing anti-patterns" 섹션을 참고합니다.

---

## 5. npm 패키지 변경과 Changesets

- npm 패키지는 [`packages/*`](packages/) 아래 npm workspaces로 관리되고, 릴리스는 [Changesets](https://github.com/changesets/changesets)로 자동화됩니다.
- 패키지 동작/메타데이터를 바꿨다면 **PR에서 직접 `package.json`의 `version`을 수정하지 말고**, 같은 PR에 `.changeset/*.md`를 추가합니다.

```bash
npx changeset
```

- 위 명령으로 변경 종류(`patch` / `minor` / `major`)와 사용자 향 변경 노트를 한국어로 작성합니다.
- merge 후 자동 흐름은 다음과 같습니다([`docs/releasing.md`](docs/releasing.md) 참고).
  1. 기능 PR이 `dev` → `main`으로 흘러간 뒤, Changesets가 **Version Packages PR**을 자동 생성합니다.
  2. 운영자가 Version Packages PR을 머지하면 GitHub Actions(`.github/workflows/release-npm.yml`)가 npm publish를 실행합니다.
- **언제 changeset이 필요한가?**
  - 필요: `packages/*` 안의 코드, `package.json`의 사용자 향 메타데이터(`name`, `main`, `exports`, `bin`, `engines.node` 등) 변경
  - 불필요: 문서 전용 변경(예: 이 `CONTRIBUTING.md` 추가), 루트 `README.md`/`docs/**` 텍스트 수정, 워크스페이스 외부 스크립트 변경

판단이 어렵다면 PR 본문에 "changeset 필요 여부 검토" 항목을 적고 운영자 리뷰를 요청합니다.

---

## 6. Python 패키지 (현 상태)

- Python 패키지는 [`python-packages/*`](python-packages/) 위치에 두고 [release-please](https://github.com/googleapis/release-please-action)로 자동화하도록 설계되어 있습니다([`docs/releasing.md`](docs/releasing.md)).
- 다만 현재까지 실제 publish 대상이 되는 Python 패키지가 없어 [`.github/workflows/release-python.yml`](.github/workflows/release-python.yml)은 **scaffold-only** 상태입니다.
- 새 Python 패키지를 추가한다면 trusted publishing(OIDC)을 우선 검토하고, release-please가 `release_created=true`를 만든 run에서만 publish가 일어나도록 구성합니다. 장기 토큰 도입은 trusted publishing이 불가능한 경우에만 고려합니다.

---

## 7. 무료/유료 API와 `k-skill-proxy` 정책

새 외부 API를 호출하는 스킬을 만들 때는 다음 결정 트리를 따릅니다.

1. **API 키가 필요 없는 완전 공개 endpoint** → `k-skill-proxy`를 거치지 않고 사용자 머신에서 직접 호출합니다(예: `realtyprice.kr`).
2. **API 키가 필요하지만 일일 호출량 한도가 충분한 무료 API** → [`k-skill-proxy`](packages/k-skill-proxy/) 경유를 우선 검토합니다. 이렇게 하면 사용자가 직접 키를 발급할 필요가 없습니다(예: `data.go.kr`, KRX, NEIS, 도서관 정보나루, Naver Search Open API).
3. **유료 API** → `k-skill-proxy`를 통해서는 절대 중계하지 않습니다. 사용자가 직접 키를 발급해 [`docs/security-and-secrets.md`](docs/security-and-secrets.md)의 credential resolution order에 따라 보관/주입합니다.

`k-skill-proxy` 운영 원칙([`AGENTS.md`](AGENTS.md) "Free API proxy policy" 참고):

- 기본 자세는 **public read-only / 인증 없음**입니다. allowlist는 좁게 유지하고, route별 cache TTL과 rate limit을 적용합니다.
- 운영자 환경변수(`DATA_GO_KR_API_KEY`, `KRX_API_KEY`, `NEIS_*`, `OPINET_API_KEY` 등)는 `~/.config/k-skill/secrets.env`에만 두고 사용자 기본 secrets 파일에는 절대 넣지 않습니다.
- 새 route를 추가할 때는 도메인/요청 형식/실패 응답까지 좁게 검증하고, allowlist를 벗어나는 호출이 들어오면 거부합니다.

---

## 8. Proxy 코드 변경 흐름

- 개발은 항상 이 저장소의 `dev` 브랜치에서 진행합니다.
- 프로덕션 배포본은 운영자 머신의 `~/.local/share/k-skill-proxy`에 `main` 브랜치 단독 clone으로 존재하며, cron job이 매시 정각에 `origin/main`을 fast-forward pull → 필요 시 `npm ci` → `pm2 restart` 순서로 자동 배포합니다.
- 따라서 **dev에서 proxy route를 수정해도 main에 merge되기 전까지는 프로덕션 proxy에 반영되지 않습니다.** 운영자가 main에 merge한 직후 다음 정각에 자동 반영됩니다.
- 로컬에서 proxy route를 검증하려면 직접 실행합니다.

```bash
node packages/k-skill-proxy/src/server.js
node --test packages/k-skill-proxy/test/server.test.js
```

자세한 내용은 [`AGENTS.md`](AGENTS.md)의 "Proxy server development" 섹션과 [`packages/k-skill-proxy/README.md`](packages/k-skill-proxy/README.md), [`docs/features/k-skill-proxy.md`](docs/features/k-skill-proxy.md)를 참고합니다.

---

## 9. 시크릿/보안

- 사용자 머신의 기본 시크릿 저장 경로는 `~/.config/k-skill/secrets.env`(plain dotenv, 퍼미션 `0600`)입니다.
- 환경변수 이름은 `KSKILL_<서비스명>_<항목>` 규칙을 따릅니다(예: `KSKILL_SRT_ID`, `KSKILL_KTX_PASSWORD`).
- 절대 하지 말 것:
  - 실제 비밀값을 포함한 파일을 git에 커밋
  - 스킬 문서/예시 안에 실제 비밀번호 작성
  - 시크릿이 비어 있다는 이유로 비공식 우회 경로(다른 사이트, 비공식 API)를 자동 채택
- 시크릿이 비어 있으면 사용자에게 정확한 환경변수 이름을 알려주고 [`docs/security-and-secrets.md`](docs/security-and-secrets.md)의 credential resolution order에 따라 확보합니다.

---

## 10. 스킬 개발/테스트 시 홈 디렉터리 동기화 규칙

- 스킬을 로컬에서 시험할 때는 이 저장소의 스킬 디렉터리를 사용자 홈 디렉터리의 글로벌 스킬 위치에 동기화한 뒤 실행합니다.
  - Claude Code: `~/.claude/skills/<skill-name>`
  - 에이전트 호환: `~/.agents/skills/<skill-name>`
- `~/.agents/skills`가 심볼릭 링크 등 다른 경로로 indirection 되어 있다면 그 구조를 그대로 존중합니다.
- **저장소 안에 `.claude/` 또는 `.agents/` 디렉터리를 만들지 않습니다.** 사용자가 명시적으로 repo-local 테스트 픽스처를 요청한 경우만 예외입니다.

---

## 11. 로컬 검증

PR을 올리기 전 로컬에서 검증을 권장합니다.

```bash
npm install
npm run ci
```

`npm run ci`는 다음을 한 번에 실행합니다([`package.json`](package.json) `scripts.ci` 참고).

- `lint` — Node `--check` + Python `py_compile` + workspace lint + `scripts/validate-skills.sh`
- `typecheck` — `tsc --noEmit`
- `test` — Node `--test` + Python `unittest` + workspace test + `scripts/validate-skills.sh`
- `pack:dry-run` — 모든 npm publish 대상 워크스페이스에 대해 `npm pack --dry-run`

가벼운 문서 전용 변경이라면 `npm run lint` 만으로도 빠르게 회귀를 줄일 수 있습니다. 릴리스/패키지 메타데이터 변경이 포함되면 [`AGENTS.md`](AGENTS.md)의 "Verification rules" 규칙대로 `npm run ci`를 반드시 실행하고, 결과를 PR 본문에 남깁니다.

CI는 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)에서 모든 PR과 `main` push에 대해 동일한 명령을 실행합니다.

---

## 12. 행동 강령

이 저장소는 한국어 사용자를 위한 공개 스킬 모음입니다. 기여자는 다음을 지켜주세요.

- 사용자/다른 기여자에게 친절하게, 결정 사유를 설명하는 코멘트를 남깁니다.
- 사용자 시크릿/개인정보를 다루는 스킬은 보수적으로 설계합니다(자동 우회 금지, 항상 사용자 확인).
- 외부 사이트의 자동화 차단/약관 변경에 대한 책임은 해당 사이트에 있습니다. 우회를 위한 무리한 위장(예: 위조된 User-Agent로 차단을 뚫는 시도)은 하지 않습니다.

---

## 13. 관련 문서

- [README.md](README.md) — 전체 스킬 목록과 문서 링크
- [`docs/install.md`](docs/install.md) — 설치 방법
- [`docs/setup.md`](docs/setup.md) — 공통 설정과 credential resolution order
- [`docs/security-and-secrets.md`](docs/security-and-secrets.md) — 시크릿 정책과 표준 환경변수 이름
- [`docs/adding-a-skill.md`](docs/adding-a-skill.md) — 새 스킬 추가 절차와 체크리스트
- [`docs/releasing.md`](docs/releasing.md) — npm Changesets / Python release-please 운영 규칙
- [`docs/features/k-skill-proxy.md`](docs/features/k-skill-proxy.md) — 프록시 서버 사용법
- [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md) — 운영자/에이전트용 상세 규칙

기여 환영합니다. 막히는 부분이 있으면 이슈로 편하게 질문해주세요.
