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

## Development skill install rules

- When testing or developing skills from this repository, install or sync the current skill directories into the user's home-directory global skill locations first.
- Use `~/.claude/skills/<skill-name>` for Claude Code and `~/.agents/skills/<skill-name>` for agents-compatible home installs.
- Respect existing home-directory indirection such as symlinks when syncing `~/.agents/skills`.
- Do **not** create repo-local `.claude` or `.agents` directories for skill installation unless the user explicitly asks for a repository-local test fixture.

## Free API proxy policy

- The built-in `k-skill-proxy` is for **free APIs only**.
- Default posture: public read-only endpoint, **no proxy auth by default**.
- Keep free-API proxy surfaces narrow, allowlisted, cache-backed, and rate-limited.
- If abuse or operational issues appear later, add stricter controls then instead of preemptively requiring auth.

## Proxy server development

- 개발 repo (`dev` 브랜치)에서 proxy 코드를 수정하고, main에 merge하면 프로덕션에 반영된다.
- 프로덕션 배포본은 `~/.local/share/k-skill-proxy`에 main 브랜치 단독 clone으로 존재한다.
- cron job (`0 * * * *`)이 매시 정각에 `~/.local/share/k-skill-proxy/scripts/auto-update-proxy.sh`를 실행해 origin/main fetch → fast-forward pull → package-lock 변경 시 npm ci → pm2 restart 순서로 자동 배포한다.
- 로그: `/tmp/k-skill-proxy-update.log`
- proxy 서버 코드: `packages/k-skill-proxy/src/server.js`
- proxy 서버 테스트: `packages/k-skill-proxy/test/server.test.js`
- proxy 환경변수(API key 등)는 `~/.config/k-skill/secrets.env`에 넣고, `scripts/run-k-skill-proxy.sh`가 source한다.
- **dev에서 route를 추가/수정한 뒤 main에 merge되기 전까지는 프로덕션 proxy에 반영되지 않는다.** 로컬 테스트는 `node packages/k-skill-proxy/src/server.js`로 직접 실행한다.
