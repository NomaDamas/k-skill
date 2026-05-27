# k-skill

## Testing anti-patterns

- **Never write tests that assert `.changeset/*.md` files exist.** Changesets are consumed (deleted) by `changeset version` during the release flow. Any test guarding changeset file presence will break CI on the version-bump commit and block the release pipeline.
- **Never write tests that pin a workspace package's `version` field** (in `package.json` or `package-lock.json`). `changeset version` bumps these on every release, so any hardcoded version assertion will fail the next release commit and block the npm publish pipeline. Stable invariants like `name`, `license`, `engines.node`, or workspace link metadata are fine to assert; the `version` is not.

## Crawling/search skill authoring

- 크롤링/검색 k-skill의 목표는 최종적으로 대상 사이트에 맞는 site-dependent 접근 방법을 스킬에 패키징하는 것이다.
- 다만 방법을 고정하기 전에 `insane-search`식 site-agnostic discovery를 먼저 수행한다: 공개 입구, 브라우저에서 보이는 데이터 흐름, RSS/sitemap/정적 JSON/모바일 페이지, 차단·빈 응답·로그인벽 실패 모드를 확인한다.
- 발견한 검색 URL, 필수 입력값, 결과 해석 규칙, fallback 순서, 실패 모드는 `SKILL.md`와 helper 코드에 명확히 남긴다. 자세한 체크리스트는 `docs/adding-a-skill.md`를 따른다.
- 새 크롤링 dependency는 기본값으로 추가하지 말고 기존 기능, 공개 endpoint, 좁은 proxy route로 해결 가능한지 먼저 확인한다.

## Proxy server development

- 개발 repo: 이 디렉토리, `dev` 브랜치
- 프로덕션 배포 대상: **Google Cloud Run** (project `k-skill-proxy`, region `asia-northeast1`, custom domain `k-skill-proxy.nomadamas.org`)
- `main` 브랜치에 merge되면 `.github/workflows/deploy-k-skill-proxy.yml`이 자동으로 Cloud Run 재배포를 수행한다. 인증은 Workload Identity Federation, 이미지 빌드 정의는 `packages/k-skill-proxy/Dockerfile`, 시크릿은 GCP Secret Manager에서 주입된다. WIF/Secret Manager 셋업은 `docs/deploy-k-skill-proxy.md` 참고.
- 따라서 proxy route 변경은 **main에 merge되어야 프로덕션에 반영**된다. dev에서 코드를 바꿔도 프로덕션 proxy에는 영향 없음.
- 로컬 테스트는 `node packages/k-skill-proxy/src/server.js` 로 직접 실행하거나 `node --test packages/k-skill-proxy/test/server.test.js` 로 확인.
- **Proxy 편입 규칙**: k-skill-proxy에 route를 추가하려면 upstream이 API 키를 필요로 해야 한다. 공개 엔드포인트(키 불필요)는 skill 코드에서 직접 호출하고 프록시를 거치지 않는다.
