# k-skill repository instructions

This repository inherits the broader oh-my-codex guidance from the parent environment.
These rules are repo-specific and apply to everything under this directory.

## Release automation rules

- Node packages live under `packages/*` and use npm workspaces.
- Node package releases use **Changesets**. Do not hand-edit package versions only to cut a release; add a `.changeset/*.md` file instead.
- npm publish is automated from GitHub Actions and should happen only after the bot-generated **Version Packages** PR is merged into `main`.
- Python packages live under `python-packages/*` and use **release-please**. Until a real Python package exists, keep the Python release workflow as scaffold-only.
- PyPI publish should run only when release-please reports `release_created=true` for a concrete package path.
- Prefer trusted publishing via OIDC for npm and PyPI. Do not introduce long-lived registry tokens unless trusted publishing is unavailable.

## Verification rules

- For release or packaging changes, run `npm run ci`.
- Keep release docs, workflow files, and package metadata aligned in the same change.

## Testing anti-patterns

- **Never write tests that assert `.changeset/*.md` files exist.** Changesets are consumed (deleted) by `changeset version` during the release flow. Any test guarding changeset file presence will break CI on the version-bump commit and block the release pipeline.
- **Never write tests that pin a workspace package's `version` field** (in `package.json` or `package-lock.json`). `changeset version` bumps these on every release, so any hardcoded version assertion will fail the next release commit and block the npm publish pipeline. Stable invariants like `name`, `license`, `engines.node`, or workspace link metadata are fine to assert; the `version` is not.

## Development skill install rules

- When testing or developing skills from this repository, install or sync the current skill directories into the user's home-directory global skill locations first.
- Use `~/.claude/skills/<skill-name>` for Claude Code and `~/.agents/skills/<skill-name>` for agents-compatible home installs.
- Respect existing home-directory indirection such as symlinks when syncing `~/.agents/skills`.
- Do **not** create repo-local `.claude` or `.agents` directories for skill installation unless the user explicitly asks for a repository-local test fixture.

## Crawling/search skill authoring

- For any k-skill that crawls or searches a website, the expected output is a site-dependent recipe packaged into that skill.
- Before fixing that recipe, use an insane-search-style, site-agnostic discovery pass: identify public entry points, observe browser-visible data flows when needed, prefer stable public/data endpoints over brittle screen scraping, and classify login/CAPTCHA/empty/blocked responses as explicit failure modes.
- Record the discovered site-dependent access path, fallback order, inputs/outputs, and failure modes in `SKILL.md` and any helper package code. See `docs/adding-a-skill.md` for the canonical checklist.
- Do not add crawling dependencies by default; first prefer existing runtime capabilities, public endpoints, or narrow allowlisted proxy routes.

## Free API proxy policy

- The built-in `k-skill-proxy` is for **free APIs only**.
- **k-skill-proxy inclusion rule**: A skill should be served through `k-skill-proxy` **only when the upstream requires an API key** (e.g., data.go.kr, KRX, Naver Search Open API, NEIS, Data4Library). Fully public endpoints that work without any authentication (e.g., realtyprice.kr) should be called directly from the user's machine, not routed through the proxy.
- Default posture: public read-only endpoint, **no proxy auth by default**.
- Keep free-API proxy surfaces narrow, allowlisted, cache-backed, and rate-limited.
- If abuse or operational issues appear later, add stricter controls then instead of preemptively requiring auth.

## Proxy server development

- 개발 repo (`dev` 브랜치)에서 proxy 코드를 수정하고, main에 merge하면 프로덕션에 반영된다.
- 프로덕션 배포 대상은 **Google Cloud Run** (`asia-northeast1`, GCP project `k-skill-proxy`)이며, 커스텀 도메인 `k-skill-proxy.nomadamas.org`로 노출된다.
- `main` 브랜치에 merge되면 `.github/workflows/deploy-k-skill-proxy.yml`이 Workload Identity Federation으로 GCP 인증 → Artifact Registry로 image build/push → Cloud Run 재배포 → `/health` smoke test까지 자동으로 수행한다.
- 따라서 **dev에서 route를 추가/수정한 뒤 main에 merge되기 전까지는 프로덕션 proxy에 반영되지 않는다.**
- proxy 서버 코드: `packages/k-skill-proxy/src/server.js`
- 컨테이너 이미지 빌드 정의: `packages/k-skill-proxy/Dockerfile`
- proxy 서버 테스트: `packages/k-skill-proxy/test/server.test.js`
- 로컬 테스트: `node packages/k-skill-proxy/src/server.js` (환경변수는 `~/.config/k-skill/secrets.env` 등에서 직접 export해서 띄운다)
- 프로덕션 시크릿은 GCP Secret Manager에 보관되고 Cloud Run runtime에 주입된다.
- **운영 관련 모든 절차는 [`docs/deploy-k-skill-proxy.md`](docs/deploy-k-skill-proxy.md)에 정리되어 있다.** 새 maintainer 인계를 위한 1회성 GCP/WIF 셋업, GitHub repository secrets 등록, upstream API 키 회전(rotation), 자동 배포 상태/로그/이미지 태그 확인, Cloud Run 트래픽 롤백, GitHub Actions 장애 시 로컬에서 동일한 배포를 수동으로 돌리는 비상 명령까지 전부 거기서 본다. proxy 운영 관련 어떤 질문이 들어와도 먼저 그 문서를 확인한다.
