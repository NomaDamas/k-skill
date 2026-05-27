#!/usr/bin/env bash
# shellcheck shell=bash
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/env.sh
. "$HERE/lib/env.sh"
# shellcheck source=lib/log.sh
. "$HERE/lib/log.sh"

has() { command -v "$1" >/dev/null 2>&1; }

codex_ok=false;    has codex    && codex_ok=true
gh_ok=false;       has gh       && gh_ok=true
gtimeout_ok=false; has gtimeout && gtimeout_ok=true
git_ok=false;      has git      && git_ok=true
jq_ok=false;       has jq       && jq_ok=true
python_ok=false;   has python3  && python_ok=true

gh_authed=false
if [ "$gh_ok" = true ]; then
    gh auth status >/dev/null 2>&1 && gh_authed=true
fi

proxy_status=0
proxy_ok=false
if has curl; then
    proxy_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${PROXY_URL}" || echo 0)
    [ "$proxy_status" = "200" ] && proxy_ok=true
fi

github_ok=false
if has curl; then
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://api.github.com 2>/dev/null || echo 0)
    if [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 500 ] 2>/dev/null; then
        github_ok=true
    fi
fi

disk_free_mb=$(df -Pm "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
[ -z "$disk_free_mb" ] && disk_free_mb=0

printf '{"codex":%s,"gh":%s,"gh_authed":%s,"gtimeout":%s,"git":%s,"jq":%s,"python3":%s,"proxy":{"ok":%s,"status":%s},"github":%s,"disk_free_mb":%s}\n' \
    "$codex_ok" "$gh_ok" "$gh_authed" "$gtimeout_ok" "$git_ok" "$jq_ok" "$python_ok" \
    "$proxy_ok" "${proxy_status:-0}" "$github_ok" "$disk_free_mb"

if [ "$codex_ok" = true ] && [ "$gh_ok" = true ] && [ "$gtimeout_ok" = true ] && [ "$github_ok" = true ] && [ "$python_ok" = true ] && [ "$git_ok" = true ] && [ "$jq_ok" = true ]; then
    exit 0
else
    exit 1
fi
