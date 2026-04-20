# 한국 개인정보처리방침·이용약관 자동 생성 가이드

## 이 기능으로 할 수 있는 일

- Next.js (13 ~ 16) App Router 프로젝트에 **개인정보처리방침 페이지** 생성
- 동일 프로젝트에 **이용약관 페이지** 생성 (공정위 전자상거래 표준약관 제10023호 기반)
- shadcn/ui 기반 **쿠키 배너**, **회원가입 동의 모달**, **라벨링 카드** 컴포넌트 설치
- 서비스 유형(SaaS · 쇼핑몰 · 커뮤니티 · 블로그 · 핀테크 · AI) 별 분기
- 한국어 / 영문 / 한영 병기 출력 (GDPR 관할 추가 시 EU 분기 지원)

## 가장 중요한 규칙

본 스킬은 [`kimlawtech/korean-privacy-terms`](https://github.com/kimlawtech/korean-privacy-terms) (Apache-2.0) 업스트림의 **thin wrapper** 이다. k-skill 측은 발견 · 인용 · 법률 면책 · 설치 진입점만 책임지고, 인터뷰 · 렌더 · 파일 생성 로직은 업스트림에 위임한다.

생성되는 모든 문서는 **참고용 초안**이며 **법률 자문이 아니다**. 실서비스 배포 전 반드시 **변호사 검토**를 받아야 한다. 2026.9.11 시행 개정 개인정보보호법 기준(§30 법정 항목 확장, 과징금 매출액 최대 10%, 사업주 책임)이 업스트림 pin 시점으로 반영돼 있으며, 이후 개정 반영은 upstream pin 을 bump 해 갱신한다.

## 먼저 필요한 것

- 인터넷 연결 (업스트림 clone 용; 오프라인 환경에서는 동작하지 않는다)
- `git` 2.20+
- `bash`
- `node` 18+ (업스트림이 권장하는 Next.js 실행 요건)
- 대상 프로젝트가 Next.js 13 ~ 16 App Router 기반 (Pages Router 단독 프로젝트는 업스트림이 실행 중단)

## 설치 흐름

dual-install: `~/.claude/skills/korean-privacy-terms/upstream/` 와 `~/.agents/skills/korean-privacy-terms/upstream/` 양쪽에 pinned SHA 로 업스트림을 체크아웃한다.

```bash
bash korean-privacy-terms/scripts/install.sh
```

설치 확인:

```bash
git -C ~/.claude/skills/korean-privacy-terms/upstream rev-parse HEAD
git -C ~/.agents/skills/korean-privacy-terms/upstream rev-parse HEAD
cat korean-privacy-terms/scripts/upstream.pin
```

세 값이 모두 동일한 40자리 SHA 여야 한다. AGENTS.md 규칙에 따라 레포 내부에 repo-local `.claude/` 또는 `.agents/` 디렉토리는 생성하지 않는다. `~/.agents/skills` 가 symlink 로 관리되는 환경에서는 그 indirection 을 존중한다.

## upstream pin 갱신

법령 개정 / 업스트림 CHANGELOG 업데이트가 반영되면 `korean-privacy-terms/scripts/upstream.pin` 을 최신 tag SHA 로 수동 교체한 뒤 PR 을 올린다.

```bash
git ls-remote --tags https://github.com/kimlawtech/korean-privacy-terms.git
```

새 SHA 를 `upstream.pin` 에 덮어쓰고 `bash korean-privacy-terms/scripts/install.sh` 를 다시 실행해 양쪽 홈 경로가 새 SHA 로 갱신되는지 확인한다. pin 만 올리지 말고 upstream CHANGELOG 를 함께 읽어 법률 개정 포인트를 PR 본문에 기록한다.

## 인터뷰 게이트 (필수)

사용자가 "개인정보처리방침 만들어줘" 처럼 생성을 요청하면 바로 파일을 만들지 말고 업스트림 `scripts/interview.md` 프로토콜을 따라 **먼저 되묻는다**. 최소한 아래를 확인한 뒤 생성 단계로 넘어간다.

- 대상 사용자 범위 — 한국만 / 해외 위주 / 양쪽 글로벌 (관할법 결정)
- 운영 주체 소재지 — 한국 / 해외
- 서비스 유형 — SaaS / 쇼핑몰 / 커뮤니티 / 블로그 / 핀테크 / AI
- Next.js 버전 (13 ~ 16), App Router 여부, `.ts` / `.js`
- Tailwind 버전 (v3 / v4), 번들러 (Turbopack / Webpack)
- shadcn/ui 기설치 여부, 기존 디자인 시스템
- 출력 언어 (한국어만 / 영문만 / 한영 병기)
- 14세 미만 대상 여부
- 자동화된 결정(AI) · 행태정보(쿠키) · 맞춤형 광고 처리 여부
- 사업자 상호 · 대표자 · 주소, 개인정보 보호책임자(CPO) 정보

인터뷰는 agent-neutral 톤으로 한 번에 1 ~ 2문항씩 진행하고, 법률 공포감(과태료 폭탄 등) 유발 표현은 피한다. 모르는 항목은 "넘어가도 됩니다" 로 연다.

## 응답 정책

이 스킬이 실행한 모든 답변은 아래 고정 블록을 끝에 포함한다.

- 생성된 문서는 **참고용 초안**이며 법률 자문이 아니다.
- 실서비스 적용 전 **변호사 검토**가 필수이다.
- 2026.9.11 시행 개정 개인정보보호법 기준은 업스트림 pin 시점에 반영되었다. 이후 개정에 대한 최신 반영 여부는 사용자에게 확인 책임이 있다.
- 법정 필수 11개 항목(처리 목적 · 처리 항목 · 처리/보유 기간 · 파기 · 정보주체 권리 · 보호책임자 · 안전조치 · 방침 변경 · 열람/정정/삭제/처리정지 요구권 · 열람청구 부서 · 권익침해 구제) 중 하나라도 누락돼선 안 된다.
- 2025.4.21 개정 작성지침 반영 항목(전송요구권 · 자동화된 결정 · 행태정보 · 고충처리 부서)도 해당되면 반드시 포함한다.

## 라이선스 / 출처

- 업스트림: https://github.com/kimlawtech/korean-privacy-terms (Apache-2.0)
- upstream pin 파일: `korean-privacy-terms/scripts/upstream.pin`
- 업스트림 저자 · 커뮤니티 attribution: `korean-privacy-terms/NOTICE` (@kimlawtech, SpeciAI community)
- 법률 면책 전문 (한 / 영): `korean-privacy-terms/DISCLAIMER.md`
- Apache-2.0 전문 (업스트림 `LICENSE` verbatim 복사): `korean-privacy-terms/LICENSE.upstream` — Apache License, Version 2.0 §4(a) 는 재배포자가 "give any other recipients of the Work or Derivative Works a copy of this License" 하도록 요구한다. `install.sh` 실행 전에도 레포 체크아웃 상태에서 이 요건이 충족되도록 번들해 두었다.
- 레포 루트 `LICENSE` (MIT) 는 k-skill 자체 라이선스이며 이 스킬 하위에는 적용되지 않는다. 본 스킬은 업스트림 산출물의 재배포이므로 Apache License, Version 2.0 §4 요건 (LICENSE 번들, NOTICE 포함, 수정 고지) 을 준수한다.
