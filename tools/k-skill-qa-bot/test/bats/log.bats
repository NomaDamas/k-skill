#!/usr/bin/env bats

setup() {
    QA_BOT_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
    cd "$QA_BOT_ROOT"
}

@test "log_info writes nothing to stdout" {
    run bash -c '. bin/lib/log.sh && log_info "hello" 2>/dev/null'
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "log_info writes ISO-8601 + INFO + message to stderr" {
    run bash -c '. bin/lib/log.sh && log_info "hello world" 2>&1 1>/dev/null'
    [ "$status" -eq 0 ]
    echo "$output" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z[[:space:]]+INFO'
    echo "$output" | grep -q 'hello world'
}

@test "log_warn uses WARN prefix" {
    run bash -c '. bin/lib/log.sh && log_warn "boom" 2>&1 1>/dev/null'
    echo "$output" | grep -qE 'WARN[[:space:]]'
}

@test "log_error uses ERROR prefix" {
    run bash -c '. bin/lib/log.sh && log_error "crash" 2>&1 1>/dev/null'
    echo "$output" | grep -qE 'ERROR[[:space:]]'
}

@test "log_debug is silent when K_QA_VERBOSE=0" {
    run bash -c 'K_QA_VERBOSE=0; . bin/lib/log.sh && log_debug "noisy" 2>&1'
    [ -z "$output" ]
}

@test "log_debug emits when K_QA_VERBOSE=1" {
    run bash -c 'K_QA_VERBOSE=1; . bin/lib/log.sh && log_debug "noisy" 2>&1 1>/dev/null'
    echo "$output" | grep -qE 'DEBUG[[:space:]]'
    echo "$output" | grep -q 'noisy'
}
