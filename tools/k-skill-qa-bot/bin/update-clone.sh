#!/usr/bin/env bash
# shellcheck shell=bash
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/env.sh
. "$HERE/lib/env.sh"
# shellcheck source=lib/log.sh
. "$HERE/lib/log.sh"

REMOTE_URL="${REMOTE_URL:-https://github.com/NomaDamas/k-skill.git}"

assert_safe_clone_target() {
    _target="$1"

    if [ -d "$_target" ]; then
        _abs_target="$(cd "$_target" && pwd)"
    else
        _abs_target="$(cd "$(dirname "$_target")" 2>/dev/null && pwd)/$(basename "$_target")"
    fi

    _expected="${K_QA_HOME}/k-skill-clone"

    if [ "$_abs_target" != "$_expected" ] && [ "${ALLOW_EXTERNAL_CLONE_TARGET:-0}" != 1 ]; then
        log_error "REFUSING: K_SKILL_CLONE=${_abs_target} differs from expected ${_expected}."
        log_error "  Set ALLOW_EXTERNAL_CLONE_TARGET=1 only if you understand the destructive consequences."
        log_error "  This script will git-reset --hard + clean -fdx the target directory."
        exit 91
    fi

    case "$_abs_target" in
        ""|"/"|"$HOME"|"/Users"|"/Users/")
            log_error "REFUSING: K_SKILL_CLONE resolves to dangerous root path: ${_abs_target}"
            exit 90
            ;;
    esac

    if [ -d "$_abs_target/.git" ]; then
        _origin=$(git -C "$_abs_target" config --get remote.origin.url 2>/dev/null || echo "")
        case "$_origin" in
            *NomaDamas/k-skill*|*nomadamas/k-skill*) ;;
            "")
                log_warn "no remote.origin.url at $_abs_target; treating as fresh clone target"
                ;;
            *)
                log_error "REFUSING: existing repo at $_abs_target has remote ${_origin}; not NomaDamas/k-skill"
                exit 92
                ;;
        esac
    fi
}

assert_safe_clone_target "$K_SKILL_CLONE"

mkdir -p "$STATE_DIR"

if [ ! -d "$K_SKILL_CLONE/.git" ]; then
    log_info "cloning ${REMOTE_URL} (shallow, branch main) -> ${K_SKILL_CLONE}"
    rm -rf "$K_SKILL_CLONE"
    git clone --depth=1 --branch main "$REMOTE_URL" "$K_SKILL_CLONE" >&2
else
    log_info "updating clone at ${K_SKILL_CLONE}"
    git -C "$K_SKILL_CLONE" fetch --depth=1 origin main >&2
    git -C "$K_SKILL_CLONE" reset --hard origin/main >&2
    git -C "$K_SKILL_CLONE" clean -fdx >&2
fi

HEAD_SHA="$(git -C "$K_SKILL_CLONE" rev-parse HEAD)"
echo "$HEAD_SHA" > "$STATE_DIR/clone-head"
log_info "clone HEAD=${HEAD_SHA}"

SKILLS_DIR="$K_SKILL_CLONE/.agents/skills"
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"
for d in "$K_SKILL_CLONE"/*/; do
    base="$(basename "$d")"
    [ -f "$d/SKILL.md" ] || continue
    ln -s "../../$base" "$SKILLS_DIR/$base"
done

log_info "symlinks ready in ${SKILLS_DIR}"
