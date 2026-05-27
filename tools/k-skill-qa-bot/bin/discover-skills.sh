#!/usr/bin/env bash
# shellcheck shell=bash
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/env.sh
. "$HERE/lib/env.sh"
# shellcheck source=lib/log.sh
. "$HERE/lib/log.sh"

CLONE_ROOT="${1:-$K_SKILL_CLONE}"

if [ ! -d "$CLONE_ROOT" ]; then
    log_error "clone root not found: $CLONE_ROOT"
    exit 2
fi

exec python3 "$HERE/lib/parse_skill_md.py" "$CLONE_ROOT"
