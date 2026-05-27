#!/usr/bin/env bash
# shellcheck shell=bash
set -eu

DEST="$HOME/.local/share/k-skill-qa-bot"
LOG_DIR="$HOME/Library/Logs/k-skill-qa-bot"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_NAME="org.nomadamas.k-skill-qa-bot.plist"

YES=false
PURGE=false
PURGE_LOGS=false
SKIP_LAUNCHD=false
while [ $# -gt 0 ]; do
    case "$1" in
        --yes) YES=true; shift ;;
        --purge) PURGE=true; shift ;;
        --purge-logs) PURGE_LOGS=true; shift ;;
        --skip-launchd) SKIP_LAUNCHD=true; shift ;;
        *) echo "uninstall.sh: unknown arg: $1" >&2; exit 2 ;;
    esac
done

if [ "$YES" != true ]; then
    printf "Uninstall k-skill-qa-bot? Removes binaries + LaunchAgent. [y/N] "
    read -r ans
    [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "aborted."; exit 0; }
fi

if [ "$SKIP_LAUNCHD" != true ]; then
    launchctl bootout "gui/$(id -u)/org.nomadamas.k-skill-qa-bot" 2>/dev/null || true
    rm -f "$LAUNCH_AGENTS/$PLIST_NAME"
fi

for sub in bin config launchd README.md AGENTS.md install.sh uninstall.sh Makefile .gitignore; do
    rm -rf "${DEST:?}/$sub"
done

if [ "$PURGE" = true ]; then
    rm -rf "${DEST:?}/state" "${DEST:?}/k-skill-clone" "${DEST:?}/.env"
fi

if [ "$PURGE_LOGS" = true ]; then
    rm -rf "${LOG_DIR:?}"
fi

if [ -d "$DEST" ]; then
    rmdir "$DEST" 2>/dev/null || true
fi

echo "Uninstalled."
