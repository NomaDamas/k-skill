# 기여 가이드

외부 기여자는 이 문서를 기준으로 이슈, PR, 스킬, 패키지, 프록시 변경을 준비해 주세요. 이 레포의 세부 운영 규칙은 `AGENTS.md`와 `CLAUDE.md`에도 있으며, 충돌할 때는 더 구체적인 최신 지침을 우선합니다.

## 소통 언어

- PR 코멘트, 이슈, 리뷰 등 모든 소통은 한국어로 진행합니다.
- 외부 문서나 로그를 인용해야 할 때는 원문을 함께 둘 수 있지만, 결정 사항과 요청 사항은 한국어로 요약해 주세요.

## 브랜치와 PR 대상

- 기능/수정 브랜치는 가능한 한 `feature/<issue-number>` 또는 `feature/#<issue-number>`처럼 추적 가능한 이름을 사용합니다.
- PR의 대상 브랜치는 반드시 `dev` 브랜치여야 합니다.
- `main` 브랜치로 PR을 만들 수 있는 사람은 `@vkehfdl1`뿐입니다. 그 외 기여자는 `main` 대상 PR을 만들지 않습니다.
- 프록시 서버 변경도 개발 레포의 `dev` 브랜치에서 작업하고, `main`에 머지된 뒤에만 프로덕션에 반영됩니다.

## 스킬 추가 또는 변경

스킬을 추가하거나 변경할 때는 관련 기능 문서와 `README.md`의 표를 포함해 코드와 문서를 함께 갱신합니다.

- 관련 기능 문서(`docs/features/<skill-name>.md`)를 추가하거나 업데이트합니다.
- `README.md`의 "어떤 걸 할 수 있나" 표에 스킬 이름, 설명, 사용자 로그인 필요 여부, 문서 링크를 업데이트합니다.
- 설치 흐름이 바뀌면 `docs/install.md`, `docs/setup.md`, `docs/security-and-secrets.md` 등 관련 문서도 함께 맞춥니다.
- 출처나 공식 표면이 바뀌면 `docs/sources.md`에 반영합니다.
- 스킬 개발/테스트 시에는 현재 스킬 디렉터리를 먼저 홈 디렉터리 전역 스킬 위치에 동기화합니다.
  - Claude Code: `~/.claude/skills/<skill-name>`
  - agents 호환 런타임: `~/.agents/skills/<skill-name>`
- `~/.agents/skills`가 symlink 등으로 우회되어 있으면 기존 indirection을 존중합니다.
- 사용자가 명시적으로 요청하지 않는 한 레포 내부에 `.claude` 또는 `.agents` 설치 테스트 디렉터리를 만들지 않습니다.

## npm 패키지와 릴리스

- Node 패키지는 `packages/*` 아래 npm workspaces로 관리합니다.
- npm 패키지를 수정할 때는 Changesets를 조사하고, 자동 CD가 올바르게 트리거되도록 `.changeset/*.md` 변경이 필요한지 신중히 판단합니다.
- 패키지 릴리스 목적의 버전 변경은 `package.json`만 직접 수정하지 말고 Changesets 흐름을 사용합니다.
- npm publish는 GitHub Actions가 생성하는 **Version Packages** PR이 `main`에 머지된 뒤 자동으로 수행되는 것을 전제로 합니다.
- Changeset 파일의 존재 여부를 테스트로 검증하지 않는다. Changesets는 `changeset version` 단계에서 소비되어 삭제될 수 있으므로, 그런 테스트는 버전 bump 커밋의 CI를 막습니다.
- `package.json`과 `package-lock.json`의 `version` 필드를 테스트에서 고정하지 않는다. Changesets 릴리스 흐름에서 매번 바뀔 수 있으므로, 테스트는 `name`, `license`, `engines.node`, workspace link metadata처럼 안정적인 invariant를 검증합니다.
- 현재 구현이 registry token 기반인 경우에도 신규 또는 재설계 흐름은 trusted publishing/OIDC를 우선합니다. 기존 token 기반 경로를 고칠 때는 현재 구현 예외와 목표 원칙을 PR 설명에 분리해 적습니다.

