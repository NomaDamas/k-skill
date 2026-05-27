# shellcheck shell=sh

_k_qa_log_timestamp() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

_k_qa_log_caller() {
    _name=$0
    if [ -n "${BASH_VERSION-}" ]; then
        eval 'if [ -n "${BASH_SOURCE[1]-}" ]; then _name=${BASH_SOURCE[1]##*/}; fi'
    fi
    printf '%s\n' "${_name##*/}"
}

_k_qa_log_emit() {
    _lvl=$1
    shift
    _caller=$(_k_qa_log_caller)
    _ts=$(_k_qa_log_timestamp)
    printf '%s  %-5s  [%s]  %s\n' "$_ts" "$_lvl" "$_caller" "$*" >&2
}

log_info()  { _k_qa_log_emit INFO  "$@"; }
log_warn()  { _k_qa_log_emit WARN  "$@"; }
log_error() { _k_qa_log_emit ERROR "$@"; }
log_debug() {
    if [ "${K_QA_VERBOSE:-0}" != 0 ]; then
        _k_qa_log_emit DEBUG "$@"
    fi
}

log_capture() {
    _out=$1
    shift
    if [ "${1-}" = "--" ]; then
        shift
    fi
    _err=$(mktemp)
    "$@" 2>"$_err" | tee "$_out"
    _rc=$?
    while IFS= read -r _line || [ -n "$_line" ]; do
        log_error "$_line"
    done <"$_err"
    rm -f "$_err"
    return "$_rc"
}
