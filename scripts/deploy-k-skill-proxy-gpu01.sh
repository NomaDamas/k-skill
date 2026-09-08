#!/usr/bin/env bash
set -euo pipefail

# cron has no user-session bus; systemctl --user needs these.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

REPO_URL="${KSKILL_PROXY_REPO_URL:-git@github.com:NomaDamas/k-skill.git}"
REPO_DIR="${KSKILL_PROXY_REPO_DIR:-/data/home/jeffrey/apps/k-skill-proxy-repo}"
APP_DIR="${KSKILL_PROXY_APP_DIR:-/data/home/jeffrey/apps/k-skill-proxy}"
SERVICE_NAME="${KSKILL_PROXY_SERVICE_NAME:-k-skill-proxy.service}"
DEPLOY_REF="${KSKILL_PROXY_DEPLOY_REF:-origin/main}"
ENV_FILE="${KSKILL_PROXY_ENV_FILE:-$APP_DIR/.env}"
DEPLOY_ENVIRONMENT="${KSKILL_PROXY_DEPLOY_ENVIRONMENT:-production}"
DEPLOY_HOST="${KSKILL_PROXY_DEPLOY_HOST:-$(hostname -s)}"

# Services the watchdog keeps alive in production. The 2026-08-29 gpu01 reboot
# left the tunnel and dashboard stack dead for ~10 days because nothing but
# this cron ever started them and Restart=on-failure ignores clean SIGTERMs.
WATCHED_SERVICES="${KSKILL_PROXY_WATCHED_SERVICES:-$SERVICE_NAME k-skill-proxy-tunnel.service k-skill-proxy-loki.service k-skill-proxy-promtail.service k-skill-proxy-grafana.service}"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
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

ensure_env_default() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$env_file" ]]; then
    log "Runtime environment file does not exist: $env_file"
    return 1
  fi

  if grep -Eq "^[[:space:]]*${key}=" "$env_file"; then
    return
  fi

  printf '\n%s=%s\n' "$key" "$value" >> "$env_file"
  log "Added required runtime default: $key=$value"
}

is_gpu01_production() {
  local deploy_environment="$1"
  local deploy_host="$2"

  if [[ "$deploy_environment" != "production" ]]; then
    return 1
  fi

  # SSH alias is gpu01; hostname -s on the box is marker-multi-gpu-server-01.
  # Crontab should also set KSKILL_PROXY_DEPLOY_HOST=gpu01.
  case "$deploy_host" in
    gpu01|marker-multi-gpu-server-01) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_gpu01_production_defaults() {
  local env_file="$1"
  local deploy_environment="$2"
  local deploy_host="$3"

  if ! is_gpu01_production "$deploy_environment" "$deploy_host"; then
    return
  fi

  ensure_env_default "$env_file" "KSKILL_PROXY_TRUST_PROXY_HOPS" "1"
}

ensure_service_active() {
  local service="$1"

  if [[ ! "$service" == *.service ]]; then
    service="$service.service"
  fi

  if ! systemctl --user list-unit-files "$service" --no-legend 2>/dev/null | grep -q .; then
    return
  fi

  if systemctl --user is-active --quiet "$service"; then
    return
  fi

  log "Service $service is not active; starting"
  systemctl --user start "$service"
}

ensure_production_services() {
  local deploy_environment="$1"
  local deploy_host="$2"

  if ! is_gpu01_production "$deploy_environment" "$deploy_host"; then
    return
  fi

  local service
  for service in $WATCHED_SERVICES; do
    ensure_service_active "$service"
  done
}

privacy_check() {
  local url="$1"
  local output
  output="$(curl -fsS --max-time 20 "$url")"
  node -e '
    if (!process.argv[1].includes("name=\"k-skill-privacy-policy-version\" content=\"2026-08-18\"")) {
      process.exit(1);
    }
  ' "$output"
}

if [[ "${KSKILL_PROXY_DEPLOY_LIB_ONLY:-0}" == "1" ]]; then
  return 0 2>/dev/null || exit 0
fi

ensure_production_services "$DEPLOY_ENVIRONMENT" "$DEPLOY_HOST"

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
ensure_gpu01_production_defaults "$ENV_FILE" "$DEPLOY_ENVIRONMENT" "$DEPLOY_HOST"
systemctl --user restart "$SERVICE_NAME"

for _ in 1 2 3 4 5; do
  sleep 2
  if health_check http://127.0.0.1:8080/health; then
    break
  fi
done
health_check http://127.0.0.1:8080/health
health_check https://k-skill-proxy.nomadamas.org/health
privacy_check http://127.0.0.1:8080/privacy
privacy_check https://k-skill-proxy.nomadamas.org/privacy

install -m 0755 "$REPO_DIR/scripts/deploy-k-skill-proxy-gpu01.sh" "$APP_DIR/deploy-k-skill-proxy-gpu01.sh"

printf '%s\n' "$target_sha" > "$APP_DIR/deployed-sha"
trap - ERR
log "Deployed $target_sha"
