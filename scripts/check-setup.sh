#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
exec "$root/k-skill-setup/scripts/check-setup.sh" "$@"
