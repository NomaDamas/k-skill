# Manus.ai 에서 k-skill 사용하기

Manus.ai 의 **"GitHub에서 프로젝트 스킬 가져오기"** 기능으로 이 저장소의 스킬을 그대로 가져올 수 있다. k-skill 의 모든 스킬은 이미 Manus 가 요구하는 포맷(루트 디렉토리 + `SKILL.md` + YAML frontmatter `name` / `description`)을 만족하므로, 별도 변환 없이 **개별 스킬 폴더 URL** 만 붙여 넣으면 된다.

---

## TL;DR — 어떤 URL을 붙여 넣어야 하나

❌ 저장소 루트 URL은 동작하지 않는다 (루트에는 `SKILL.md` 가 없다).

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

---

## 가져오기 절차

1. Manus 에서 **"+ 추가"** 또는 **스킬 가져오기** 화면을 연다.
2. **GitHub 탭**을 선택한다 (스크린샷의 GitHub 아이콘이 있는 패널).
3. URL 입력란에 위 형식의 **스킬 폴더 URL** 을 붙여 넣는다.
4. **가져오기** 버튼을 누른다.
5. 같은 방법으로 추가로 쓰고 싶은 스킬을 폴더 단위로 하나씩 가져온다.

> 한 번에 여러 스킬을 가져오는 일괄 import 는 Manus 가 공식 지원하지 않는다. 필요한 스킬만 골라서 폴더 URL 을 한 개씩 등록하면 된다.

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

- Manus 공식 도움말: <https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus>
- Manus 스킬 문서: <https://manus.im/docs/features/skills>
- 멀티 스킬 모노레포 예시(폴더별 import): <https://github.com/WebWakaHub/manus-agency-skills>
