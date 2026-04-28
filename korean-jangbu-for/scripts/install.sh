#!/usr/bin/env bash
#
# korean-jangbu-for upstream installer.
#
# k-skill 측은 얇은 wrapper 만 유지하고, 장부 자동화 구현은 업스트림
# kimlawtech/korean-jangbu-for (Apache-2.0, @kimlawtech / SpeciAI) 에 위임한다.
# 이 스크립트는 scripts/upstream.pin 에 기록된 커밋 SHA 를 두 홈 디렉토리
# 스킬 경로 아래에 동일하게 체크아웃한다.
#
#   ~/.claude/skills/korean-jangbu-for/upstream/
#   ~/.agents/skills/korean-jangbu-for/upstream/
#
# 사용법:
#   bash korean-jangbu-for/scripts/install.sh

set -euo pipefail

UPSTREAM_REPO="https://github.com/kimlawtech/korean-jangbu-for.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIN_FILE="${SCRIPT_DIR}/upstream.pin"
SKILL_NAME="korean-jangbu-for"

if [[ ! -f "${PIN_FILE}" ]]; then
  echo "[korean-jangbu-for] upstream.pin not found at ${PIN_FILE}" >&2
  exit 1
fi

UPSTREAM_SHA="$(tr -d '[:space:]' <"${PIN_FILE}")"

if [[ ! "${UPSTREAM_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[korean-jangbu-for] upstream.pin must contain a 40-char git SHA (got: ${UPSTREAM_SHA})" >&2
  exit 1
fi

CACHE_DIR="${HOME}/.cache/k-skill/${SKILL_NAME}"
CLONE_DIR="${CACHE_DIR}/upstream"

mkdir -p "${CACHE_DIR}"

if [[ ! -d "${CLONE_DIR}/.git" ]]; then
  echo "[korean-jangbu-for] cloning upstream into ${CLONE_DIR}"
  if ! git clone --filter=blob:none "${UPSTREAM_REPO}" "${CLONE_DIR}" >&2; then
    echo "" >&2
    echo "[korean-jangbu-for] upstream clone failed (network required)." >&2
    echo "  upstream: ${UPSTREAM_REPO}" >&2
    echo "  오프라인 환경에서는 이 스킬의 장부 자동화 흐름을 실행할 수 없다." >&2
    exit 1
  fi
fi

echo "[korean-jangbu-for] syncing upstream to pinned SHA ${UPSTREAM_SHA}"
git -C "${CLONE_DIR}" fetch --tags origin "${UPSTREAM_SHA}" >&2 || git -C "${CLONE_DIR}" fetch origin >&2
git -C "${CLONE_DIR}" checkout --force --detach "${UPSTREAM_SHA}" >&2

HEAD_SHA="$(git -C "${CLONE_DIR}" rev-parse HEAD)"

if [[ "${HEAD_SHA}" != "${UPSTREAM_SHA}" ]]; then
  echo "[korean-jangbu-for] HEAD (${HEAD_SHA}) does not match pinned SHA (${UPSTREAM_SHA})" >&2
  exit 1
fi

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

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${CLONE_DIR}/" "${HOME_UPSTREAM}/"
  else
    cp -a "${CLONE_DIR}/" "${HOME_UPSTREAM}/"
  fi

  INSTALLED_SHA="$(git -C "${HOME_UPSTREAM}" rev-parse HEAD)"

  if [[ "${INSTALLED_SHA}" != "${UPSTREAM_SHA}" ]]; then
    echo "[korean-jangbu-for] ${HOME_UPSTREAM} HEAD (${INSTALLED_SHA}) does not match pin (${UPSTREAM_SHA})" >&2
    exit 1
  fi

  echo "[korean-jangbu-for] installed upstream@${UPSTREAM_SHA} -> ${HOME_UPSTREAM}"
done

echo ""
echo "[korean-jangbu-for] done."
echo "  pinned upstream SHA: ${UPSTREAM_SHA}"
echo "  upstream repo:       ${UPSTREAM_REPO}"
echo "  runtime install:     bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/install.sh"
echo "  verify command:      bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/verify.sh"
echo "  원저작자: @kimlawtech (SpeciAI) — 응답마다 원본 링크와 함께 언급해야 한다."
echo "  생성물은 참고용 초안이며 공식 회계감사·세무신고를 대체하지 않는다."
echo "  법인세 신고 전 세무사 검토, 외감 대상은 공인회계사 감사가 필요하다."
