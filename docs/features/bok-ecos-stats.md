# 한국은행 ECOS 경제통계 조회

`bok-ecos-stats`는 한국은행 ECOS Open API로 기준금리·환율·물가·통화량 등 중앙은행 경제통계를 조회하는 stdlib Python helper다.

## 기본 경로

- `GET https://ecos.bok.or.kr/api/<Service>/<key>/json/kr/<start>/<end>/<segments...>` — positional URL, 쿼리스트링 없음
- 서비스: `StatisticSearch`(시계열), `StatisticTableList`(카탈로그), `StatisticItemList`(항목), `KeyStatisticList`(100대 지표), `StatisticWord`(용어사전)

공개 데모 키 `sample`로 무가입 동작한다 (2026-07-21 확인, 호출당 최대 10행). 공개 엔드포인트이므로 k-skill-proxy를 경유하지 않는다. 더 많은 행이 필요하면 https://ecos.bok.or.kr/api 에서 무료 키를 발급받아 `KSKILL_BOK_ECOS_API_KEY` 환경변수(또는 `~/.config/k-skill/secrets.env`)로 지정한다.

## 사용 예시

```bash
# 기준금리 시계열
python3 bok-ecos-stats/scripts/bok_ecos.py search --alias 기준금리 --start 20260101 --end 20260721 --text

# 최신 핵심지표 (환율/금리/물가)
python3 bok-ecos-stats/scripts/bok_ecos.py key --limit 10 --text

# 통계표 탐색 → 항목 → 시계열
python3 bok-ecos-stats/scripts/bok_ecos.py tables --text
python3 bok-ecos-stats/scripts/bok_ecos.py items --stat-code 722Y001 --text
python3 bok-ecos-stats/scripts/bok_ecos.py search --stat-code 722Y001 --cycle D --start 20260101 --end 20260721 --item-code 0101000
```

## 허용 입력

| 입력 | 적용 | 제한 |
| --- | --- | --- |
| `--alias` | search | `기준금리`/`원달러환율`/`소비자물가지수`/`M2`/`국고채3년` |
| `--stat-code` | search/items | 영숫자·`_.-`만 허용 (URL 세그먼트 검증) |
| `--cycle` | search | `A/S/Q/M/SM/D` |
| `--start`/`--end` | search | 주기 형식 (D=`YYYYMMDD`, M=`YYYYMM`, A=`YYYY`) |
| `--limit` | 공통 | 기본 10, sample 키 사용 시 10으로 자동 캡 |
| `--query` | word | 한글 검색어 percent-encoding 자동 처리 |

## 실패 처리

- `INFO-100` (인증키 오류): typed 오류 + 키 발급 안내
- `INFO-200` (데이터 없음): `result: "empty"`로 명시
- `ERROR-301` (sample 10행 초과): 개인 키 발급 안내
- 경로 세그먼트 침입 문자(`/` 등): upstream 미호출, 검증 오류
- HTTP 오류/타임아웃/비JSON 응답: 차단·점검 가능성 안내 후 종료 코드 1
