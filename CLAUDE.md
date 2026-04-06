# k-skill

## Testing anti-patterns

- **Never write tests that assert `.changeset/*.md` files exist.** Changesets are consumed (deleted) by `changeset version` during the release flow. Any test guarding changeset file presence will break CI on the version-bump commit and block the release pipeline.

## Proxy server development

- 개발 repo: `/Users/jeffrey/Projects/k-skill` (이 디렉토리, `dev` 브랜치)
- 프로덕션 배포본: `~/.local/share/k-skill-proxy` (main 브랜치 단독 clone)
- **cron job** 이 매시 정각에 `origin/main` fetch → fast-forward pull → pm2 restart 실행
- 따라서 proxy route 변경은 **main에 merge되어야 프로덕션에 반영**된다. dev에서 코드를 바꿔도 프로덕션 proxy에는 영향 없음.
- 로컬 테스트는 `node packages/k-skill-proxy/src/server.js` 로 직접 실행하거나 `node --test packages/k-skill-proxy/test/server.test.js` 로 확인.
