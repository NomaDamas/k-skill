# Manus.ai 에서 k-skill 사용하기

Manus.ai 는 스킬을 가져오는 두 가지 공식 경로를 제공한다. k-skill 의 모든 스킬은 이미 Manus 가 요구하는 포맷(루트 디렉토리 + `SKILL.md` + YAML frontmatter `name` / `description`)을 만족하므로, 변환 없이 둘 다 사용할 수 있다.

| 방법 | 언제 쓰면 좋은가 | 한 번에 등록되는 스킬 수 |
| --- | --- | --- |
| **A. GitHub URL 가져오기** | 원하는 스킬이 1~3 개 정도일 때 | 1 |
| **B. `.skill` 파일 업로드** | 여러 스킬을 한꺼번에 받아두고 골라서 올리고 싶을 때 | 1 (드래그-드롭은 동시에 여러 개 선택 가능) |

> Manus 는 **하나의 아카이브로 여러 스킬을 한꺼번에 등록하는 기능은 공식 지원하지 않는다.** 어느 경로든 "스킬 한 개 = 업로드 한 번" 이다. 다만 방법 B 의 드래그-드롭 업로드는 여러 `.skill` 파일을 한 번에 선택해 빠르게 반복할 수 있다.

---

## 방법 A — GitHub URL 가져오기

### TL;DR

❌ 저장소 루트 URL 은 동작하지 않는다 (루트에는 `SKILL.md` 가 없다).

```
https://github.com/NomaDamas/k-skill
```

✅ 가져오려는 **개별 스킬 폴더** URL 을 붙여 넣는다.

```
https://github.com/NomaDamas/k-skill/tree/main/<skill-name>
```

예시:

```
https://github.com/NomaDamas/k-skill/tree/main/mfds-food-safety
https://github.com/NomaDamas/k-skill/tree/main/srt-booking
https://github.com/NomaDamas/k-skill/tree/main/korea-weather
https://github.com/NomaDamas/k-skill/tree/main/real-estate-search
```

각 스킬 폴더에는 Manus 가 요구하는 `SKILL.md` 가 루트에 존재하고, 필요하면 `scripts/`, `references/`, `templates/` 같은 부속 리소스가 같이 들어 있다.

### 절차

1. Manus 에서 **"+ 추가"** 또는 **스킬 가져오기** 화면을 연다.
2. **GitHub 탭**을 선택한다.
3. URL 입력란에 위 형식의 **스킬 폴더 URL** 을 붙여 넣는다.
4. **가져오기** 버튼을 누른다.
5. 추가로 쓰고 싶은 스킬은 폴더 단위로 같은 절차를 반복한다.

---

## 방법 B — `.skill` 번들 업로드 (여러 스킬을 빠르게)

GitHub URL 을 한 번에 하나씩 붙여 넣는 게 귀찮다면, 미리 빌드된 `.skill` 파일들을 한꺼번에 받아 두고 Manus 의 파일 업로드로 드래그-드롭하는 게 더 빠르다.

### 빠른 경로 — 미리 빌드된 번들 다운로드 (권장)

`main` 에 변경이 들어올 때마다 GitHub Actions 가 자동으로 모든 스킬을 패키징해서 rolling pre-release `manus-bundle-latest` 에 올린다. 클론도 빌드도 필요 없다.

- **합본 (권장)**: <https://github.com/NomaDamas/k-skill/releases/download/manus-bundle-latest/k-skill-manus-all.zip>
- **스킬 목록 (어떤 게 들어 있는지 미리 확인)**: <https://github.com/NomaDamas/k-skill/releases/download/manus-bundle-latest/INDEX.md>
- **릴리스 페이지**: <https://github.com/NomaDamas/k-skill/releases/tag/manus-bundle-latest>

> 위 URL 은 매 `main` 푸시마다 같은 자리에서 새 번들로 교체된다. 항상 최신 상태가 보장된다.

업로드 절차:

1. `k-skill-manus-all.zip` 을 받아 압축을 푼다. 한 폴더에 `<skill-name>.skill` 파일들이 펼쳐진다.
2. Manus 에서 **스킬 업로드 / 파일 추가** 화면을 연다.
3. 원하는 `<skill-name>.skill` 파일을 드래그-드롭하거나 파일 선택으로 업로드한다. 파일 선택 다이얼로그에서 여러 파일을 한꺼번에 골라도 된다.
4. Manus 가 파일 하나당 스킬 하나씩 등록한다.

### 직접 빌드 (개발자용)

저장소를 수정 중이거나 main 에 아직 머지되지 않은 변경을 테스트하고 싶다면 로컬에서 직접 빌드한다.

```bash
git clone https://github.com/NomaDamas/k-skill.git
cd k-skill
npm install
npm run build:manus-bundle
```

빌드가 끝나면 다음 산출물이 생긴다.

```
dist/manus/
├── <skill-name>.skill        # 스킬 1개당 .skill 파일 1개 (총 60+ 개)
├── k-skill-manus-all.zip     # 위 .skill 파일들을 한 번에 받기 위한 편의 번들
└── INDEX.md                  # 포함된 스킬 목록과 설명
```

> `.skill` 파일은 사실상 ZIP 아카이브이며, 내부에는 단일 최상위 폴더 `<skill-name>/`(SKILL.md + 보조 리소스)가 들어 있다. 이 레이아웃은 Anthropic 의 공식 [skill-creator packager](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/package_skill.py) 와 동일하다.

직접 빌드에 필요한 것:

- Node.js 18+
- 시스템 `zip` 명령 (macOS 와 대부분의 Linux 배포판은 기본 설치, Ubuntu 에서 누락 시 `sudo apt-get install -y zip`)

---

## 호환성 메모

- k-skill 의 모든 스킬은 `name`, `description` 을 YAML frontmatter 최상위에 두고 있다. 이 두 필드는 Manus 가 요구하는 **유일한 필수 필드**이므로 호환성을 위해 추가로 수정할 항목이 없다.
- 기존 `license`, `metadata.category`, `metadata.locale`, `metadata.phase` 같은 필드는 Manus 가 인식하지 않더라도 무시되며, Claude Code / Codex / OpenCode 등 다른 코딩 에이전트에서는 그대로 사용된다.
- `scripts/`, `references/`, `templates/` 같은 보조 디렉토리는 Manus 의 progressive disclosure 규칙과 동일하게 동작한다.

---

## 사용자 인증과 프록시

Manus 환경에서 k-skill 을 쓸 때도 본 저장소의 **사용자 로그인 / 시크릿 정책**을 그대로 따른다.

- "사용자 로그인 필요" 로 표시된 스킬(예: `srt-booking`, `ktx-booking`, `toss-securities`)은 Manus 세션 안에서 사용자가 직접 자격 증명을 제공해야 한다.
- "불필요" 로 표시된 스킬은 공개 API 또는 운영자가 관리하는 `k-skill-proxy` 를 그대로 사용한다. Manus 측에서 별도 키를 받지 않는다.
- 자세한 정책은 [`docs/security-and-secrets.md`](security-and-secrets.md) 와 [`docs/features/k-skill-proxy.md`](features/k-skill-proxy.md) 참고.

---

## 출처

- Manus 공식 도움말 (업로드/공유 방법): <https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus>
- Manus 스킬 문서: <https://manus.im/docs/features/skills>
- Manus 공개 API (스킬 목록): <https://open.manus.ai/docs/v2/list-skills>
- `.skill` 패키징 레퍼런스 (Anthropic skill-creator): <https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/package_skill.py>
- 폴더별 import 모노레포 예시: <https://github.com/WebWakaHub/manus-agency-skills>
