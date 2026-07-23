# EV Charger Nearby

## What this skill does

환경부 전기차 충전소 API의 충전소 정보와 충전기 상태를 조회한다. 조회 전용이며 예약, 결제, 회원 인증, 충전 시작/중지는 자동화하지 않는다.

기본 호출은 hosted `k-skill-proxy`를 사용하므로 사용자는 API 키가 필요 없다. `--direct`를 명시한 경우에만 사용자의 `KSKILL_EV_CHARGER_API_KEY`, 이후 `DATA_GO_KR_API_KEY`를 찾는다.

## Official access path

1. 실시간 충전소 정보: 공공데이터포털 데이터셋 `15076352`, `getChargerInfo`
2. 실시간 충전기 상태: 같은 데이터셋의 `getChargerStatus`
3. 정적/수동 fallback: 전국전기차충전소표준데이터 데이터셋 `15013115`의 포털 제공 파일

`15013115`는 실시간 상태 API가 아니다. 포털 다운로드 화면에서 사용자가 직접 받은 표준 CSV를 정적 참고자료로만 사용하며, 문서화되지 않은 CSV URL을 추측하지 않는다.

## Inputs and commands

설치된 skill 디렉터리에서 실행한다.

```bash
python3 scripts/ev_charger.py info --location '서울 강남구' --num-of-rows 10
python3 scripts/ev_charger.py status --stat-id ME000001 --num-of-rows 10
python3 scripts/ev_charger.py status --zcode 11 --limit-yn Y --period 10 --json
```

공통 필터는 `zcode`, `zscode`, `statId`, `chgerId`다. hosted proxy의 `info`는 고유하게 식별되는 `location`을 행정구역 코드로 변환하며, 모호하거나 찾을 수 없는 위치와 충돌하는 명시적 코드는 거부한다. `status`는 `limitYn`과 `period`를 추가로 허용한다. 페이지 기본값은 `pageNo=1`, `numOfRows=10`이며 `numOfRows` 범위는 10~9999다.

직접 호출:

```bash
python3 scripts/ev_charger.py info --zcode 11 --zscode 11680 --direct
python3 scripts/ev_charger.py status --stat-id ME000001 --direct --dry-run
```

직접 호출은 위치 텍스트를 행정구역 코드로 변환하지 않으므로 `--location` 대신 `--zcode`/`--zscode`를 사용한다. `--dry-run`은 URL을 보여주되 키를 `REDACTED`로 가린다.

## Credential rules

- hosted proxy: 사용자 키 불필요
- direct 환경변수 우선순위: `KSKILL_EV_CHARGER_API_KEY` -> `DATA_GO_KR_API_KEY`
- dotenv fallback: `~/.config/k-skill/secrets.env`에서 같은 순서
- 키를 로그, 답변, dry-run URL, 저장소 파일에 노출하지 않는다

공공데이터포털 인증키를 이미 갖고 있어도 데이터셋 `15076352` 상세 페이지에서 **별도 활용신청**이 필요하다. 이 API는 자동승인 대상이지만 승인/활성화가 완료된 뒤 호출해야 한다.

## Workflow and fallback order

1. 위치/지역 요청은 `info`로 충전소 주소, 운영기관, 충전기 유형과 식별자를 찾는다.
2. 찾은 `statId`/`chgerId`로 `status`를 호출해 현재 상태와 갱신시각을 확인한다.
3. live info가 실패하면 동일 조건을 좁혀 한 번 재시도한다.
4. live info는 성공했지만 status가 실패하면 정보 결과를 제공하면서 상태 확인 실패를 분리해 알린다.
5. live API 전체가 불가능할 때만 데이터셋 `15013115`의 사용자가 직접 내려받은 표준 CSV를 정적/수동 fallback으로 안내한다.

## Output

기본은 한국어 요약, `--json`은 프록시/상류 JSON을 출력한다. 가능한 경우 다음 필드를 포함한다.

- 충전소명, 주소, 위치 설명
- 운영기관
- `statId`, `chgerId`
- 충전기 유형과 현재 상태
- 상태 갱신시각

상태 코드는 원문 값을 보존한다. 상태가 없거나 오래된 경우 추정하지 않는다.

## Failure modes

- `upstream_not_configured`: hosted/self-host 프록시에 `DATA_GO_KR_API_KEY`가 없음
- key/auth rejection: 데이터셋 `15076352` 활용신청 승인 여부 확인
- proxy down: 프록시 장애 메시지를 보여주고 잠시 후 재시도
- empty result: 조건을 좁히거나 `zcode`/`zscode`/`statId`를 확인
- invalid/non-JSON/XML response: upstream 응답 오류로 분리하고 결과로 캐시하지 않음
- static CSV fallback: 실시간 상태로 표현하지 않고 파일 기준일을 함께 명시

## Done when

- 충전소 정보와 가능한 현재 상태를 각각 확인했다.
- 정보 조회와 상태 조회의 시점/실패를 구분했다.
- 키, 예약, 결제, 충전 제어를 노출하거나 자동화하지 않았다.
