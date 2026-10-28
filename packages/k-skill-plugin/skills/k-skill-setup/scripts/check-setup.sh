#!/usr/bin/env bash
set -euo pipefail

secrets_file="${1:-$HOME/.config/k-skill/secrets.env}"

missing=0

if [[ ! -f "$secrets_file" ]]; then
  echo "missing secrets file: $secrets_file"
  missing=1
else
  perms=$(stat -f '%Lp' "$secrets_file" 2>/dev/null || stat -c '%a' "$secrets_file" 2>/dev/null)
  if [[ "$perms" != "600" ]]; then
    echo "insecure permissions on $secrets_file: $perms (expected 600)"
    missing=1
  fi
fi

if [[ "$missing" -ne 0 ]]; then
  cat <<EOF
next steps:
  1. create ~/.config/k-skill/secrets.env with your credentials
  2. chmod 0600 ~/.config/k-skill/secrets.env
  3. run this check again
EOF
  exit 1
fi

echo "k-skill setup looks usable"
