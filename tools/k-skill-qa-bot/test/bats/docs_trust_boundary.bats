#!/usr/bin/env bats

setup() {
    QA_BOT_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
    README="$QA_BOT_ROOT/README.md"
    AGENTS="$QA_BOT_ROOT/AGENTS.md"
}

@test "README accurately documents judge trust boundary" {
    run grep -F 'it only reads transcripts/prompts and emits JSON' "$README"
    [ "$status" -ne 0 ]

    grep -Fq 'read-only/no-approval limits writes and approval prompts, but does not make the judge a no-tools or file-isolated model call' "$README"
    grep -Fq 'Treat transcript and skill Markdown as untrusted input' "$README"
}

@test "README accurately documents smoke-test egress and LaunchAgent boundary" {
    grep -Fq 'public skill endpoints exercised by smoke tests' "$README"
    grep -Fq 'bot-managed clone is not write-protected from the unsandboxed smoke agent' "$README"
    grep -Fq 'A dedicated LaunchAgent is scheduling isolation only; it is not a separate OS user, container, or filesystem sandbox' "$README"
}

@test "QA-bot AGENTS guidance preserves split trust boundary" {
    grep -Fq 'Smoke tests intentionally run unsandboxed and may contact public skill endpoints' "$AGENTS"
    grep -Fq 'bot-managed clone is not write-protected from the unsandboxed smoke agent' "$AGENTS"
    grep -Fq 'The judge uses read-only/no-approval Codex settings, but is still a tool-capable Codex agent over untrusted transcripts and skill Markdown' "$AGENTS"
}
