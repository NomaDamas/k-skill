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

UPSTREAM_REPO="${KOREAN_JANGBU_FOR_UPSTREAM_REPO:-https://github.com/kimlawtech/korean-jangbu-for.git}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PIN_FILE="${SCRIPT_DIR}/upstream.pin"
SKILL_NAME="korean-jangbu-for"
MANAGED_MARKER="k-skill wrapper attribution and disclaimer"

if [[ ! -f "${PIN_FILE}" ]]; then
  echo "[korean-jangbu-for] upstream.pin not found at ${PIN_FILE}" >&2
  exit 1
fi

UPSTREAM_SHA="${KOREAN_JANGBU_FOR_UPSTREAM_SHA:-$(tr -d '[:space:]' <"${PIN_FILE}")}"

if [[ ! "${UPSTREAM_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[korean-jangbu-for] upstream.pin must contain a 40-char git SHA (got: ${UPSTREAM_SHA})" >&2
  exit 1
fi

CACHE_DIR="${HOME}/.cache/k-skill/${SKILL_NAME}"
CLONE_DIR="${CACHE_DIR}/upstream"
UPSTREAM_SUBSKILLS=(
  "jangbu-connect"
  "jangbu-dash"
  "jangbu-import"
  "jangbu-jongso"
  "jangbu-tag"
  "jangbu-tax"
)

sync_dir() {
  local source_dir="$1"
  local target_dir="$2"

  if [[ -e "${target_dir}" || -L "${target_dir}" ]]; then
    rm -rf "${target_dir}"
  fi

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${source_dir}/" "${target_dir}/"
  else
    cp -a "${source_dir}/" "${target_dir}/"
  fi
}

copy_file_if_different() {
  local source_file="$1"
  local target_file="$2"

  if [[ -e "${target_file}" ]] && [[ "$(cd "$(dirname "${source_file}")" && pwd -P)/$(basename "${source_file}")" == "$(cd "$(dirname "${target_file}")" && pwd -P)/$(basename "${target_file}")" ]]; then
    return 0
  fi

  cp "${source_file}" "${target_file}"
}

install_wrapper_payload() {
  local target_dir="$1"

  mkdir -p "${target_dir}/scripts"
  copy_file_if_different "${WRAPPER_DIR}/SKILL.md" "${target_dir}/SKILL.md"
  copy_file_if_different "${WRAPPER_DIR}/LICENSE.upstream" "${target_dir}/LICENSE.upstream"
  copy_file_if_different "${WRAPPER_DIR}/DISCLAIMER.md" "${target_dir}/DISCLAIMER.md"
  copy_file_if_different "${WRAPPER_DIR}/NOTICE" "${target_dir}/NOTICE"
  copy_file_if_different "${WRAPPER_DIR}/scripts/install.sh" "${target_dir}/scripts/install.sh"
  copy_file_if_different "${WRAPPER_DIR}/scripts/upstream.pin" "${target_dir}/scripts/upstream.pin"
  chmod +x "${target_dir}/scripts/install.sh"
}

is_managed_promoted_skill() {
  local target_dir="$1"
  local skill_file="${target_dir}/SKILL.md"

  [[ -f "${skill_file}" ]] && grep -q "${MANAGED_MARKER}" "${skill_file}"
}

assert_promoted_skill_writable() {
  local target_dir="$1"

  if [[ -e "${target_dir}" || -L "${target_dir}" ]]; then
    if [[ "${KOREAN_JANGBU_FOR_OVERWRITE_SKILLS:-}" != "1" ]] && ! is_managed_promoted_skill "${target_dir}"; then
      echo "[korean-jangbu-for] refusing to overwrite unrelated skill: ${target_dir}" >&2
      echo "  Set KOREAN_JANGBU_FOR_OVERWRITE_SKILLS=1 to replace this top-level skill." >&2
      exit 1
    fi
  fi
}

sync_promoted_skill() {
  local source_dir="$1"
  local target_dir="$2"

  assert_promoted_skill_writable "${target_dir}"
  sync_dir "${source_dir}" "${target_dir}"
}

preflight_promoted_skill() {
  local source_dir="$1"
  local target_dir="$2"

  if [[ ! -f "${source_dir}/SKILL.md" ]]; then
    echo "[korean-jangbu-for] missing upstream skill: ${source_dir}/SKILL.md" >&2
    exit 1
  fi

  assert_promoted_skill_writable "${target_dir}"
}

preflight_promoted_skills() {
  local home_skill_dir
  local home_skills_root
  local upstream_skill
  local upstream_skill_dir
  local home_upstream_skill_dir

  for home_skill_dir in "${HOME_DIRS[@]}"; do
    home_skills_root="$(dirname "${home_skill_dir}")"

    for upstream_skill in "${UPSTREAM_SUBSKILLS[@]}"; do
      upstream_skill_dir="${CLONE_DIR}/skills/${upstream_skill}"
      home_upstream_skill_dir="${home_skills_root}/${upstream_skill}"
      preflight_promoted_skill "${upstream_skill_dir}" "${home_upstream_skill_dir}"
    done
  done
}

append_response_policy() {
  local skill_file="$1"

  cat >>"${skill_file}" <<'POLICY'

## k-skill wrapper attribution and disclaimer

This top-level skill is registered by the k-skill `korean-jangbu-for` thin wrapper so agent-compatible runtimes can discover the upstream `jangbu-*` workflows. Preserve the upstream workflow above, but every response that uses this skill must include:

- 원본: https://github.com/kimlawtech/korean-jangbu-for
- 원저작자: **@kimlawtech (SpeciAI)**
- 라이선스: Apache-2.0 (`korean-jangbu-for/LICENSE.upstream`)
- 생성된 장부·재무제표·경영 리포트·세무사 전달 CSV 는 **참고용 초안**이며, **공식 회계감사** 또는 **세무신고** 를 대체하지 않는다.
- 법인세 신고 전에는 **세무사 검토** 가 필요하고, 외감 대상 법인은 **공인회계사 감사** 가 필요하다.
POLICY
}

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

preflight_promoted_skills

for HOME_SKILL_DIR in "${HOME_DIRS[@]}"; do
  HOME_UPSTREAM="${HOME_SKILL_DIR}/upstream"
  HOME_SKILLS_ROOT="$(dirname "${HOME_SKILL_DIR}")"
  if [[ -L "${HOME_SKILL_DIR}" ]]; then
    rm -f "${HOME_SKILL_DIR}"
  fi
  install_wrapper_payload "${HOME_SKILL_DIR}"

  sync_dir "${CLONE_DIR}" "${HOME_UPSTREAM}"

  INSTALLED_SHA="$(git -C "${HOME_UPSTREAM}" rev-parse HEAD)"

  if [[ "${INSTALLED_SHA}" != "${UPSTREAM_SHA}" ]]; then
    echo "[korean-jangbu-for] ${HOME_UPSTREAM} HEAD (${INSTALLED_SHA}) does not match pin (${UPSTREAM_SHA})" >&2
    exit 1
  fi

  echo "[korean-jangbu-for] installed upstream@${UPSTREAM_SHA} -> ${HOME_UPSTREAM}"

  for UPSTREAM_SKILL in "${UPSTREAM_SUBSKILLS[@]}"; do
    UPSTREAM_SKILL_DIR="${CLONE_DIR}/skills/${UPSTREAM_SKILL}"
    HOME_UPSTREAM_SKILL_DIR="${HOME_SKILLS_ROOT}/${UPSTREAM_SKILL}"

    if [[ ! -f "${UPSTREAM_SKILL_DIR}/SKILL.md" ]]; then
      echo "[korean-jangbu-for] missing upstream skill: ${UPSTREAM_SKILL_DIR}/SKILL.md" >&2
      exit 1
    fi

    sync_promoted_skill "${UPSTREAM_SKILL_DIR}" "${HOME_UPSTREAM_SKILL_DIR}"
    append_response_policy "${HOME_UPSTREAM_SKILL_DIR}/SKILL.md"

    echo "[korean-jangbu-for] registered upstream skill /${UPSTREAM_SKILL} -> ${HOME_UPSTREAM_SKILL_DIR}"
  done
done

echo ""
echo "[korean-jangbu-for] done."
echo "  pinned upstream SHA: ${UPSTREAM_SHA}"
echo "  upstream repo:       ${UPSTREAM_REPO}"
echo "  runtime install:     bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/install.sh"
echo "  verify command:      bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/verify.sh"
echo "  namespace note:      Re-run this wrapper installer after upstream runtime install to restore wrapper-managed top-level skills."
echo "  subskills:           /korean-jangbu-for /jangbu-connect /jangbu-import /jangbu-tag /jangbu-tax /jangbu-dash /jangbu-jongso"
echo "  원저작자: @kimlawtech (SpeciAI) — 응답마다 원본 링크와 함께 언급해야 한다."
echo "  생성물은 참고용 초안이며 공식 회계감사·세무신고를 대체하지 않는다."
echo "  법인세 신고 전 세무사 검토, 외감 대상은 공인회계사 감사가 필요하다."
