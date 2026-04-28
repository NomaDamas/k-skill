---
name: korean-jangbu-for
description: kimlawtech/korean-jangbu-for (Apache-2.0) 업스트림을 중심으로 한국 스타트업·1인 법인·프리랜서·개인사업자 장부 자동화와 사업자 세무 자료 정리, 원본 데이터 가져오기, 계정과목 태깅, 세무사 전달 CSV, 경영 리포트 생성을 안내하는 thin wrapper 스킬.
license: Apache-2.0
metadata:
  category: finance
  locale: ko-KR
  phase: v1
---

# Korean Jangbu For (thin wrapper)

## What this skill does

[`kimlawtech/korean-jangbu-for`](https://github.com/kimlawtech/korean-jangbu-for) (Apache-2.0) 업스트림을 중심으로 한국 사업자 장부 자동화 흐름을 안내한다. 원저작자·관리자는 **[@kimlawtech](https://github.com/kimlawtech) (SpeciAI)** 이며, k-skill 측은 원본 발견·설치 진입점·출처/면책 고지·agent-neutral 사용 절차만 유지하는 **얇은 wrapper** 다.

업스트림은 카드명세서 PDF, 은행 CSV, 엑셀 장부, 영수증/세금계산서 이미지·PDF를 표준 거래내역으로 정리하고, 계정과목 매핑, 세무용 BS/PL, 경영용 현금흐름·cash burn 리포트, 세무사 전달 CSV 생성을 목표로 한다.

**중요:** 이 스킬을 사용할 때 모든 답변에는 원본 링크 `https://github.com/kimlawtech/korean-jangbu-for` 와 원저작자 **@kimlawtech (SpeciAI)** 를 반드시 멘션한다.

## When to use

- "사업자 장부 자동화해줘"
- "카드 명세서 PDF를 장부로 바꿔줘"
- "은행 CSV랑 영수증으로 세무사 전달 자료 만들어줘"
- "개인사업자/프리랜서 종소세 준비 체크리스트 만들어줘"
- "장부 데이터를 계정과목으로 분류하고 경영 리포트 만들어줘"
- "CODEF 키로 홈택스·은행·카드 내역 자동 수집 설정하고 싶어"

## When not to use

- 공식 회계감사, 세무신고 대행, 기장대리, 절세 자문 자체를 요청하는 경우 → 세무사/공인회계사 상담을 안내한다.
- 사용자가 자격증명 입력, 간편인증, 금융기관 로그인 등 side-effect 를 명시적으로 승인하지 않은 상태.
- 정식 외부 제출용 재무제표·공시자료를 자동 산출물만으로 확정하려는 경우.
- 한국 사업자 장부가 아닌 해외 회계 기준(IFRS/US GAAP 등) 중심 작업.

## Prerequisites

- 인터넷 연결 (업스트림 clone 용)
- `git` 2.20+
- `bash`
- Python 3.11+
- macOS 또는 Linux
- OCR/PDF 처리를 위한 업스트림 의존성 (install.sh 가 안내/설치)
- 자동 수집을 쓰는 경우: 사용자가 직접 발급한 CODEF Client ID/Secret (**BYOK**)

## Install (dual-install)

업스트림을 `~/.claude/skills/korean-jangbu-for/upstream/` 와 `~/.agents/skills/korean-jangbu-for/upstream/` 양쪽에 pinned SHA 로 체크아웃한다. 또한 업스트림 `skills/jangbu-*` 를 양쪽 홈 디렉터리의 top-level skill 로 등록해 `/jangbu-connect`, `/jangbu-import`, `/jangbu-tag`, `/jangbu-tax`, `/jangbu-dash`, `/jangbu-jongso` 라우팅이 agent-compatible 런타임에서도 발견되게 한다. `/korean-jangbu-for` 는 이 wrapper 의 top-level skill 로 유지한다. 레포 내부에는 업스트림 payload 를 커밋하지 않는다.

홈 디렉터리 wrapper 에는 `SKILL.md`, `scripts/install.sh`, `scripts/upstream.pin`, `LICENSE.upstream`, `DISCLAIMER.md`, `NOTICE` 를 함께 설치한다. Promoted `jangbu-*` top-level 경로에 사용자가 만든 다른 스킬이 이미 있으면 installer 는 덮어쓰지 않고 중단한다. wrapper 가 이전에 설치한 managed 스킬만 자동 갱신하며, 의도적으로 교체해야 할 때만 `KOREAN_JANGBU_FOR_OVERWRITE_SKILLS=1` 을 설정한다.

```bash
bash korean-jangbu-for/scripts/install.sh
```

레포를 로컬에 clone 하지 않고 이미 홈 디렉토리 스킬 번들만 가진 상태에서도 설치할 수 있다:

```bash
bash ~/.claude/skills/korean-jangbu-for/scripts/install.sh
# 또는
bash ~/.agents/skills/korean-jangbu-for/scripts/install.sh
```

설치 확인:

```bash
cat korean-jangbu-for/scripts/upstream.pin
git -C ~/.claude/skills/korean-jangbu-for/upstream rev-parse HEAD
git -C ~/.agents/skills/korean-jangbu-for/upstream rev-parse HEAD
```

세 SHA 가 모두 같으면 wrapper 설치가 성공한 것이다. 업스트림 런타임 의존성까지 검증해야 할 때만 아래를 이어서 실행한다. 업스트림 `scripts/install.sh` 는 Claude Code 스킬 symlink 를 등록하므로, k-skill wrapper 개발 중이면 실행 후 wrapper 디렉토리를 다시 sync 한다.

```bash
bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/install.sh
bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/verify.sh
```

오프라인 환경에서는 upstream clone 이 실패하므로 실행할 수 없다.

## Mandatory intake first

사용자가 장부 자동화나 세무사 전달 자료 생성을 요청하면 바로 파일을 만들지 말고 먼저 아래를 확인한다. 한 번에 1~3문항씩, 사용자가 모르면 "넘어가도 됩니다" 로 열어 둔다.

- 사업자 유형: 개인사업자 / 법인 / 프리랜서 / 복수 사업장
- 목표 산출물: 표준 거래내역 / 계정과목 분류 / 세무사 전달 CSV / BS·PL / 현금흐름·경영 리포트 / 종소세 체크리스트
- 입력 자료: 은행 CSV, 카드 PDF, 엑셀, 영수증 이미지, 세금계산서 PDF, 홈택스·은행·카드 자동 수집(CODEF)
- 기간과 통화: 대상 월/분기/연도, KRW 외 통화 여부
- 민감정보 처리: 원본 보관 위치, 마스킹 필요 수준, 외부 LLM 경유 허용 여부
- 자동 수집 사용 여부: CODEF BYOK 준비 여부, 인증/로그인/간편인증은 사용자가 직접 승인해야 함
- 공식 제출 예정 여부: 세무사 검토 / 공인회계사 감사 필요성을 함께 확인

## Workflow

1. 위 intake 로 목표와 입력 자료를 확정한다.
2. `bash korean-jangbu-for/scripts/install.sh` 로 업스트림을 dual-install 한다.
3. 사용 목적에 맞게 업스트림 스킬을 선택한다:
   - `/korean-jangbu-for` — 전체 메뉴 라우팅
   - `/jangbu-connect` — CODEF API 자격증명 설정(BYOK, 홈택스·은행·카드 자동 수집)
   - `/jangbu-import` — 원본 데이터(엑셀·CSV·이미지·PDF) → 표준 거래내역
   - `/jangbu-tag` — 표준 거래내역 → 계정과목 매핑
   - `/jangbu-tax` — 세무용 BS·PL / 세무사 전달 CSV
   - `/jangbu-dash` — 경영용 현금흐름·대시보드·카드별 분석
   - `/jangbu-jongso` — 종합소득세 준비 체크리스트 및 홈택스 다운로드 경로 안내
4. 민감정보는 업스트림의 Level 2 마스킹 원칙을 따른다. 사업자번호·주민번호·카드번호·계좌번호·account_id 는 토큰화/마스킹한 뒤 LLM fallback 에 전달한다.
5. 자동 수집은 CODEF BYOK 원칙을 따른다. 자격증명은 macOS Keychain 또는 `~/.jangbu/credentials.env`(0o600) 같은 로컬 저장소에만 두며, 사용자의 명시 승인 없이 외부 인증·금융 조회를 실행하지 않는다.
6. 완료 보고에는 아래 Response policy 의 고정 블록을 반드시 포함한다.

## Response policy

모든 답변 말미에 아래 정보를 포함한다.

- 원본: https://github.com/kimlawtech/korean-jangbu-for
- 원저작자: **@kimlawtech (SpeciAI)**
- 라이선스: Apache-2.0 (`korean-jangbu-for/LICENSE.upstream`)
- 생성된 장부·재무제표·경영 리포트·세무사 전달 CSV 는 **참고용 초안**이며, **공식 회계감사** 또는 **세무신고** 를 대체하지 않는다.
- 법인세·종합소득세 신고 전 **세무사 검토** 가 필요하고, 외감 대상 법인은 **공인회계사 감사** 가 필요하다.

## Done when

- 목표 산출물, 입력 자료, 사업자 유형, 기간, 민감정보 처리 수준이 확인되었다.
- `scripts/install.sh` 이 업스트림을 dual-install 했고 양쪽 `upstream/` 경로가 `scripts/upstream.pin` 과 같은 SHA 를 가리킨다.
- 업스트림 `skills/jangbu-*` 가 `~/.claude/skills/<skill-name>` 및 `~/.agents/skills/<skill-name>` top-level 경로에 등록되어 slash skill discovery 가 가능하다.
- 업스트림의 해당 하위 스킬(`/jangbu-import`, `/jangbu-tag`, `/jangbu-tax`, `/jangbu-dash`, `/jangbu-jongso`, `/jangbu-connect`) 흐름을 사용했다.
- 사용자가 공식 제출/신고 목적이라고 밝힌 경우 세무사 검토 또는 공인회계사 감사 필요성을 명시했다.
- 최종 답변에 원본 링크, 원저작자 @kimlawtech (SpeciAI), Apache-2.0, 회계·세무 면책 고지가 포함되었다.

## Failure modes

- 네트워크 차단: upstream clone/pin checkout 실패 → 네트워크 확보 후 `scripts/install.sh` 재실행.
- Python/OCR 의존성 실패: 업스트림 `scripts/verify.sh` 출력 기준으로 Python 3.11+, poppler, Vision/PaddleOCR 환경을 점검.
- CODEF 인증 실패: 사용자의 BYOK 자격증명과 간편인증 상태를 확인하되, 자격증명 값을 채팅에 노출하지 않는다.
- OCR 오인식/분류 신뢰도 낮음: 원본 파일과 표준 거래내역을 사용자에게 검토시키고, 자동 확정하지 않는다.
- 공식 제출이 필요한 경우: 자동 산출물을 최종본으로 단정하지 말고 세무사/공인회계사 검토 단계로 넘긴다.

## Notes

- upstream pin: `korean-jangbu-for/scripts/upstream.pin`
- upstream disclaimer: `korean-jangbu-for/DISCLAIMER.md`
- upstream license copy: `korean-jangbu-for/LICENSE.upstream`
- attribution notice: `korean-jangbu-for/NOTICE`
- k-skill 루트 `LICENSE` 는 이 저장소 wrapper 의 기본 라이선스이고, 이 스킬 하위 upstream 자료는 Apache-2.0 고지와 재배포 조건을 따른다.
