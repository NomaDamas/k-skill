#!/usr/bin/env bash
# shellcheck shell=bash
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/k-skill-qa-bot"
LOG_DIR="$HOME/Library/Logs/k-skill-qa-bot"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_NAME="org.nomadamas.k-skill-qa-bot.plist"

SKIP_LAUNCHD=false
SKIP_CLONE=false
RUN_NOW=false
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-launchd) SKIP_LAUNCHD=true; shift ;;
        --skip-clone)   SKIP_CLONE=true; shift ;;
        --run-now)      RUN_NOW=true; shift ;;
        *) echo "install.sh: unknown arg: $1" >&2; exit 2 ;;
    esac
done

echo "==> Installing k-skill-qa-bot to $DEST"
mkdir -p "$DEST" "$LOG_DIR" "$DEST/state/runs"

rsync -a --delete \
    --exclude 'test/' \
    --exclude '.git/' \
    --exclude '__pycache__/' \
    --exclude '.pytest_cache/' \
    --exclude 'AGENTS.md' \
    --exclude '.sisyphus/' \
    "$SRC/" "$DEST/"

chmod +x "$DEST/bin/"*.sh "$DEST/bin/"*.py 2>/dev/null || true

if [ "$SKIP_CLONE" != true ]; then
    echo "==> Cloning NomaDamas/k-skill (shallow)"
    K_QA_HOME="$DEST" "$DEST/bin/update-clone.sh"
fi

if [ "$SKIP_LAUNCHD" != true ]; then
    echo "==> Installing LaunchAgent"
    mkdir -p "$LAUNCH_AGENTS"
    sed "s|__HOME__|$HOME|g" "$DEST/launchd/$PLIST_NAME" > "$LAUNCH_AGENTS/$PLIST_NAME"
    launchctl bootout "gui/$(id -u)/org.nomadamas.k-skill-qa-bot" 2>/dev/null || true
    if ! launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENTS/$PLIST_NAME"; then
        echo "    bootstrap failed; retrying after extra cleanup"
        launchctl unload "$LAUNCH_AGENTS/$PLIST_NAME" 2>/dev/null || true
        launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENTS/$PLIST_NAME"
    fi
    echo "    LaunchAgent loaded at gui/$(id -u)/org.nomadamas.k-skill-qa-bot"
fi

echo "==> Health check"
"$DEST/bin/health-check.sh" || echo "    (health-check returned nonzero — review output above)"

if [ "$RUN_NOW" = true ]; then
    echo "==> Running QA pass now (--force)"
    "$DEST/bin/run-qa.sh" --force
fi

cat <<EOF

Install complete.

Source:        $SRC
Runtime:       $DEST
Logs:          $LOG_DIR
LaunchAgent:   $LAUNCH_AGENTS/$PLIST_NAME

First run will be in dry-run mode (CREATE_ISSUES=false). To opt in to filing
issues on NomaDamas/k-skill, append \`CREATE_ISSUES=true\` to:

    $DEST/.env

EOF
