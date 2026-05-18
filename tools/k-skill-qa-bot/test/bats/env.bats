#!/usr/bin/env bats

setup() {
    QA_BOT_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
    ENV_SH="$QA_BOT_ROOT/bin/lib/env.sh"
}

@test "env.sh sets all default values when nothing else is set" {
    run env -i HOME="$HOME" PATH="$PATH" ENV_SH="$ENV_SH" bash -c '. "$ENV_SH" && echo "$CODEX_MODEL|$MAX_PARALLEL|$GH_REPO|$LAST_RUN_MIN_AGE|$CREATE_ISSUES|$JUDGE_MODEL"'
    [ "$status" -eq 0 ]
    [ "$output" = "gpt-5.5|4|NomaDamas/k-skill|259200|false|gpt-5.5" ]
}

@test "env.sh respects existing environment variables" {
    run env -i HOME="$HOME" PATH="$PATH" ENV_SH="$ENV_SH" MAX_PARALLEL=8 CODEX_MODEL=custom bash -c '. "$ENV_SH" && echo "$CODEX_MODEL|$MAX_PARALLEL"'
    [ "$status" -eq 0 ]
    [ "$output" = "custom|8" ]
}

@test "env.sh respects user .env overrides" {
    TMP=$(mktemp -d)
    echo 'MAX_PARALLEL=16' > "$TMP/.env"
    run env -i HOME="$HOME" PATH="$PATH" ENV_SH="$ENV_SH" K_QA_HOME="$TMP" bash -c '. "$ENV_SH" && echo "$MAX_PARALLEL"'
    [ "$status" -eq 0 ]
    [ "$output" = "16" ]
    rm -rf "$TMP"
}
