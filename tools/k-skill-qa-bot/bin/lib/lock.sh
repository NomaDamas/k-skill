# shellcheck shell=sh

acquire_lock() {
    : "${STATE_DIR:?STATE_DIR must be set (source env.sh first)}"
    : "${LOCK_STALE_SECS:=7200}"
    _lock_dir="${STATE_DIR}/.lock"
    mkdir -p "${STATE_DIR}" 2>/dev/null

    if mkdir "${_lock_dir}" 2>/dev/null; then
        echo "$$" > "${_lock_dir}/pid"
        return 0
    fi

    _lock_pid=""
    [ -f "${_lock_dir}/pid" ] && _lock_pid=$(cat "${_lock_dir}/pid" 2>/dev/null)

    if [ -n "${_lock_pid}" ] && kill -0 "${_lock_pid}" 2>/dev/null; then
        log_warn "lock held by pid ${_lock_pid}; not acquiring"
        return 1
    fi

    _lock_age=0
    if [ -d "${_lock_dir}" ]; then
        _lock_mtime=$(stat -f %m "${_lock_dir}" 2>/dev/null || stat -c %Y "${_lock_dir}" 2>/dev/null || echo 0)
        _now=$(date +%s)
        _lock_age=$(( _now - _lock_mtime ))
    fi

    if [ "${_lock_age}" -ge "${LOCK_STALE_SECS}" ]; then
        log_warn "reclaiming stale lock (age ${_lock_age}s, pid ${_lock_pid:-unknown})"
        _lock_tmp="${STATE_DIR}/.lock.reclaim.$$"
        if mkdir "${_lock_tmp}" 2>/dev/null; then
            echo "$$" > "${_lock_tmp}/pid"
            rm -rf "${_lock_dir}"
            if mv "${_lock_tmp}" "${_lock_dir}" 2>/dev/null; then
                return 0
            fi
            rm -rf "${_lock_tmp}"
        fi
    fi

    log_warn "lock at ${_lock_dir} held; pid=${_lock_pid:-unknown} age=${_lock_age}s"
    return 1
}

release_lock() {
    : "${STATE_DIR:?STATE_DIR must be set}"
    _lock_dir="${STATE_DIR}/.lock"
    if [ -d "${_lock_dir}" ]; then
        _held_pid=""
        [ -f "${_lock_dir}/pid" ] && _held_pid=$(cat "${_lock_dir}/pid" 2>/dev/null)
        if [ -z "${_held_pid}" ] || [ "${_held_pid}" = "$$" ]; then
            rm -rf "${_lock_dir}"
        fi
    fi
}
