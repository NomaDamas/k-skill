# k-skill-proxy 배포 가이드 (Cloud Run + GitHub Actions)

`k-skill-proxy`는 Google Cloud Run에서 운영되고, `main` 브랜치에 머지되면 GitHub Actions가 자동으로 재배포합니다.

이 문서는 그 자동 배포 파이프라인의 **1회성 셋업 절차**와 **운영 점검 절차**를 정리합니다. 일반 contributor는 읽지 않아도 되며, 프록시 운영을 담당하는 maintainer(현재 `jeffrey@markr.ai`)가 인프라를 처음 만들거나 수리할 때 참고합니다.

## 운영 사실

| 항목 | 값 |
| --- | --- |
| GCP project ID | `k-skill-proxy` |
| Region | `asia-northeast1` (도쿄) |
| Cloud Run service | `k-skill-proxy` |
| Artifact Registry repo | `asia-northeast1-docker.pkg.dev/k-skill-proxy/k-skill` |
| 공개 도메인 | `https://k-skill-proxy.nomadamas.org` (Cloud Run domain mapping) |
| 컨테이너 이미지 정의 | `packages/k-skill-proxy/Dockerfile` |
| 워크플로 | `.github/workflows/deploy-k-skill-proxy.yml` |
| 인증 | Workload Identity Federation (long-lived JSON key 없음) |
| 시크릿 저장소 | GCP Secret Manager (이름 = 환경변수 이름) |

## 배포 흐름

1. `dev` 브랜치에서 작업, PR을 `dev`에 보낸다.
2. `dev` → `main` 머지 PR이 `@vkehfdl1`에 의해 머지된다.
3. `main` push가 `.github/workflows/deploy-k-skill-proxy.yml`을 트리거한다.
4. 워크플로가:
   - WIF로 `${GCP_DEPLOY_SERVICE_ACCOUNT}`로 impersonate
   - `packages/k-skill-proxy/Dockerfile`로 컨테이너 빌드
   - Artifact Registry에 `:${GITHUB_SHA}` 태그로 push
   - Cloud Run `k-skill-proxy` 서비스를 새 이미지로 재배포 (Secret Manager 시크릿 + 런타임 env 주입)
   - 새 revision의 `*.run.app` URL과 `https://k-skill-proxy.nomadamas.org/health`에 smoke test
5. 실패 시 GitHub Actions 페이지에서 로그 확인. Cloud Run 자체는 마지막 healthy revision에 트래픽을 유지한다.

## 1회성 GCP 셋업

> 이미 한 번 셋업되어 있다면 다시 실행할 필요 없음. 새 maintainer가 인계받거나 SA를 새로 만들 때만 사용.

```bash
export PROJECT_ID="k-skill-proxy"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export GH_REPO="NomaDamas/k-skill"          # owner/repo
export POOL_ID="github-actions-pool"
export PROVIDER_ID="github-actions-provider"
export DEPLOY_SA="k-skill-proxy-deploy"
export DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 1) 필요한 API 활성화

```bash
gcloud services enable \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"
```

### 2) Workload Identity Pool + GitHub OIDC provider

```bash
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository == '${GH_REPO}'"
```

> `attribute-condition`은 토큰 발급 단계에서 우리 저장소만 허용해 풀 자체를 좁힙니다. 임의의 다른 repo가 같은 풀을 통해 SA를 impersonate하지 못하게 막는 핵심 가드입니다.

### 3) Deploy service account 생성

```bash
gcloud iam service-accounts create "$DEPLOY_SA" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions k-skill-proxy deployer"
```

### 4) 풀 → service account impersonation 허용

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GH_REPO}"
```

