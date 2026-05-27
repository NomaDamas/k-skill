#!/usr/bin/env bash
# shellcheck shell=bash
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/env.sh
. "$HERE/lib/env.sh"
# shellcheck source=lib/log.sh
. "$HERE/lib/log.sh"

RUN_DIR=""
DRY_RUN=false
while [ $# -gt 0 ]; do
    case "$1" in
        --run-dir) RUN_DIR="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "report-failures.sh: unknown arg: $1" >&2; exit 2 ;;
    esac
done
[ -n "$RUN_DIR" ] || { echo "report-failures.sh: --run-dir <path> required" >&2; exit 2; }

if [ "$CREATE_ISSUES" != "true" ]; then
    DRY_RUN=true
fi

SUMMARY="$RUN_DIR/summary.md"
mkdir -p "$STATE_DIR"
KNOWN="$STATE_DIR/known-failures.json"
[ -f "$KNOWN" ] || echo '{}' > "$KNOWN"

pass=0; fail=0; skip=0
fail_lines=""
skip_lines=""

shopt -s nullglob
for judge in "$RUN_DIR"/results/*.judge.json; do
    name=$(jq -r .name "$judge")
    verdict=$(jq -r .verdict "$judge")
    sclass=$(jq -r .symptom_class "$judge")
    reason=$(jq -r .reason "$judge")
    case "$verdict" in
        pass) pass=$((pass+1)) ;;
        skip)
            skip=$((skip+1))
            skip_lines="${skip_lines}- ${name}: ${reason}"$'\n'
            ;;
        fail|unknown)
            fail=$((fail+1))
            fail_lines="${fail_lines}- ${name} (${sclass}): ${reason}"$'\n'
            ;;
    esac
done

{
    echo "# k-skill-qa-bot run summary"
    echo
    echo "- run dir: \`$RUN_DIR\`"
    echo "- pass: $pass"
    echo "- fail: $fail"
    echo "- skip: $skip"
    echo "- create_issues: $CREATE_ISSUES (dry_run=$DRY_RUN)"
    if [ -n "$fail_lines" ]; then
        echo
        echo "## Failures"
        echo
        printf '%s' "$fail_lines"
    fi
    if [ -n "$skip_lines" ]; then
        echo
        echo "## Skipped"
        echo
        printf '%s' "$skip_lines"
    fi
} > "$SUMMARY"

if [ "$DRY_RUN" = "true" ]; then
    log_info "dry-run: would file $fail issue(s)"
    echo "$SUMMARY"
    exit 0
fi

now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

for judge in "$RUN_DIR"/results/*.judge.json; do
    verdict=$(jq -r .verdict "$judge")
    sclass=$(jq -r .symptom_class "$judge")
    [ "$verdict" != "fail" ] && [ "$verdict" != "unknown" ] && continue

    name=$(jq -r .name "$judge")
    hash=$(jq -r .symptom_hash "$judge")
    reason=$(jq -r .reason "$judge")
    evidence=$(jq -r .evidence_quote "$judge")
    confidence=$(jq -r .confidence "$judge")

    if [ "$verdict" = "unknown" ]; then
        case "$confidence" in
            0|0.0|0.0*|0.1*|0.2*|0.3*|0.4*|0.5*) continue ;;
        esac
    fi

    existing=$(gh issue list --repo "$GH_REPO" --state open \
        --label auto-qa --label "skill:${name}" \
        --json number,body --limit 50 2>/dev/null \
        | jq -r --arg h "$hash" '.[] | select(.body | contains("symptom_hash:" + $h)) | .number' \
        | head -1)

    body=$(printf '<!-- symptom_hash:%s -->\n\n**Last run:** %s\n**Verdict:** %s\n**Symptom:** %s\n**Reason:** %s\n**Confidence:** %s\n\n<details><summary>Evidence</summary>\n\n```\n%s\n```\n\n</details>\n\nSee SKILL.md: https://github.com/%s/blob/main/%s/SKILL.md\n' \
        "$hash" "$now_iso" "$verdict" "$sclass" "$reason" "$confidence" "$evidence" "$GH_REPO" "$name")

    if [ -n "$existing" ]; then
        log_info "comment on issue #${existing} for ${name}"
        echo "$body" | gh issue comment "$existing" --repo "$GH_REPO" --body-file -
    else
        title="[auto-qa] ${name} broken: ${sclass}"
        log_info "create new issue for ${name}"
        echo "$body" | gh issue create --repo "$GH_REPO" --title "$title" \
            --label auto-qa --label "skill:${name}" --label "severity:fail" --body-file -
    fi
done

echo "$SUMMARY"
