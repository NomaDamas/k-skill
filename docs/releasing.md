# 릴리스와 자동 배포

이 저장소는 **npm은 Changesets**, **Python은 release-please**로 관리한다.

## Node / npm 패키지

- 위치: `packages/*`
- 버전 관리: Changesets
- 배포 workflow 파일: `.github/workflows/release-npm.yml`
- 실제 publish 시점: **Version Packages PR을 merge한 뒤 `main`에 push가 발생했을 때**
- 인증 방식: GitHub Actions가 repository secret `NPM_TOKEN` 으로 npm publish
- 기본 규칙: 패키지 버전을 직접 손으로 올리지 말고 `.changeset/*.md` 파일을 추가한다.

### 흐름

1. 기능 PR에서 `.changeset/*.md` 추가
2. PR merge
3. Changesets가 Version Packages PR 생성
4. Version Packages PR merge
5. GitHub Actions가 변경된 npm 패키지만 `NPM_TOKEN` 으로 publish
6. 패키지별 `CHANGELOG.md` 는 Changesets가 자동 관리하고, npm 패키지용 GitHub Release 는 계속 만들지 않는다 (`createGithubReleases: false` 유지)

## Python 패키지

- 위치: `python-packages/*`
- 버전 관리: release-please
- 배포 workflow 파일: `.github/workflows/release-python.yml`
- 실제 publish 시점: **release-please가 `release_created=true`를 만든 run**
- 현재 상태: 실제 Python 패키지가 없어 scaffold only

## npm token 운영 원칙

- npm publish 는 repository secret `NPM_TOKEN` 을 사용한다.
- `NPM_TOKEN` 은 **granular access token** 으로 만들고, 가능하면 Packages and scopes 를 `All Packages` + `Read and write` 로 설정해 앞으로 추가될 npm 패키지까지 같은 CI 토큰으로 publish 가능하게 한다.
- 계정에 2FA를 쓰는 경우, CI publish 를 위해 token 생성 시 npm publish 허용 설정을 함께 확인한다.
- 새 패키지를 자동 publish 하려면 token 소유 계정이 그 패키지명을 첫 publish 할 수 있어야 하고, 이후에도 해당 패키지의 maintainer 권한을 유지해야 한다.
- `id-token: write` 와 `NPM_CONFIG_PROVENANCE=true` 는 유지해서 token publish 에서도 provenance 생성을 시도한다.
- PyPI 쪽은 계속 trusted publishing 우선이며 workflow filename 은 `release-python.yml` 이다.

## Maintainer 확인 명령

```bash
npm install
npm run ci
```

## GitHub repository secret

GitHub repository settings 에 아래 secret 을 저장해야 한다.

- `NPM_TOKEN`: npm granular access token with publish/write permission for this repo's public packages
