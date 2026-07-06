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

## Browser runtime skill authoring

- For new or changed Node skills that need a logged-in browser session, rendered-page automation, or CDP browser fallback, use `k-skill-browser-runtime` as the default browser runtime instead of writing ad hoc CDP or Playwright connection code.
- The default provider is `auto`: attach to a user-launched BrowserOS GUI session first (`KSKILL_BROWSEROS_CDP_URL`, default `http://127.0.0.1:9100`), then fall back to a user-launched Chrome/Chromium CDP session (`KSKILL_CHROME_CDP_URL`, default `http://127.0.0.1:9222`). `KSKILL_BROWSER_PROVIDER` may pin `auto`, `browseros`, or `chrome-cdp`.
- BrowserOS is CDP-only attach. Skills must not launch BrowserOS, pass headless flags to BrowserOS, close the user browser/profile, solve login/CAPTCHA/payment/e-signature flows, or automate irreversible submission. Disconnect automation clients and clean up only pages/contexts the skill created.
- Package dependencies must use publishable semver such as `"k-skill-browser-runtime": "^0.1.0"`; do not use `workspace:` for publishable packages.
- Keep site-specific navigation, selectors, parsing, fallback order, and typed stop/failure modes in the skill's `SKILL.md` and helper package code. Prefer public/direct HTTP endpoints before browser automation when they are stable and do not require authentication.

## Free API proxy policy

- The built-in `k-skill-proxy` is for **free APIs only**.
- **k-skill-proxy inclusion rule**: A skill should be served through `k-skill-proxy` **only when the upstream requires an API key** (e.g., data.go.kr, KRX, Naver Search Open API, NEIS, Data4Library). Fully public endpoints that work without any authentication (e.g., realtyprice.kr) should be called directly from the user's machine, not routed through the proxy.
- Default posture: public read-only endpoint, **no proxy auth by default**.
- Keep free-API proxy surfaces narrow, allowlisted, cache-backed, and rate-limited.
- If abuse or operational issues appear later, add stricter controls then instead of preemptively requiring auth.

## Proxy server development

- 개발 repo (`dev` 브랜치)에서 proxy 코드를 수정한다. `main` merge 자체는 프로덕션 배포나 승격을 의미하지 않는다.
- 공개 문서에는 production host 이름, serving runtime, tunnel/reverse-proxy 구조, 서버 파일 경로, 배포 트리거, rollback 절차를 기록하지 않는다.
- 운영자 전용 serving runbook은 repo 밖 private 위치에 보관하고, public PR/issue/comment에는 해당 내용을 붙이지 않는다.
- public smoke test는 hosted base URL의 `/health`와 대표 read-only route까지만 언급한다. 내부 serving 경로는 공개하지 않는다.
- proxy 코드·빌드·테스트는 repo 내부 개발 파일에서 다루되, public 문서에 운영 serving 경로·시크릿 경로·배포 구조를 추가하지 않는다.
- 로컬 검증은 개발자 개인 환경에서 수행하고, public 문서에는 운영 경로·서버 경로·시크릿 위치를 남기지 않는다.
- 프로덕션 시크릿은 repo/GitHub Actions/public docs에 저장하지 않는다. 런타임·터널·프로세스 권한은 production secret 접근 권한과 동일하게 취급한다.
- proxy 운영 관련 질문이 들어오면 public repo 문서가 아니라 maintainer의 private runbook을 확인한다.
