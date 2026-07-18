# 전기차 충전소 위치·상태 조회

`ev-charger-nearby`는 환경부 전기차 충전소 API로 충전소 기본 정보와 충전기 상태를 조회하는 stdlib Python helper다.

## 기본 경로

- hosted proxy: `https://k-skill-proxy.nomadamas.org`
- 정보: `GET /v1/ev-charger/info`
- 상태: `GET /v1/ev-charger/status`
- upstream: `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo`, `getChargerStatus`
- 공공데이터포털 데이터셋: `15076352`

hosted proxy 사용자는 키가 필요 없다. self-host 운영자는 `DATA_GO_KR_API_KEY`를 서버에만 둔다. 직접 호출은 `KSKILL_EV_CHARGER_API_KEY`를 먼저 사용하고, 없으면 `DATA_GO_KR_API_KEY`를 사용한다.

공공데이터포털 키가 이미 있어도 데이터셋 `15076352`의 **활용신청은 별도**로 해야 한다. 자동승인 대상이지만 서비스가 키에 활성화된 이후에만 호출된다.

## 사용 예시

```bash
python3 ev-charger-nearby/scripts/ev_charger.py info --location '서울 강남구'
python3 ev-charger-nearby/scripts/ev_charger.py status --stat-id ME000001 --json
python3 ev-charger-nearby/scripts/ev_charger.py status --zcode 11 --limit-yn Y --period 10
```

직접 호출과 안전한 미리보기:

```bash
export KSKILL_EV_CHARGER_API_KEY=your-key
python3 ev-charger-nearby/scripts/ev_charger.py info --zcode 11 --zscode 11680 --direct
python3 ev-charger-nearby/scripts/ev_charger.py status --stat-id ME000001 --direct --dry-run
```

hosted proxy는 고유한 `location`을 `zcode`/`zscode`로 변환하고, 모호하거나 찾을 수 없는 위치와 충돌하는 명시적 코드를 거부한다. 직접 호출은 위치 텍스트 변환을 지원하지 않으므로 `--zcode`/`--zscode`를 사용한다. `--dry-run` 출력에는 실제 키가 나오지 않는다.

## 허용 입력

| 입력 | 적용 | 제한 |
| --- | --- | --- |
| `pageNo` | 공통 | 기본 1, 양의 정수 |
| `numOfRows` | 공통 | 기본 10, 10~9999 |
| `zcode` | 공통 | 2자리 시도 코드 |
| `zscode` | 공통 | 5자리 시군구 코드 |
| `statId` | 공통 | 충전소 ID, 최대 40자 |
| `chgerId` | 공통 | 충전기 ID, 최대 10자 |
| `location` | proxy info | 고유한 행정구역 위치, 최대 100자 |
| `limitYn` | status | `Y` 또는 `N` |
| `period` | status | 1~10 정수 |

caller가 보낸 `serviceKey`와 `dataType`은 거부한다. 프록시가 서버 키와 `dataType=JSON`을 강제한다.

## Fallback

1. `getChargerInfo` live 정보 조회
2. 찾은 식별자로 `getChargerStatus` live 상태 조회
3. live API가 불가능할 때만 공공데이터포털 전국전기차충전소표준데이터 `15013115`를 정적/수동 참고자료로 사용

표준데이터 fallback은 포털에서 사용자가 직접 내려받은 CSV만 사용한다. 숨겨진 다운로드 URL을 추측하지 않으며, CSV의 기준일을 현재 상태처럼 표현하지 않는다.

## 실패 처리

- 잘못된 정수, 길이, `Y/N`, operation별 미지원 필터: `400`, upstream 미호출
- 프록시 키 미설정: `503 upstream_not_configured`
- 활용신청/인증 거부, XML gateway error, semantic error: `502`, 캐시하지 않음
- 빈 본문, invalid JSON, 예상하지 않은 XML: `502`, 캐시하지 않음
- 성공적으로 파싱된 semantic response만 캐시
