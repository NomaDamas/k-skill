# k-skill CLI pilot plan

## 문제

- 122개 `SKILL.md`가 동일한 runtime contract를 물리적으로 복제하고 있어 정책 변경 시 122곳을 동기화해야 한다.
- instruction 업데이트가 스킬 재설치 없이는 전파되지 않는다.
- raw `SKILL.md`만 설치하는 도구에서는 `scripts/`·`references/`가 누락된다.
- 돌쇠/비돌쇠 분기 instruction이 한 파일에 공존해 컨텍스트를 낭비한다.

## 솔루션

`@nomadamas/k-skill` npm CLI가 instruction 조립과 helper 파일 제공을 담당하고,
Vercel Agent Skills(`SKILL.md`)는 CLI로 연결되는 **얇은 어댑터(stub)** 로 유지한다.

```
SKILL.md (stub)                    ← 발견/선택용 name+description + CLI 실행 유도 + 안전선
  └─ npx -y @nomadamas/k-skill@0 instruct <skill>
       ├─ 런타임 감지 (DOLSHOI_ACTION_BROKER_URL, CLOAKBROWSER_PEEK_TOKEN)
       ├─ profile block 조립 (감지된 모드의 블록만 출력)
       └─ 스킬 고유 instruction.md 출력
  └─ npx -y @nomadamas/k-skill@0 files <skill>
       └─ 패키지에 동봉된 scripts/·references/ 로컬 경로 출력
```

## Single source 구조

스킬별 소스는 각 스킬 폴더 아래에 둔다.

```
<skill>/
  skill.json        # name, description, metadata, profiles  ← single source
  instruction.md    # 스킬 고유 워크플로우 (공통 블록 없음)
  scripts/          # (있으면) helper — CLI 패키지에 번들됨
  references/       # (있으면) 레퍼런스 — CLI 패키지에 번들됨
  SKILL.md          # 생성물: scripts/generate-skill-stubs.js 가 생성. 직접 수정 금지

packages/k-skill-cli/
  bin/k-skill.js    # instruct | files | list
  src/detect.js     # 런타임 감지
  src/assemble.js   # profile block + instruction 조립
  templates/        # profile block 원본 (아래 taxonomy)
  skills/           # 빌드 시 스킬 소스 sync (npm 배포물)
```

## Profile taxonomy

`skill.json`의 `profiles` 배열로 선언한다. 조립 순서는 core → 선언 순서.

| profile | 의미 | 주입되는 블록 |
|---|---|---|
| `core` | (항상) | 능력 기반 런타임 감지, lookup 너머 실행 계속, `clarify` 승인 경계, 보안 통제 우회 금지 |
| `proxy` | k-skill-proxy 필요 | hosted 기본 URL, `KSKILL_PROXY_BASE_URL`, self-host 안내 |
| `browser` | browser-use 동반 | 돌쇠: CloakBrowser 우선 / generic: k-skill-browser-runtime → Aside/BrowserOS/CDP |
| `vault` | 로그인/secret 필수 | 돌쇠: vault-run → request_vault_credential / generic: env → host vault → secrets.env |
| `action:booking` | 예약·좌석·결제 | 좌석 확보=완수 보고, 결제는 `clarify` 후 진행 |
| `action:commerce` | 장바구니·주문·결제 | 장바구니 가역 단계, 주문 직전 `clarify` |
| `action:submission` | 신청·신고·제출 | 폼/첨부 준비, 제출 직전 `clarify` |
| `action:account` | 계정 상태 변경 | 공식 표면이 지원하는 범위만 |
| `action:recruiting` | 기업 인재검색 | shortlist, 유료 열람/제안 직전 `clarify` |
| `legal` | 법률·정부 공식 절차 | 로그인·인증·서류 준비, 법적 효과 직전 `clarify` |
| `operations` | k-skill 운영 | 설치·업데이트·복구·런타임 연결 후 검증 |
| `lookup` | 조회 전용 | 조회 완수 기준, 후속 행동은 공식 표면 연결 |

블록 내부는 `<<always>>` / `<<dolshoi>>` / `<<generic>>` 마커로 분기하고,
CLI는 감지된 모드의 블록만 출력한다 (컨텍스트 절약).

## Stub 불변 규칙 (안전선)

CLI 실패(오프라인·npm 불가) 시에도 stub에 정적으로 남는 최소 규칙:

- 결제·전송·최종 제출·취소·게시는 직전 사용자 승인 없이 실행 금지
- credential을 채팅으로 요구·출력 금지
- 법률·CAPTCHA·본인인증·전자서명 경계 우회 금지

stub은 major 버전 고정(`@0`)으로 CLI를 호출한다. breaking 변경은 stub 재배포로만 전파한다.

## 배포·보안

- npm 이름: `@nomadamas/k-skill` (unscoped `k-skill`은 제3자 보안 placeholder가 선점)
- trusted publishing/OIDC + provenance로 배포 (CONTRIBUTING.md 기존 정책 준수)
- CI: 조립 스냅샷 테스트로 릴리스마다 최종 instruction diff가 리뷰에 노출됨
- staleness 검증: `generate-skill-stubs.js --check`, `sync-skills.js --check`를 CI에서 실행

## 전환 범위

122개 top-level 스킬 전체가 `skill.json` + `instruction.md` source와 생성된
`SKILL.md` CLI stub 구조를 사용한다. 유형별 profile과 completion target은
`docs/runtime-action-audit.md`에서 관리한다.

## 검증 계획

1. `k-skill instruct <skill>` — generic env / 돌쇠 시뮬레이션 env 각각에서 조립 결과 확인
2. `k-skill files kosis-stats` — 번들된 scripts 경로로 helper `--help` 실행
3. stub 오프라인 시나리오 — 안전선 3규칙이 stub만으로 노출되는지 확인
4. `npm run ci` 전체 통과
