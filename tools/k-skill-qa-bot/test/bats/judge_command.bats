#!/usr/bin/env bats

setup() {
    QA_BOT_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
    TMP="$(mktemp -d)"
    STUB="$TMP/codex"
    CAPTURE="$TMP/argv.txt"
    TRANSCRIPT="$TMP/transcript.jsonl"
    SKILL_MD="$TMP/SKILL.md"
    cat > "$STUB" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$CODEX_ARGV_CAPTURE"
printf '%s\n' '{"type":"item.completed","item":{"type":"agent_message","text":"{\"verdict\":\"pass\",\"reason\":\"judge accepted transcript\",\"symptom_class\":\"success\",\"confidence\":0.99,\"evidence_quote\":\"VERDICT: PASS\"}"}}'
SH
    chmod +x "$STUB"
    cat > "$TRANSCRIPT" <<'JSONL'
{"type":"item.completed","item":{"type":"agent_message","text":"VERDICT: PASS\nEverything worked."}}
JSONL
    echo '# Test Skill' > "$SKILL_MD"
}

teardown() {
    rm -rf "$TMP"
}

@test "judge-skill standalone defaults to gpt-5.5" {
    receipt="{\"name\":\"demo\",\"status\":\"executed\",\"exit_code\":0,\"duration_ms\":100,\"transcript_path\":\"$TRANSCRIPT\",\"test_prompt\":\"run demo\"}"

    run env -i HOME="$HOME" PATH="$PATH" CODEX_BIN="$STUB" CODEX_ARGV_CAPTURE="$CAPTURE" \
        bash -c 'printf "%s" "$0" | "$1" --skill-md "$2"' "$receipt" "$QA_BOT_ROOT/bin/judge-skill.py" "$SKILL_MD"

    [ "$status" -eq 0 ]
    echo "$output" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data["judge_model"] == "gpt-5.5", data'
    grep -qx -- '-m' "$CAPTURE"
    grep -qx -- 'gpt-5.5' "$CAPTURE"
}

@test "judge-skill keeps judge codex execution read-only and pins provider" {
    receipt="{\"name\":\"demo\",\"status\":\"executed\",\"exit_code\":0,\"duration_ms\":100,\"transcript_path\":\"$TRANSCRIPT\",\"test_prompt\":\"run demo\"}"

    run env -i HOME="$HOME" PATH="$PATH" CODEX_BIN="$STUB" CODEX_ARGV_CAPTURE="$CAPTURE" CODEX_PROVIDER="example-provider" \
        bash -c 'printf "%s" "$0" | "$1" --skill-md "$2" --timeout 5' "$receipt" "$QA_BOT_ROOT/bin/judge-skill.py" "$SKILL_MD"

    [ "$status" -eq 0 ]
    grep -qx -- '-s' "$CAPTURE"
    grep -qx -- 'read-only' "$CAPTURE"
    grep -qx -- '-c' "$CAPTURE"
    grep -qx -- 'approval_policy="never"' "$CAPTURE"
    grep -qx -- 'model_provider="example-provider"' "$CAPTURE"
    if grep -qx -- '--dangerously-bypass-approvals-and-sandbox' "$CAPTURE"; then
        echo "unexpected sandbox-bypass flag in judge argv"
        return 1
    fi
}
