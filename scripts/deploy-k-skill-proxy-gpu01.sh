#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${KSKILL_PROXY_REPO_URL:-git@github.com:NomaDamas/k-skill.git}"
REPO_DIR="${KSKILL_PROXY_REPO_DIR:-/data/home/jeffrey/apps/k-skill-proxy-repo}"
APP_DIR="${KSKILL_PROXY_APP_DIR:-/data/home/jeffrey/apps/k-skill-proxy}"
SERVICE_NAME="${KSKILL_PROXY_SERVICE_NAME:-k-skill-proxy.service}"
DEPLOY_REF="${KSKILL_PROXY_DEPLOY_REF:-origin/main}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

health_check() {
  local url="$1"
  local output
  output="$(curl -fsS --max-time 20 "$url")"
  node -e '
    const data = JSON.parse(process.argv[1]);
    if (data.ok !== true) process.exit(1);
  ' "$output"
}

if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "Cloning source repository"
  git clone "$REPO_URL" "$REPO_DIR"
fi

git -C "$REPO_DIR" fetch --prune origin
target_sha="$(git -C "$REPO_DIR" rev-parse "${DEPLOY_REF}^{commit}")"
deployed_sha="$(cat "$APP_DIR/deployed-sha" 2>/dev/null || true)"

if [[ "$target_sha" == "$deployed_sha" ]]; then
  log "Already deployed: $target_sha"
  exit 0
fi

log "Validating $target_sha"
git -C "$REPO_DIR" checkout --detach --force "$target_sha"
npm --prefix "$REPO_DIR" ci --no-audit --no-fund
npm --prefix "$REPO_DIR" run lint --workspace k-skill-proxy
npm --prefix "$REPO_DIR" run test --workspace k-skill-proxy

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$APP_DIR/backups/k-skill-proxy-${timestamp}-${deployed_sha:-unknown}.tgz"
mkdir -p "$APP_DIR/backups"
tar -C "$APP_DIR" -czf "$backup" \
  packages/k-skill-proxy packages/parking-lot-search deployed-sha \
  package.json package-lock.json 2>/dev/null || \
  tar -C "$APP_DIR" -czf "$backup" \
    packages/k-skill-proxy packages/parking-lot-search deployed-sha

rollback() {
  log "Deployment failed; restoring $backup"
  tar -C "$APP_DIR" -xzf "$backup"
  npm --prefix "$APP_DIR" ci --omit=dev --workspace k-skill-proxy \
    --include-workspace-root=false --no-audit --no-fund
  systemctl --user restart "$SERVICE_NAME"
}
trap rollback ERR

rsync -a --delete --exclude node_modules \
  "$REPO_DIR/packages/k-skill-proxy/" "$APP_DIR/packages/k-skill-proxy/"
rsync -a --delete \
  "$REPO_DIR/packages/parking-lot-search/" "$APP_DIR/packages/parking-lot-search/"
install -m 0644 "$REPO_DIR/package.json" "$APP_DIR/package.json"
install -m 0644 "$REPO_DIR/package-lock.json" "$APP_DIR/package-lock.json"

npm --prefix "$APP_DIR" ci --omit=dev --workspace k-skill-proxy \
  --include-workspace-root=false --no-audit --no-fund
systemctl --user restart "$SERVICE_NAME"

for _ in 1 2 3 4 5; do
  sleep 2
  if health_check http://127.0.0.1:8080/health; then
    break
  fi
done
health_check http://127.0.0.1:8080/health
health_check https://k-skill-proxy.nomadamas.org/health

printf '%s\n' "$target_sha" > "$APP_DIR/deployed-sha"
trap - ERR
log "Deployed $target_sha"
