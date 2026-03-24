# k-skill

한국인을 위한, 한국인에 의한, 한국인의 에이전트 스킬 모음집.

이 레포는 `skills` CLI로 설치 가능한 멀티-스킬 패키지다. 목표는 "한국인이라면 바로 쓸만한 자동화"를 가장 얇은 레이어로 묶는 것이다. v1은 이미 공개된 CLI, 패키지, 공식 Open API 위에 얹을 수 있는 것부터 빠르게 출발한다.

## Why

- `awesome list`처럼 소비되지만 실제로는 바로 실행 가능한 스킬 묶음으로 보이게 만들기
- 한국 로컬 서비스에 특화된 사용처로 차별화하기
- 큰 제품을 만들기 전에 virality가 나오는지 빠르게 검증하기

## v1 skills

- `srt-booking`: SRT 조회, 예매, 예약 확인, 취소
- `ktx-booking`: KTX/Korail 조회, 예매, 예약 확인, 취소
- `kbo-results`: 특정 날짜 KBO 경기 결과 조회
- `lotto-results`: 로또 최신 회차, 특정 회차, 번호 대조
- `seoul-subway-arrival`: 서울 지하철 실시간 도착 정보 조회

## Install

레포 전체에서 설치 가능한 스킬을 먼저 확인:

```bash
npx --yes skills add <owner/repo> --list
```

원하는 스킬만 선택 설치:

```bash
npx --yes skills add <owner/repo> --skill srt-booking --skill kbo-results
```

로컬 경로로 테스트 설치:

```bash
npx --yes skills add . --list
```

## Security policy

인증이 필요한 스킬은 평문 비밀번호, 직접 입력, `.env` 평문 파일을 금지한다.

- 필수: `1Password CLI (op)`
- 권장 실행 방식: `op run --env-file=.env.op -- <command>`
- 상세 정책: [`docs/security-and-secrets.md`](/Users/jeffrey/Projects/k-skill/docs/security-and-secrets.md)
- 예시 템플릿: [`examples/.env.op.example`](/Users/jeffrey/Projects/k-skill/examples/.env.op.example)

## Development

스킬 구조 검증:

```bash
bash scripts/validate-skills.sh
```

## Roadmap

다음 후보는 v1 뒤로 미뤘다.

- 네이버 스마트스토어 검색/주문
- 다나와 가격 비교
- 카카오톡 조회/전송
- HWP 문서 편집
- 당근 자동 거래

이유는 대체로 셋 중 하나다.

- 공개 CLI가 아직 약하다
- 공식 API auth/setup이 무겁다
- 자동화 안정성보다 계정 리스크가 크다

자세한 메모는 [`docs/roadmap.md`](/Users/jeffrey/Projects/k-skill/docs/roadmap.md)에 둔다.
