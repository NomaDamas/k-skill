---
name: korean-privacy-terms
description: kimlawtech/korean-privacy-terms (Apache-2.0) 업스트림을 경유해 Next.js 프로젝트에 한국 법령(개인정보보호법·약관규제법·전자상거래법) 기반 개인정보처리방침·이용약관·쿠키 배너·동의 모달을 생성하는 thin wrapper 스킬.
license: Apache-2.0
metadata:
  category: legal
  locale: ko-KR
  phase: v1
---

# Korean Privacy & Terms (thin wrapper)

## What this skill does

[`kimlawtech/korean-privacy-terms`](https://github.com/kimlawtech/korean-privacy-terms) (Apache-2.0) 업스트림을 사용해 한국 법령 기반 **개인정보처리방침·이용약관·쿠키 배너·회원가입 동의 모달** 생성을 수행한다. k-skill 측은 **얇은 wrapper** 만 유지하고, 실제 인터뷰/렌더/설치 로직은 업스트림에 위임한다.

반영 기준은 업스트림이 관리한다:

- 개인정보위원회 처리방침 작성지침 (2025.4.21)
- 개정 개인정보보호법 (2026.3 공포, 2026.9.11 시행, 과징금 매출액 최대 10%)
- 공정거래위원회 전자상거래 표준약관 제10023호
- EU GDPR / ePrivacy (업스트림 v2.0+ 지원)

이 스킬이 생성하는 모든 문서는 **참고용 초안**이며 **법률 자문이 아니다**. 실서비스 배포 전 반드시 **변호사 검토**가 필요하다.

## When to use

- "개인정보처리방침 만들어줘"
- "이용약관 추가해줘"
- "쿠키 배너 붙여줘"
- "회원가입 동의 모달 필요해"
- "행태정보 고지 추가해줘"
- "개인정보 동의 UI 깎아줘"

## When not to use

- 실제 법률 자문 · 소송 전략 · 개별 약관 분쟁 판단이 필요한 경우 → 변호사 상담
- 한국/EU 외 관할(미국 CCPA · 일본 APPI · 중국 PIPL 등) 을 단독으로 다뤄야 하는 경우 (업스트림 로드맵)
- Next.js App Router 가 아닌 환경 (업스트림이 Pages Router 미지원)

## Prerequisites

- 인터넷 연결 (업스트림 clone 용)
- `git` 2.20+
- `bash`
- 대상 프로젝트가 Next.js 13 ~ 16 App Router 기반일 것 (업스트림 제약)

## Install (dual-install)

업스트림을 `~/.claude/skills/korean-privacy-terms/upstream/` 와 `~/.agents/skills/korean-privacy-terms/upstream/` 양쪽에 pinned SHA 로 체크아웃한다. 레포 내부에 업스트림 payload 를 커밋하지 않으므로 실사용 전 반드시 이 단계를 거친다.

```bash
bash korean-privacy-terms/scripts/install.sh
```

레포를 로컬에 clone 하지 않고 이미 홈 디렉토리 스킬 번들만 가진 상태에서도 설치할 수 있다 (installer 는 `${BASH_SOURCE[0]}` 로 절대경로를 해석하므로 cwd 에 구애받지 않는다):

```bash
bash ~/.claude/skills/korean-privacy-terms/scripts/install.sh
# 또는
bash ~/.agents/skills/korean-privacy-terms/scripts/install.sh
```

스크립트는 `korean-privacy-terms/scripts/upstream.pin` 에 기록된 40자리 커밋 SHA 만 체크아웃한다. 두 경로 모두에서 `git -C <path> rev-parse HEAD` 가 pin 과 동일해야 설치 성공.

오프라인 환경이나 네트워크 차단 상황에서는 업스트림 clone 이 실패하므로 이 스킬의 생성 흐름을 실행할 수 없다. 스크립트가 명시적인 실패 메시지를 남기고 비정상 종료한다.

## Mandatory interview first

사용자가 "개인정보처리방침 만들어줘" 같은 생성 요청을 하면 **바로 파일을 만들지 말고 먼저 되묻는다.** 업스트림 `scripts/interview.md` Step 0 ~ 9 의 인터뷰 프로토콜을 따라 순차로 질문하되, 최소한 아래 항목을 확인한 뒤 생성 단계로 넘어간다.

권장 첫 질문 묶음:

- 대상 사용자 범위 (한국 사용자만 / 해외 위주 / 양쪽 글로벌) — 관할법 결정
- 운영 주체 소재지 (한국 / 해외)
- 서비스 유형 (SaaS / 쇼핑몰 / 커뮤니티 / 블로그 / 핀테크 / AI 서비스)
- Next.js 버전 (13 ~ 16), App Router 사용 여부, 언어 (`.ts` / `.tsx` / `.js` / `.jsx`)
- Tailwind 버전 (v3 / v4), 번들러 (Turbopack / Webpack)
- shadcn/ui 기설치 여부, 기존 디자인 시스템 (Tailwind 순정 / Chakra / MUI / Mantine 등)
- 출력 언어 (한국어만 / 영문만 / 한영 병기)
- 14세 미만 대상 여부
- 자동화된 결정(AI) · 행태정보(쿠키) · 맞춤형 광고 처리 여부
- 개인정보 보호책임자(CPO) 정보, 사업자 상호·대표자·주소 (사용자가 알려줘야 함)

인터뷰는 특정 에이전트의 전용 UI 컴포넌트 호출(질문 위젯 등) 에 의존하지 않는 agent-neutral 톤으로, 한 번에 1 ~ 2문항씩 진행한다. 법률 공포감(과태료 폭탄 등)을 유발하는 표현은 피하고, "법적으로 필요한 부분이에요" 정도의 담담한 톤을 유지한다. 모르는 항목은 "넘어가도 됩니다" 로 열어 둔다.

## Workflow

1. 사용자가 트리거 문구를 말하면 먼저 위 인터뷰 게이트를 실행한다.
2. `bash korean-privacy-terms/scripts/install.sh` 로 업스트림을 dual-install 한다 (이미 설치돼 있으면 pin 확인만 한다).
3. 업스트림이 제공하는 순서를 따른다: `scripts/interview.md` → `scripts/render.md` → `scripts/install.md`.
4. 업스트림은 Next.js 감지 → MDX/shadcn 의존성 설치 → 템플릿 치환 → `src/app/privacy/page.tsx` · `src/app/terms/page.tsx` · `src/components/legal/*` 등 파일 생성 → 법정 필수 11개 항목 검증 → 면책 주석 삽입 을 순차 실행한다.
5. 생성이 끝나면 사용자에게 보고하되, 아래 **Response policy** 의 고정 블록을 반드시 포함한다.

## CLI examples

```bash
cat korean-privacy-terms/scripts/upstream.pin

bash korean-privacy-terms/scripts/install.sh

git -C ~/.claude/skills/korean-privacy-terms/upstream rev-parse HEAD
git -C ~/.agents/skills/korean-privacy-terms/upstream rev-parse HEAD
```

## Response policy

- 생성된 문서는 **참고용 초안**이며 법률 자문이 아니라는 점을 **모든 답변 말미**에 고지한다.
- 실서비스 적용 전 반드시 **변호사 검토**가 필요함을 고정 문구로 출력한다.
- 2026.9.11 시행 개정 개인정보보호법의 §30 법정 항목, 과징금 상향(매출액 10%), 사업주 책임 등이 업스트림 pin 시점 기준으로 반영돼 있음을 알린다. 이후 개정에 대한 최신 반영 여부는 사용자에게 확인 책임이 있다고 명시한다.
- "등" 으로 뭉뚱그리는 표현, 법정 필수 11개 항목 누락, 면책 주석 제거, 사용자 확인 없이 회사명·책임자명을 추측해 채워넣는 행위는 금지된다 (업스트림 규칙).
- 14세 미만 대상 서비스에 성인용 방침을 그대로 적용하지 않는다.

## Done when

- 인터뷰 게이트가 실행되어 최소 jurisdiction · 서비스 유형 · Next.js 버전 · App Router 여부 · 출력 언어 가 확인되었다.
- `scripts/install.sh` 이 업스트림을 dual-install (`~/.claude/skills/korean-privacy-terms/upstream/` + `~/.agents/skills/korean-privacy-terms/upstream/`) 했고, 양쪽 경로 모두 pin 과 동일한 SHA 이다.
- 업스트림 `scripts/interview.md` → `scripts/render.md` → `scripts/install.md` 순서로 생성이 끝났다.
- 법정 필수 11개 항목 검증과 면책 주석 삽입이 업스트림 규칙대로 완료되었다.
- 사용자에게 참고용 초안 + 법률 자문 아님 + 변호사 검토 필수 + 2026.9.11 개정 반영 기준이 함께 고지되었다.

## Failure modes

- 오프라인 또는 네트워크 차단: `scripts/install.sh` 가 upstream clone 단계에서 실패한다. 네트워크 확보 후 재실행.
- pin SHA 가 업스트림에서 삭제/force-push 된 경우: 스크립트가 SHA mismatch 로 비정상 종료한다. `scripts/upstream.pin` 을 최신 태그 SHA 로 bump 하고 PR 을 만든다.
- Next.js Pages Router 단독 프로젝트: 업스트림이 실행을 중단한다. 사용자에게 App Router 전환이 선행 조건임을 안내한다.
- 법률 개정 드리프트: 업스트림이 CHANGELOG 로 반영 기준을 관리한다. pin 만 올리지 말고 업스트림 CHANGELOG 를 함께 확인한다.

## Notes

- upstream: https://github.com/kimlawtech/korean-privacy-terms (Apache-2.0)
- upstream pin: [`scripts/upstream.pin`](./scripts/upstream.pin)
- installer: [`scripts/install.sh`](./scripts/install.sh)
- 법률 면책 전문: [`./DISCLAIMER.md`](./DISCLAIMER.md)
- upstream 저자·커뮤니티 attribution: [`./NOTICE`](./NOTICE) (@kimlawtech, SpeciAI)
- Apache-2.0 전문 (업스트림 `LICENSE` verbatim): [`./LICENSE.upstream`](./LICENSE.upstream) — Apache License, Version 2.0 §4(a) ("give any other recipients of the Work or Derivative Works a copy of this License") 준수를 위해 `install.sh` 실행 전에도 레포 트리에 번들해 둔다. 레포 루트의 [`../LICENSE`](../LICENSE) (MIT) 는 k-skill 자체 라이선스이며 이 스킬 상부에 적용되지 않는다.
- 본 스킬은 업스트림 산출물의 재배포에 해당하므로 Apache License, Version 2.0 §4 요건 (LICENSE 번들, NOTICE 포함, 라이선스 고지) 을 준수한다.
- 중첩 `SKILL.md` 안내: `install.sh` 실행 후 `~/.claude/skills/korean-privacy-terms/upstream/SKILL.md` 가 존재하게 되지만, Claude Code / Codex / Vercel Agent Skills 등 에이전트 플랫폼은 top-level `SKILL.md` 만 discovery 대상으로 삼는다. 중첩 업스트림 `SKILL.md` 는 직접 호출되지 않는다.
