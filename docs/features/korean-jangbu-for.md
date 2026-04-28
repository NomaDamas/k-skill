# 한국 사업자 장부 자동화 가이드

## 이 기능으로 할 수 있는 일

- 카드명세서 PDF, 은행 CSV, 엑셀, 영수증/세금계산서 이미지·PDF를 표준 거래내역으로 정리
- 거래처·MCC·정규식·학습 규칙을 이용한 계정과목 매핑
- 세무용 BS·PL, 세무사 전달 CSV, 종합소득세 준비 체크리스트 생성
- 경영용 현금흐름, cash burn, 카드별 분석, 대시보드 리포트 생성
- 사용자가 직접 발급한 CODEF 키(**BYOK**)로 홈택스·은행·카드 자동 수집 흐름 연결

## 가장 중요한 규칙

본 스킬은 [`kimlawtech/korean-jangbu-for`](https://github.com/kimlawtech/korean-jangbu-for) 업스트림의 **thin wrapper** 이다. 원저작자·관리자는 **[@kimlawtech](https://github.com/kimlawtech) (SpeciAI)** 이며, k-skill 측은 원본 링크, attribution, 설치 진입점, 회계·세무 면책 고지를 책임진다.

이 스킬을 사용한 답변은 반드시 아래를 함께 언급한다.

- 원본: https://github.com/kimlawtech/korean-jangbu-for
- 원저작자: @kimlawtech (SpeciAI)
- 라이선스: Apache-2.0
- 생성물은 참고용 초안이며 공식 회계감사·세무신고를 대체하지 않는다.
- 신고/제출 전 세무사 검토, 외감 대상 법인은 공인회계사 감사가 필요하다.

## 먼저 필요한 것

- 인터넷 연결 (업스트림 clone 용)
- `git`, `bash`, Python 3.11+
- macOS 또는 Linux
- OCR/PDF 처리 의존성 (업스트림 install/verify 흐름이 안내)
- 자동 수집을 사용할 경우 사용자가 직접 발급한 CODEF Client ID/Secret (BYOK)

## 설치 흐름

`~/.claude/skills/korean-jangbu-for/upstream/` 와 `~/.agents/skills/korean-jangbu-for/upstream/` 양쪽에 pinned SHA 로 업스트림을 설치한다. 동시에 업스트림 `skills/jangbu-*` 를 `~/.claude/skills/<skill-name>` 및 `~/.agents/skills/<skill-name>` top-level 경로로 등록해 slash skill discovery 가 중첩 `upstream/` 탐색에 의존하지 않게 한다. `/korean-jangbu-for` 는 wrapper top-level skill 로 유지한다.

```bash
bash korean-jangbu-for/scripts/install.sh
```

설치 확인:

```bash
cat korean-jangbu-for/scripts/upstream.pin
git -C ~/.claude/skills/korean-jangbu-for/upstream rev-parse HEAD
git -C ~/.agents/skills/korean-jangbu-for/upstream rev-parse HEAD
```

세 SHA 가 모두 같고 `~/.agents/skills/jangbu-import/SKILL.md` 같은 top-level 하위 스킬이 존재하면 wrapper 설치가 성공한 것이다. 실제 OCR/MCP 런타임까지 검증해야 할 때는 업스트림 설치 후 verify 를 실행한다.

```bash
bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/install.sh
bash ~/.claude/skills/korean-jangbu-for/upstream/scripts/verify.sh
```

업스트림 installer 는 Claude Code 스킬 symlink 를 등록하므로 wrapper 개발 중이면 실행 후 홈 디렉토리 wrapper 를 다시 sync 한다. 레포 내부에 repo-local `.claude/` 또는 `.agents/` 디렉토리는 만들지 않는다.

## 사용 전 intake

사용자에게 한 번에 1~3문항씩 확인한다.

- 사업자 유형: 개인사업자 / 법인 / 프리랜서 / 복수 사업장
- 목표 산출물: 표준 거래내역 / 계정과목 분류 / 세무사 전달 CSV / BS·PL / 현금흐름·경영 리포트 / 종소세 체크리스트
- 입력 자료: 은행 CSV, 카드 PDF, 엑셀, 영수증 이미지, 세금계산서 PDF, CODEF 자동 수집
- 대상 기간: 월 / 분기 / 연도
- 민감정보 처리: 마스킹 필요 수준, 외부 LLM 경유 허용 여부
- 공식 제출 예정 여부: 세무사 검토 또는 공인회계사 감사 필요성 판단

## upstream 하위 스킬 라우팅

- `/korean-jangbu-for` — 전체 메뉴 라우팅
- `/jangbu-connect` — CODEF API 자격증명 설정(BYOK)
- `/jangbu-import` — 원본 데이터 표준화
- `/jangbu-tag` — 계정과목 매핑
- `/jangbu-tax` — 세무용 BS·PL / 세무사 전달 CSV
- `/jangbu-dash` — 경영 리포트 / 카드별 분석 / 현금흐름
- `/jangbu-jongso` — 종합소득세 준비 체크리스트

## 보안 / 자격증명

CODEF 자동 수집은 BYOK 원칙을 따른다. 사용자가 직접 발급한 Client ID/Secret 만 사용하고, 값은 채팅에 노출하지 않는다. 저장은 업스트림 정책에 따라 macOS Keychain 또는 `~/.jangbu/credentials.env`(0o600) 같은 로컬 저장소에 한정한다. 금융기관 조회, 간편인증, 로그인 등 side-effect 는 사용자의 명시 승인 없이 실행하지 않는다.

## 라이선스 / 출처

- 업스트림: https://github.com/kimlawtech/korean-jangbu-for (Apache-2.0)
- 원저작자·관리자: @kimlawtech (SpeciAI)
- upstream pin 파일: `korean-jangbu-for/scripts/upstream.pin`
- 회계·세무 면책 전문: `korean-jangbu-for/DISCLAIMER.md`
- Apache-2.0 전문: `korean-jangbu-for/LICENSE.upstream`
- attribution notice: `korean-jangbu-for/NOTICE`
