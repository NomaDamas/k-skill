#!/usr/bin/env bats

setup() {
    QA_BOT_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
    TMP="$(mktemp -d)"
    STUB_BIN="$TMP/bin"
    mkdir -p "$STUB_BIN" "$TMP/clone" "$TMP/run"
    CAPTURE="$TMP/argv.txt"
    cat > "$STUB_BIN/codex" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$CODEX_ARGV_CAPTURE"
printf '%s\n' '{"type":"item.completed","item":{"type":"agent_message","text":"smoke ok"}}'
SH
    chmod +x "$STUB_BIN/codex"
    cat > "$STUB_BIN/gtimeout" <<'SH'
#!/usr/bin/env bash
if [ "$1" = "--kill-after=15" ]; then
    shift 2
fi
exec "$@"
SH
    chmod +x "$STUB_BIN/gtimeout"
}

teardown() {
    rm -rf "$TMP"
}

@test "test-skill keeps smoke codex execution on the documented sandbox-bypass path" {
    classification='{"name":"demo","skip_reason":null,"default_test_prompt":"run demo smoke"}'

    run env -i HOME="$HOME" PATH="$STUB_BIN:$PATH" CODEX_BIN="codex" CODEX_ARGV_CAPTURE="$CAPTURE" \
        K_QA_HOME="$TMP/home" K_SKILL_CLONE="$TMP/clone" CODEX_MODEL="smoke-model" CODEX_PROVIDER="smoke-provider" TIMEOUT_SECS="5" \
        bash -c 'printf "%s" "$0" | "$1" --run-dir "$2"' "$classification" "$QA_BOT_ROOT/bin/test-skill.sh" "$TMP/run"

    [ "$status" -eq 0 ]
    [ -f "$TMP/run/results/demo.exec.json" ]
    grep -qx -- 'exec' "$CAPTURE"
    grep -qx -- '--json' "$CAPTURE"
    grep -qx -- '--dangerously-bypass-approvals-and-sandbox' "$CAPTURE"
    grep -qx -- '--skip-git-repo-check' "$CAPTURE"
    grep -qx -- '--ephemeral' "$CAPTURE"
    grep -qx -- '-C' "$CAPTURE"
    grep -qx -- "$TMP/clone" "$CAPTURE"
    grep -qx -- '-m' "$CAPTURE"
    grep -qx -- 'smoke-model' "$CAPTURE"
    grep -qx -- 'model_provider="smoke-provider"' "$CAPTURE"
    grep -qx -- 'run demo smoke' "$CAPTURE"
    if grep -qx -- '-s' "$CAPTURE"; then
        echo "unexpected sandbox flag in smoke argv"
        return 1
    fi
    if grep -qx -- 'read-only' "$CAPTURE"; then
        echo "unexpected read-only sandbox in smoke argv"
        return 1
    fi
    python3 - "$TMP/run/results/demo.exec.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
assert data["status"] == "executed", data
assert data["codex_model"] == "smoke-model", data
assert data["test_prompt"] == "run demo smoke", data
PY
}
