#!/usr/bin/env bash
# Install the k-skill-proxy usage dashboard (Loki + Promtail + Grafana) on
# gpu01 as systemd *user* services. No root or docker required.
#
# Idempotent: safe to re-run; it upgrades binaries only when versions change.
# Secrets: grafana.env (chmod 600) is created once with a random admin
# password and never overwritten. It must never be committed to git.
set -euo pipefail

APP_DIR="${KSKILL_DASHBOARD_DIR:-$HOME/apps/k-skill-proxy-dashboard}"
GRAFANA_VERSION="${GRAFANA_VERSION:-12.1.0}"
LOKI_VERSION="${LOKI_VERSION:-3.5.3}"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }

mkdir -p "$APP_DIR/bin" "$APP_DIR/data/loki" "$APP_DIR/data/promtail" "$APP_DIR/data/grafana"

install_grafana() {
  if [[ -x "$APP_DIR/bin/grafana/bin/grafana" ]] && \
     "$APP_DIR/bin/grafana/bin/grafana" -v 2>/dev/null | grep -q "$GRAFANA_VERSION"; then
    log "grafana $GRAFANA_VERSION already installed"
    return
  fi
  log "installing grafana $GRAFANA_VERSION"
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "https://dl.grafana.com/oss/release/grafana-${GRAFANA_VERSION}.linux-amd64.tar.gz" \
    | tar -xz -C "$tmp"
  rm -rf "$APP_DIR/bin/grafana"
  mv "$tmp"/grafana-* "$APP_DIR/bin/grafana"
  rm -rf "$tmp"
}

install_loki_promtail() {
  local name="$1"
  if [[ -x "$APP_DIR/bin/$name" ]] && \
     "$APP_DIR/bin/$name" --version 2>/dev/null | grep -q "$LOKI_VERSION"; then
    log "$name $LOKI_VERSION already installed"
    return
  fi
  log "installing $name $LOKI_VERSION"
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/grafana/loki/releases/download/v${LOKI_VERSION}/${name}-linux-amd64.zip" \
    -o "$tmp/$name.zip"
  (cd "$tmp" && unzip -o -q "$name.zip")
  install -m 0755 "$tmp/${name}-linux-amd64" "$APP_DIR/bin/$name"
  rm -rf "$tmp"
}

write_grafana_env() {
  local env_file="$APP_DIR/grafana.env"
  if [[ -f "$env_file" ]]; then
    log "grafana.env already exists; leaving secrets untouched"
    return
  fi
  local password
  password="$(openssl rand -base64 24 | tr -d '=+/')"
  umask 077
  cat > "$env_file" <<EOF
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=${password}
GF_SERVER_HTTP_ADDR=127.0.0.1
GF_SERVER_HTTP_PORT=3200
GF_SERVER_ROOT_URL=https://k-skill-proxy-dashboard.nomadamas.org
GF_USERS_ALLOW_SIGN_UP=false
GF_AUTH_ANONYMOUS_ENABLED=false
GF_PATHS_DATA=${APP_DIR}/data/grafana
GF_PATHS_LOGS=${APP_DIR}/data/grafana/logs
GF_PATHS_PLUGINS=${APP_DIR}/data/grafana/plugins
GF_PATHS_PROVISIONING=${APP_DIR}/data/provisioning
EOF
  chmod 600 "$env_file"
  log "wrote $env_file (mode 600)"
  log "Grafana admin credentials are stored in $env_file"
}

prepare_provisioning() {
  # The repo provisioning references container paths; rewrite them for the
  # binary layout into a runtime copy so the repo files stay docker-ready.
  mkdir -p "$APP_DIR/data/provisioning/datasources" "$APP_DIR/data/provisioning/dashboards"
  sed "s|url: http://loki:3100|url: http://127.0.0.1:3100|" \
    "$APP_DIR/grafana/provisioning/datasources/loki.yml" \
    > "$APP_DIR/data/provisioning/datasources/loki.yml"
  sed "s|/var/lib/grafana/dashboards|${APP_DIR}/grafana/dashboards|" \
    "$APP_DIR/grafana/provisioning/dashboards/dashboards.yml" \
    > "$APP_DIR/data/provisioning/dashboards/dashboards.yml"
}

install_units() {
  mkdir -p "$HOME/.config/systemd/user"
  install -m 0644 "$APP_DIR/systemd/k-skill-proxy-loki.service" \
    "$APP_DIR/systemd/k-skill-proxy-promtail.service" \
    "$APP_DIR/systemd/k-skill-proxy-grafana.service" \
    "$HOME/.config/systemd/user/"
  systemctl --user daemon-reload
  systemctl --user enable --now k-skill-proxy-loki.service
  systemctl --user enable --now k-skill-proxy-promtail.service
  systemctl --user enable --now k-skill-proxy-grafana.service
  systemctl --user restart k-skill-proxy-loki.service k-skill-proxy-promtail.service k-skill-proxy-grafana.service
}

install_grafana
install_loki_promtail loki
install_loki_promtail promtail
write_grafana_env
prepare_provisioning
install_units

log "done. Services:"
systemctl --user --no-pager status k-skill-proxy-loki.service k-skill-proxy-promtail.service k-skill-proxy-grafana.service \
  | grep -E '●|Active:' || true
