# 고속도로 교통량·소통·CCTV 조회

`highway-traffic-status`는 한국도로공사(`data.ex.co.kr`)와 국가교통정보센터 ITS(`openapi.its.go.kr`) 공개 API로 고속도로 실시간 소통·교통량과 CCTV 스트림 메타데이터를 조회하는 stdlib Python helper다.

## 기본 경로

- 실시간 소통/교통량: `GET https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=<key>&type=json`
- CCTV 메타데이터: `GET https://openapi.its.go.kr:9443/cctvInfo?apiKey=<key>&type=ex&cctvType=1&minX=..&maxX=..&minY=..&maxY=..&getType=json`

두 표면 모두 공개 데모 키 `test`로 회원가입 없이 동작한다 (2026-07-21 확인). 공개 엔드포인트이므로 k-skill-proxy를 경유하지 않고 직접 호출한다. 데모 키가 회수되거나 쿼터가 부족하면 개인 키를 발급받아 `KSKILL_EXDATA_API_KEY` / `KSKILL_ITS_API_KEY` 환경변수(또는 `~/.config/k-skill/secrets.env`)로 지정한다.

## 사용 예시

```bash
# 경부선 소통 요약
python3 highway-traffic-status/scripts/highway_traffic.py traffic --route 경부 --text

# 서울TG 구간만, JSON
python3 highway-traffic-status/scripts/highway_traffic.py traffic --keyword 서울 --limit 10

# 판교 근처 CCTV
python3 highway-traffic-status/scripts/highway_traffic.py cctv \
  --min-x 126.9 --max-x 127.2 --min-y 37.3 --max-y 37.6 --text
```

## 허용 입력

| 입력 | 적용 | 제한 |
| --- | --- | --- |
| `--route` | traffic | 노선명 일부 또는 4자리 노선번호, 클라이언트 측 필터 |
| `--keyword` | traffic | 콘존 이름 키워드, 클라이언트 측 필터 |
| `--limit` | traffic | 출력 행 수, 기본 30 |
| `--min-x/--max-x` | cctv | 경도 124~132, min < max |
| `--min-y/--max-y` | cctv | 위도 33~39.5, min < max |
| `--road-type` | cctv | `ex`(기본)/`its`/`all` |

## 응답 해석

- 소통등급: upstream `grade` 1/2/3 → 원활/서행/정체
- 방향: `updownTypeCode` S/N → 상행, E/W → 하행
- CCTV 성공 응답은 `getType=json`이어도 XML이며 helper가 XML을 파싱한다. `url`은 만료될 수 있는 서명 HLS 주소다.

## 실패 처리

- 인증키 오류: exdata는 HTTP 200 + `{"code":"ERROR","message":"인증키가 유효하지 않습니다."}`, ITS는 HTTP 401 + `resultCode 4005` — 모두 typed 오류로 개인 키 발급 안내
- 빈 결과: `result: "empty"` 명시
- 좌표 범위 위반, min≥max: upstream 미호출, 검증 오류 출력
- JSON/XML 파싱 실패, HTTP 오류, 타임아웃: 차단/점검 가능성 안내 후 종료 코드 1
