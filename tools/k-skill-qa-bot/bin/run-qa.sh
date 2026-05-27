#!/usr/bin/env bash
# shellcheck shell=bash
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/env.sh
. "$HERE/lib/env.sh"
# shellcheck source=lib/log.sh
. "$HERE/lib/log.sh"
# shellcheck source=lib/lock.sh
. "$HERE/lib/lock.sh"

FORCE=false
DRY_RUN=false
ONLY=""
OFFLINE_JUDGE=false
while [ $# -gt 0 ]; do
    case "$1" in
        --force) FORCE=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --only) ONLY="${ONLY}${ONLY:+,}$2"; shift 2 ;;
        --offline-judge) OFFLINE_JUDGE=true; shift ;;
        *) echo "run-qa.sh: unknown arg: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$STATE_DIR" "$LOG_DIR"

if ! acquire_lock; then
    log_warn "another run-qa is in progress; exiting"
    exit 0
fi
trap 'release_lock' EXIT INT TERM

LAST_RUN_FILE="$STATE_DIR/last_run"
if [ "$FORCE" = false ] && [ -f "$LAST_RUN_FILE" ]; then
    last=$(head -1 "$LAST_RUN_FILE")
    last_ts=$(echo "$last" | awk '{print $1}')
    now=$(date +%s)
    age=$((now - last_ts))
    if [ "$age" -lt "$LAST_RUN_MIN_AGE" ]; then
        log_info "too recent: last run ${age}s ago < ${LAST_RUN_MIN_AGE}s (use --force to override)"
        exit 0
    fi
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$STATE_DIR/runs/$RUN_ID"
mkdir -p "$RUN_DIR/results"
log_info "starting run ${RUN_ID} -> ${RUN_DIR}"

set +e
HEALTH_JSON=$("$HERE/health-check.sh")
HEALTH_RC=$?
set -e
echo "$HEALTH_JSON" > "$RUN_DIR/health.json"
if [ "$HEALTH_RC" -ne 0 ]; then
    log_error "health-check failed; aborting"
    cat "$RUN_DIR/health.json" >&2
    exit 1
fi

if [ "${SKIP_CLONE:-false}" = true ]; then
    log_info "SKIP_CLONE=true; using existing K_SKILL_CLONE=${K_SKILL_CLONE}"
elif [ ! -d "$K_SKILL_CLONE/.git" ]; then
    if find "$K_SKILL_CLONE" -maxdepth 2 -name SKILL.md -print -quit 2>/dev/null | grep -q .; then
        log_info "K_SKILL_CLONE=${K_SKILL_CLONE} has SKILL.md files but no .git; treating as offline fixture"
    else
        "$HERE/update-clone.sh"
    fi
elif [ "$FORCE" = true ] || [ ! -f "$STATE_DIR/clone-head" ]; then
    "$HERE/update-clone.sh"
fi

MANIFEST="$RUN_DIR/manifest.json"
"$HERE/discover-skills.sh" "$K_SKILL_CLONE" > "$MANIFEST"
total=$(jq 'length' "$MANIFEST")
log_info "discovered ${total} skills"

if [ -z "$ONLY" ]; then
    entries_jsonl=$(jq -c '.[]' "$MANIFEST")
else
    entries_jsonl=$(jq -c --arg only "$ONLY" '.[] | select(.name as $n | ($only | split(",") | index($n)))' "$MANIFEST")
fi

OVERRIDES_PATH="${OVERRIDES_PATH:-$HERE/../config/skill-overrides.yml}"
README_PATH="${README_PATH:-$K_SKILL_CLONE/README.md}"

process_one() {
    entry="$1"
    name=$(echo "$entry" | jq -r .name)

    classification=$(echo "$entry" | "$HERE/classify-skill.py" \
        --overrides "$OVERRIDES_PATH" \
        --readme "$README_PATH" 2>/dev/null || true)
    if [ -z "$classification" ]; then
        log_error "classify failed for ${name}"
        return
    fi
    echo "$classification" > "$RUN_DIR/results/${name}.classify.json"

    echo "$classification" | "$HERE/test-skill.sh" --run-dir "$RUN_DIR" >/dev/null 2>&1 || true
    if [ ! -f "$RUN_DIR/results/${name}.exec.json" ]; then
        log_error "test-skill receipt missing for ${name}"
        return
    fi

    judge_args=(--skill-md "$K_SKILL_CLONE/${name}/SKILL.md")
    if [ "$OFFLINE_JUDGE" = true ]; then
        judge_args+=(--offline)
    fi
    judge_out=$(cat "$RUN_DIR/results/${name}.exec.json" | "$HERE/judge-skill.py" "${judge_args[@]}" 2>/dev/null || true)
    if [ -z "$judge_out" ]; then
        log_error "judge failed for ${name}"
        return
    fi
    echo "$judge_out" > "$RUN_DIR/results/${name}.judge.json"
}

