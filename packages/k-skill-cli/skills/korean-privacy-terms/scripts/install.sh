#!/usr/bin/env bash
#
# korean-privacy-terms upstream installer.
#
# k-skill 측은 얇은 wrapper 만 유지하고, 인터뷰/렌더/설치 로직은 업스트림
# kimlawtech/korean-privacy-terms (Apache-2.0) 에 위임한다. 이 스크립트는
# scripts/upstream.pin 에 기록된 커밋 SHA 를 두 홈 디렉토리 스킬 경로
#
#   ~/.claude/skills/korean-privacy-terms/upstream/
#   ~/.agents/skills/korean-privacy-terms/upstream/
#
# 아래에 동일하게 체크아웃해 둔다. 레포 내부에 업스트림을 커밋하지 않으므로
# 실사용 전에는 반드시 이 스크립트를 한 번 실행해야 한다.
#
# 사용법:
#   bash korean-privacy-terms/scripts/install.sh
#
# AGENTS.md 규칙에 따라 ~/.claude/skills 와 ~/.agents/skills 는 홈 디렉토리 구조
# 의 indirection(예: ~/.agents/skills 가 symlink 인 경우) 을 존중한다. 레포
# 내부에 repo-local .claude/ 또는 .agents/ 디렉토리는 생성하지 않는다.

set -euo pipefail

UPSTREAM_REPO="https://github.com/kimlawtech/korean-privacy-terms.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIN_FILE="${SCRIPT_DIR}/upstream.pin"
SKILL_NAME="korean-privacy-terms"

if [[ ! -f "${PIN_FILE}" ]]; then
  echo "[korean-privacy-terms] upstream.pin not found at ${PIN_FILE}" >&2
  exit 1
fi

UPSTREAM_SHA="$(tr -d '[:space:]' <"${PIN_FILE}")"

if [[ ! "${UPSTREAM_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[korean-privacy-terms] upstream.pin must contain a 40-char git SHA (got: ${UPSTREAM_SHA})" >&2
  exit 1
fi

CACHE_DIR="${HOME}/.cache/k-skill/${SKILL_NAME}"
CLONE_DIR="${CACHE_DIR}/upstream"

mkdir -p "${CACHE_DIR}"

if [[ ! -d "${CLONE_DIR}/.git" ]]; then
  echo "[korean-privacy-terms] cloning upstream into ${CLONE_DIR}"
  if ! git clone --filter=blob:none "${UPSTREAM_REPO}" "${CLONE_DIR}" >&2; then
    echo "" >&2
    echo "[korean-privacy-terms] upstream clone failed (network required)." >&2
    echo "  upstream: ${UPSTREAM_REPO}" >&2
    echo "  오프라인 환경에서는 이 스킬의 생성 흐름을 실행할 수 없다." >&2
    echo "  네트워크를 확보한 뒤 다시 실행해달라." >&2
    exit 1
  fi
fi

echo "[korean-privacy-terms] syncing upstream to pinned SHA ${UPSTREAM_SHA}"
git -C "${CLONE_DIR}" fetch --tags origin "${UPSTREAM_SHA}" >&2 || git -C "${CLONE_DIR}" fetch origin >&2
git -C "${CLONE_DIR}" checkout --force --detach "${UPSTREAM_SHA}" >&2

HEAD_SHA="$(git -C "${CLONE_DIR}" rev-parse HEAD)"

if [[ "${HEAD_SHA}" != "${UPSTREAM_SHA}" ]]; then
  echo "[korean-privacy-terms] HEAD (${HEAD_SHA}) does not match pinned SHA (${UPSTREAM_SHA})" >&2
  exit 1
fi

# Dual-install targets. Both paths respect AGENTS.md indirection rules and do not
# introduce repo-local skill directories.
HOME_DIRS=(
  "${HOME}/.claude/skills/${SKILL_NAME}"
  "${HOME}/.agents/skills/${SKILL_NAME}"
)

for HOME_SKILL_DIR in "${HOME_DIRS[@]}"; do
  HOME_UPSTREAM="${HOME_SKILL_DIR}/upstream"
  mkdir -p "${HOME_SKILL_DIR}"

  if [[ -e "${HOME_UPSTREAM}" || -L "${HOME_UPSTREAM}" ]]; then
    rm -rf "${HOME_UPSTREAM}"
  fi

  # rsync-style copy preserves the git metadata so `git -C <path> rev-parse HEAD`
  # still reports the pinned SHA after install. Prefer rsync when available;
  # otherwise fall back to `cp -a` which is portable on macOS and Linux.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${CLONE_DIR}/" "${HOME_UPSTREAM}/"
  else
    cp -a "${CLONE_DIR}/" "${HOME_UPSTREAM}/"
  fi

  INSTALLED_SHA="$(git -C "${HOME_UPSTREAM}" rev-parse HEAD)"

  if [[ "${INSTALLED_SHA}" != "${UPSTREAM_SHA}" ]]; then
    echo "[korean-privacy-terms] ${HOME_UPSTREAM} HEAD (${INSTALLED_SHA}) does not match pin (${UPSTREAM_SHA})" >&2
    exit 1
  fi

  echo "[korean-privacy-terms] installed upstream@${UPSTREAM_SHA} -> ${HOME_UPSTREAM}"
done

echo ""
echo "[korean-privacy-terms] done."
echo "  pinned upstream SHA: ${UPSTREAM_SHA}"
echo "  upstream repo:       ${UPSTREAM_REPO}"
echo "  이 스킬이 생성하는 모든 문서는 참고용 초안이며 법률 자문이 아니다."
echo "  실서비스 배포 전 반드시 변호사 검토를 받아달라."