## Python 패키지와 PyPI

- Python 패키지는 `python-packages/*` 아래에 둡니다.
- Python 릴리스는 release-please 기반입니다.
- 실제 Python 패키지가 생기기 전까지 Python release workflow는 scaffold-only로 유지합니다.
- PyPI publish는 release-please가 구체적인 패키지 경로에 대해 `release_created=true`를 보고할 때만 실행되도록 설계합니다.
- PyPI도 가능하면 trusted publishing/OIDC를 우선합니다.

## API와 k-skill-proxy 정책

- `k-skill-proxy`는 무료 API 전용입니다.
- 신규 proxy route는 upstream이 API key를 요구하는 무료 API인 경우에만 `k-skill-proxy` 경유를 검토합니다. 기존 승인 예외를 넓히려면 근거와 운영 경계를 문서화합니다.
- 인증 없이 동작하는 공개 read-only endpoint는 기본적으로 사용자 머신에서 직접 호출하고, 불필요하게 프록시 운영 표면을 넓히지 않습니다.
- 유료 API, 사용자별 과금 API, 개인 계정 권한이 필요한 API는 `k-skill-proxy`를 타지 않도록 설계합니다.
- 기본 자세는 공개 read-only endpoint, proxy auth 없음입니다.
- 프록시 표면은 좁게 유지하고 allowlist, cache, rate limit를 적용합니다.
- 남용이나 운영 문제가 실제로 나타나면 그때 더 강한 제어를 추가합니다.

## 프록시 서버 개발과 배포

- 프록시 서버 코드: `packages/k-skill-proxy/src/server.js`
- 프록시 서버 테스트: `packages/k-skill-proxy/test/server.test.js`
- 컨테이너 이미지 정의: `packages/k-skill-proxy/Dockerfile`
- 로컬 테스트: 필요한 upstream 환경변수를 export한 상태에서 `node packages/k-skill-proxy/src/server.js`. 로컬에서 시크릿을 모아두는 표준 위치는 `~/.config/k-skill/secrets.env` 입니다.
- 프로덕션 프록시는 **Google Cloud Run** (project `k-skill-proxy`, region `asia-northeast1`)에서 운영하며 `k-skill-proxy.nomadamas.org` 도메인에 매핑되어 있습니다.
- `main` 브랜치에 머지되면 `.github/workflows/deploy-k-skill-proxy.yml` 워크플로가 Workload Identity Federation으로 GCP 인증 → Artifact Registry로 이미지 빌드/푸시 → Cloud Run 재배포 → `/health` smoke test까지 자동 수행합니다.
- 프로덕션 시크릿은 GCP Secret Manager에 보관되고 Cloud Run 런타임에 주입됩니다. 프록시 운영자(maintainer)가 한 번 수행해야 하는 WIF/Secret Manager 셋업과 운영 점검 절차는 [`docs/deploy-k-skill-proxy.md`](docs/deploy-k-skill-proxy.md)에 정리되어 있습니다.
- `dev`에서 route를 추가하거나 수정해도 `main`에 머지되기 전까지는 프로덕션 프록시에 반영되지 않습니다.

## 검증

- 문서만 바꿔도 관련 문서 테스트를 먼저 추가하거나 업데이트하고, 실패를 확인한 뒤 구현하는 TDD 흐름을 권장합니다.
- 일반 변경은 가능한 한 `npm run lint`, `npm run typecheck`, `npm test`를 실행합니다.
- 릴리스나 패키징 관련 변경은 `npm run ci`를 실행합니다.
- 변경 범위가 작더라도 최종 보고에는 어떤 명령을 실행했고 어떤 결과가 나왔는지 적습니다.
- 테스트를 통과시키기 위해 기존 테스트를 삭제하거나 범위를 부당하게 줄이지 않습니다.
