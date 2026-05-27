# shellcheck shell=sh

: "${K_QA_HOME:=$HOME/.local/share/k-skill-qa-bot}"
: "${K_SKILL_CLONE:=$K_QA_HOME/k-skill-clone}"
: "${STATE_DIR:=$K_QA_HOME/state}"
: "${LOG_DIR:=$HOME/Library/Logs/k-skill-qa-bot}"

: "${CODEX_BIN:=codex}"
: "${CODEX_MODEL:=gpt-5.5}"
: "${JUDGE_MODEL:=gpt-5.5}"
: "${CODEX_PROVIDER:=openai}"
: "${TIMEOUT_SECS:=180}"
: "${JUDGE_TIMEOUT_SECS:=60}"

: "${PROXY_URL:=https://k-skill-proxy.nomadamas.org/health}"
: "${GH_REPO:=NomaDamas/k-skill}"

: "${LAST_RUN_MIN_AGE:=259200}"
: "${MAX_PARALLEL:=4}"

: "${CREATE_ISSUES:=false}"

: "${LOCK_STALE_SECS:=7200}"

: "${K_QA_VERBOSE:=0}"

export K_QA_HOME K_SKILL_CLONE STATE_DIR LOG_DIR
export CODEX_BIN CODEX_MODEL JUDGE_MODEL CODEX_PROVIDER TIMEOUT_SECS JUDGE_TIMEOUT_SECS
export PROXY_URL GH_REPO LAST_RUN_MIN_AGE MAX_PARALLEL CREATE_ISSUES
export LOCK_STALE_SECS K_QA_VERBOSE