### 5) deploy SA에 필요한 권한 부여

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role=roles/run.admin

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role=roles/artifactregistry.writer

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role=roles/iam.serviceAccountUser
```

`iam.serviceAccountUser`는 Cloud Run의 런타임 service account(`${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`)를 deploy SA가 대신 지정할 수 있게 하기 위함입니다.

### 6) Cloud Run 런타임 SA에 Secret Manager accessor 부여

```bash
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in \
  AIR_KOREA_OPEN_API_KEY KMA_OPEN_API_KEY SEOUL_OPEN_API_KEY HRFCO_OPEN_API_KEY \
  OPINET_API_KEY DATA_GO_KR_API_KEY KEDU_INFO_KEY \
  DATA4LIBRARY_AUTH_KEY FOODSAFETYKOREA_API_KEY KAKAO_REST_API_KEY KRX_API_KEY \
  KOSIS_API_KEY NAVER_SEARCH_CLIENT_ID NAVER_SEARCH_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding "$s" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor \
    --condition=None >/dev/null
done
```

### 7) WIF provider 리소스 이름 확인

```bash
gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --format='value(name)'
# 예: projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider
```

이 값과 `${DEPLOY_SA_EMAIL}`을 GitHub에 등록합니다.

## GitHub repository secrets

다음 두 개의 **secret**을 `Settings → Secrets and variables → Actions → Repository secrets`에 등록합니다.

| Name | Value |
| --- | --- |
| `GCP_WIF_PROVIDER` | 위 7번에서 얻은 provider 리소스 전체 이름 |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `k-skill-proxy-deploy@k-skill-proxy.iam.gserviceaccount.com` |

> 값 자체가 민감하진 않지만, 외부에 노출되면 reconnaissance에 도움이 될 수 있으므로 secret으로 둡니다. variable로 옮겨도 동작은 동일합니다.

## Secret Manager에 upstream key 업로드

```bash
KEYS=(
  AIR_KOREA_OPEN_API_KEY KMA_OPEN_API_KEY SEOUL_OPEN_API_KEY HRFCO_OPEN_API_KEY
  OPINET_API_KEY DATA_GO_KR_API_KEY KEDU_INFO_KEY
  DATA4LIBRARY_AUTH_KEY FOODSAFETYKOREA_API_KEY KAKAO_REST_API_KEY KRX_API_KEY
  KOSIS_API_KEY NAVER_SEARCH_CLIENT_ID NAVER_SEARCH_CLIENT_SECRET
)

set -a; source ~/.config/k-skill/secrets.env; set +a

for k in "${KEYS[@]}"; do
  value="${!k:-}"
  [[ -z "$value" ]] && { echo "skip $k (empty)"; continue; }
  if gcloud secrets describe "$k" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$k" --data-file=- --project="$PROJECT_ID"
  else
    printf '%s' "$value" | gcloud secrets create "$k" --data-file=- --replication-policy=automatic --project="$PROJECT_ID"
  fi
done
```

키 값을 회전(rotate)할 때도 같은 명령을 다시 실행하면 새 version이 추가됩니다. Cloud Run은 `:latest`로 바인딩되어 있어 다음 배포부터 자동 반영됩니다(즉시 적용이 필요하면 새 revision을 한 번 더 deploy).

## 운영 점검 절차

- 자동 배포 상태: GitHub `Actions` 탭의 "Deploy k-skill-proxy to Cloud Run" 워크플로
- 라이브 헬스체크: `curl -fsS https://k-skill-proxy.nomadamas.org/health`
- Cloud Run revision/로그: GCP Console → Cloud Run → `k-skill-proxy` (`asia-northeast1`)
- 이미지 태그: `asia-northeast1-docker.pkg.dev/k-skill-proxy/k-skill/k-skill-proxy:<commit-sha>`
- 트래픽 롤백: 이전 revision으로 traffic split을 100% 되돌리거나, 직전 commit을 revert해서 main에 머지 → 워크플로가 다시 돈다.

## 로컬에서 동일한 배포를 수동으로 돌리고 싶을 때

`gcloud auth login`으로 maintainer 계정에 로그인된 상태에서:

```bash
SHA="$(git rev-parse HEAD)"
IMAGE_URI="asia-northeast1-docker.pkg.dev/k-skill-proxy/k-skill/k-skill-proxy:${SHA}"

gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet
docker build -t "$IMAGE_URI" -f packages/k-skill-proxy/Dockerfile .
docker push "$IMAGE_URI"

gcloud run deploy k-skill-proxy \
  --image="$IMAGE_URI" \
  --region=asia-northeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --execution-environment=gen2 \
  --cpu=1 --memory=512Mi --min-instances=0 --max-instances=3 \
  --concurrency=80 --timeout=60 --cpu-boost \
  --project=k-skill-proxy
```

이 명령은 평상시에는 필요 없습니다. GitHub Actions가 같은 일을 하기 때문입니다.
