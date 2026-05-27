#!/usr/bin/env bash
# shellcheck shell=bash
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/env.sh
. "$HERE/lib/env.sh"
# shellcheck source=lib/log.sh
. "$HERE/lib/log.sh"

RUN_DIR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --run-dir) RUN_DIR="$2"; shift 2 ;;
        *) echo "test-skill.sh: unknown arg: $1" >&2; exit 2 ;;
    esac
done
[ -n "$RUN_DIR" ] || { echo "test-skill.sh: --run-dir <path> required" >&2; exit 2; }
mkdir -p "$RUN_DIR/results"

CLASSIFICATION="$(cat)"
NAME="$(echo "$CLASSIFICATION" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))')"
SKIP_REASON="$(echo "$CLASSIFICATION" | python3 -c 'import json,sys; v=json.load(sys.stdin).get("skip_reason"); print(v if v is not None else "")')"
PROMPT="$(echo "$CLASSIFICATION" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("default_test_prompt",""))')"

RECEIPT="$RUN_DIR/results/${NAME}.exec.json"

emit_receipt() {
    python3 - "$RECEIPT" <<'PY' "$@"
import json, sys
out = sys.argv[1]
data = dict(zip(sys.argv[2::2], sys.argv[3::2]))
for k in ("exit_code","duration_ms"):
    if k in data:
        try: data[k] = int(data[k])
        except ValueError: pass
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)
    f.write("\n")
PY
}

if [ -n "$SKIP_REASON" ]; then
    emit_receipt name "$NAME" status skip reason "$SKIP_REASON" symptom_class skipped
    log_info "skip ${NAME}: ${SKIP_REASON}"
    exit 0
fi

JSONL="$RUN_DIR/results/${NAME}.codex.jsonl"
STDERR="$RUN_DIR/results/${NAME}.codex.stderr.log"

TIMEOUT_BIN="$(command -v gtimeout || command -v timeout || echo "")"
if [ -z "$TIMEOUT_BIN" ]; then
    log_error "gtimeout/timeout not found; install GNU coreutils (brew install coreutils)"
    emit_receipt name "$NAME" status fail exit_code 127 reason "gtimeout missing" symptom_class cli-missing
    exit 0
fi

START_MS=$(python3 -c 'import time;print(int(time.time()*1000))')

set +e
"$TIMEOUT_BIN" --kill-after=15 "$TIMEOUT_SECS" \
    "$CODEX_BIN" exec --json --dangerously-bypass-approvals-and-sandbox \
        --skip-git-repo-check --ephemeral \
        -C "$K_SKILL_CLONE" -m "$CODEX_MODEL" \
        -c "model_provider=\"${CODEX_PROVIDER:-openai}\"" \
        "$PROMPT" \
    </dev/null >"$JSONL" 2>"$STDERR"
EXIT_CODE=$?
set -e

END_MS=$(python3 -c 'import time;print(int(time.time()*1000))')
DURATION_MS=$((END_MS - START_MS))

emit_receipt \
    name "$NAME" \
    status executed \
    exit_code "$EXIT_CODE" \
    duration_ms "$DURATION_MS" \
    transcript_path "$JSONL" \
    stderr_path "$STDERR" \
    test_prompt "$PROMPT" \
    codex_model "$CODEX_MODEL"

log_info "executed ${NAME}: exit=${EXIT_CODE} duration=${DURATION_MS}ms"