export HERE RUN_DIR K_SKILL_CLONE OVERRIDES_PATH README_PATH OFFLINE_JUDGE

if [ -z "$entries_jsonl" ]; then
    log_warn "no entries to process (filter=${ONLY})"
else
    JOB_DIR=$(mktemp -d)
    i=0
    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        printf '%s' "$entry" > "$JOB_DIR/$(printf '%04d' "$i").json"
        i=$((i+1))
    done <<< "$entries_jsonl"

    export HERE RUN_DIR K_SKILL_CLONE OVERRIDES_PATH README_PATH OFFLINE_JUDGE

    WORKER="$JOB_DIR/worker.sh"
    cat > "$WORKER" <<WORKER_EOF
#!/usr/bin/env bash
set -u
HERE="\$HERE"
. "\$HERE/lib/env.sh"
. "\$HERE/lib/log.sh"
entry_file="\$1"
entry="\$(cat "\$entry_file")"
name=\$(echo "\$entry" | jq -r .name)

classification=\$(echo "\$entry" | "\$HERE/classify-skill.py" \\
    --overrides "\$OVERRIDES_PATH" \\
    --readme "\$README_PATH" 2>/dev/null || true)
if [ -z "\$classification" ]; then
    log_error "classify failed for \${name}"
    exit 0
fi
echo "\$classification" > "\$RUN_DIR/results/\${name}.classify.json"

echo "\$classification" | "\$HERE/test-skill.sh" --run-dir "\$RUN_DIR" >/dev/null 2>&1 || true
if [ ! -f "\$RUN_DIR/results/\${name}.exec.json" ]; then
    log_error "test-skill receipt missing for \${name}"
    exit 0
fi

judge_args=(--skill-md "\$K_SKILL_CLONE/\${name}/SKILL.md")
if [ "\$OFFLINE_JUDGE" = true ]; then
    judge_args+=(--offline)
fi
judge_out=\$(cat "\$RUN_DIR/results/\${name}.exec.json" | "\$HERE/judge-skill.py" "\${judge_args[@]}" 2>/dev/null || true)
if [ -z "\$judge_out" ]; then
    log_error "judge failed for \${name}"
    exit 0
fi
echo "\$judge_out" > "\$RUN_DIR/results/\${name}.judge.json"
WORKER_EOF
    chmod +x "$WORKER"

    WORKER_LOG="$RUN_DIR/worker-debug.log"
    : > "$WORKER_LOG"
    if [ "${MAX_PARALLEL:-1}" -le 1 ]; then
        for f in "$JOB_DIR"/*.json; do
            [ -f "$f" ] || continue
            "$WORKER" "$f" >>"$WORKER_LOG" 2>&1
        done
    else
        find "$JOB_DIR" -name '0*.json' -print0 \
            | xargs -0 -P "$MAX_PARALLEL" -n 1 -I{} bash -c '"$0" "$1" >>"$2" 2>&1' "$WORKER" {} "$WORKER_LOG"
    fi
    rm -rf "$JOB_DIR"
fi

REPORT_ARGS=(--run-dir "$RUN_DIR")
[ "$DRY_RUN" = true ] && REPORT_ARGS+=(--dry-run)
"$HERE/report-failures.sh" "${REPORT_ARGS[@]}"

echo "$(date +%s) $RUN_ID" > "$LAST_RUN_FILE"

if [ -d "$STATE_DIR/runs" ]; then
    find "$STATE_DIR/runs" -mindepth 1 -maxdepth 1 -type d -print0 \
        | xargs -0 -I{} stat -f '%m %N' {} 2>/dev/null \
        | sort -rn | tail -n +13 | awk '{print $2}' \
        | xargs -I{} rm -rf {} 2>/dev/null || true
fi

log_info "run ${RUN_ID} complete; summary: $RUN_DIR/summary.md"
echo "$RUN_DIR/summary.md"
