# 공식 플러그인 디렉터리 제출

이 문서는 자체 마켓플레이스 설치가 아니라 Anthropic과 OpenAI의 공식 디렉터리 심사를 위한 패키징을 설명합니다. 자동 검증 통과와 정책 심사 승인, 실제 공개는 서로 다른 단계입니다.

## 정본과 제출 폴더

- 기존 설치 정본: 최상위 `<skill>/skill.json`, `instruction.md`, 보조 자산, `packages/k-skill-cli/templates/`.
- 기존 CLI adapter와 `.claude-plugin/marketplace.json`은 변경하지 않습니다.
- 공식 제출 사본: `packages/k-skill-plugin/`. 생성 파일을 직접 수정하지 않습니다.
- 생성기: `scripts/build-official-plugin.js`.
- 제출용 설정 스킬: `scripts/official-plugin/setup.md`. 다른 스킬 설치나 자동 갱신 대신 설치된 플러그인만 점검합니다.

```bash
pnpm run build:official-plugin
pnpm run check:official-plugin
claude plugin validate --strict --profile directory packages/k-skill-plugin
pnpm run ci
```

`--check`는 누락, 내용/실행 권한 차이와 예상 밖 파일을 검사합니다. 생성기는 예상 밖 파일을 자동 삭제하지 않습니다. 더 이상 배포하지 않을 생성 파일은 diff를 확인하고 명시적으로 제거해야 합니다.

## 외부 지침 대신 정적 지침

각 스킬의 generic runtime 규칙과 본문을 빌드 시점에 `SKILL.md`로 조립합니다. 실행 중 원격 `instruct` 출력을 받아 행동 지침을 바꾸거나 다른 스킬 설치를 갱신하지 않습니다. `read`, `path`, `exec`는 패키지 내부 자산만 사용하는 로컬 실행기로 연결합니다. 기존 CLI의 스크립트 실행기 `execute.js`는 변경 없이 복사하며, 원격 지침 조립기는 배포하지 않습니다.

각 스킬이 원래 사용하던 외부 데이터 조회, 공식 사이트 로그인, 패키지 의존성은 정적 문서로 묶었다고 사라지는 것이 아닙니다. 실제 데이터 전송과 로컬 파일 생성은 선택한 기능의 설명, 사용자 요청과 승인 범위에 따라 수행합니다. `.generated.json`에는 포함 파일, 입력 파일 해시와 제외 사유를 기록합니다.

### 현재 제출 범위

기존 132개 스킬 중 공식 사본에는 129개가 포함됩니다. 다음 스킬은 기존 설치에는 그대로 남기고 공식 사본에서만 제외합니다.

- `heyyumi`: 제공자 서버의 최신 행동 규칙을 받아 따라야 합니다. 정적인 사용 규칙과 제공자 승인 범위가 확보되기 전에는 단순히 `guide` 호출을 지워 포함하지 않습니다.
- `korean-privacy-terms`: 업스트림의 인터뷰/렌더링/설치 지침을 런타임에 설치해 따릅니다.
- `korean-jangbu-for`: 업스트림 스킬을 런타임에 설치해 그 절차를 따릅니다.

두 업스트림 wrapper는 pin이 있다고 외부 지침 로딩 제한에서 제외되지 않습니다. 원본 라이선스를 보존한 정적 vendoring과 별도 검토가 선행돼야 합니다.

## Claude 신청

1. [공식 개발자 포털](https://claude.ai/directory/manage)에서 Plugin bundle을 선택합니다.
2. 저장소 `NomaDamas/k-skill`, 플러그인 경로 `packages/k-skill-plugin`, 검토할 브랜치를 지정합니다. 작업 중에는 기능 브랜치, 검토 후에는 승인된 릴리스 브랜치를 사용합니다. 일반 PR의 대상은 `CONTRIBUTING.md`에 따라 `dev`입니다.
3. 공개 GitHub URL로 검증하고 이름, 아이콘, README, 스킬 수와 실제 설치 구성을 확인합니다. 검증은 GitHub 연결 없이도 가능하지만 제출에는 현재 Claude 조직에 연결된 계정의 저장소 push 권한이 필요합니다.
4. 데이터 처리 질문은 기능별 실제 동작에 따라 답합니다. 조회, 로컬 저장, 외부 전송을 구분하며, 프록시의 보관기간을 모든 외부 서비스의 보관기간으로 일반화하지 않습니다.
5. 약관과 개인정보 처리방침의 정확성, 자격증명/코드 실행 관련 확인 문구를 검토합니다. 검증 통과만으로 이 진술이 사실이라고 간주하지 않습니다. 선언된 MCP가 없는 스킬의 로컬 helper 실행과 문구가 충돌하는 경우 Anthropic에 의미를 확인하고, 사실과 다른 확인에 동의하지 않습니다.
6. 신청 내용을 검토하고 권한자의 최종 승인을 받은 후 제출합니다. 승인은 별도이며, 공개도 별도 단계입니다.

정책상 검토 항목(`Policy hold`)은 차단 오류나 거절과 같지 않습니다. 다만 환경변수 인증정보, 패키지 설치, HWP 템플릿 같은 바이너리 등은 심사자가 확인할 수 있습니다. 불필요한 CI/인프라 파일을 번들에서 제외해도 기능 자체의 데이터 흐름 검토는 필요합니다.

아이콘 후보는 [NomaDamas GitHub 조직 프로필](https://github.com/NomaDamas)의 기존 로고를 512x512 PNG로 리사이즈한 것입니다. `scripts/official-plugin/icon.png`가 원본 배포 입력이며, 소스 이미지를 런타임에 내려받지 않습니다. 최종 반영 전에 이 사용도 확인합니다.

아이콘은 최초 저장 또는 제출 때 정해질 수 있으므로 그 전에 확정합니다. 폴더 밖 파일, 심볼릭 링크, 시크릿, 가상환경, 의존성 캐시를 넣지 않습니다. Node.js나 Python 등 로컬 실행이 필요한 기능은 해당 실행 환경을 지원하는 Claude 표면에서 따로 시험해야 합니다.

## OpenAI 신청

[공식 제출 포털](https://platform.openai.com/plugins)로 ZIP을 제출합니다. Claude용 폴더를 만들었다고 OpenAI 호환성이나 승인이 검증된 것은 아닙니다. OpenAI 매니페스트와 메타데이터, 개발자 인증, 데이터 처리방침과 로컬 실행 요건을 별도로 확인해야 합니다.

현재 로컬 helper가 필요한 구조는 OpenAI의 desktop-only 요건을 확인해야 합니다. 루트 Agent Plugins 매니페스트의 `extensions.com.openai.requires_local_executor: true` 또는 호환 매니페스트의 해당 필드가 필요할 수 있습니다. 이 변경만으로 OpenAI 제출을 완료했다고 표시하지 않습니다.

## 참고

- [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
- [Claude 제출 체크리스트](https://claude.com/docs/plugins/pre-submission-checklist)
- [Claude 공식 제출 절차](https://claude.com/docs/plugins/submit)
- [OpenAI 제출 절차](https://developers.openai.com/plugins/deploy/submission)
- [OpenAI desktop-only 플러그인](https://developers.openai.com/plugins/deploy/desktop-only)
