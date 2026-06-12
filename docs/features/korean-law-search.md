# 한국 법령 검색 가이드

## 이 기능으로 할 수 있는 일

- `k-skill-proxy` 로 법령명/조문/판례/유권해석/자치법규 검색
- 검색 결과 식별자로 조문·판례 본문(상세) 조회
- 별도 API key나 로컬 설치 없이 hosted proxy로 바로 사용

## 가장 중요한 규칙

한국 법령 관련 검색/조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)의 `/v1/korean-law/...` endpoint로 처리합니다. 사용자 쪽 `LAW_OC` 가 불필요합니다. 별도 repo package, 별도 python package, 임의 크롤러를 새로 만들지 않습니다.

이 endpoint는 법제처(국가법령정보센터) 공식 Open API(`open.law.go.kr` 의 DRF `lawSearch.do`/`lawService.do`)를 감싼 것이고, read-only 도구 표면 설계는 `chrisryugj/korean-law-mcp` 를 참고했습니다.

## 먼저 필요한 것

- 인터넷 연결
- (선택) `KSKILL_PROXY_BASE_URL` — self-host proxy를 쓸 때만

사용자는 별도 API key를 준비할 필요가 없습니다. upstream `LAW_OC` 는 proxy 서버에서만 주입합니다. 무료 발급처(운영자용): `https://open.law.go.kr`

## 기본 경로

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 없으면 기본 경로 `https://k-skill-proxy.nomadamas.org` 를 사용합니다.

## 지원 endpoint

### 검색/목록 조회

```
GET /v1/korean-law/search?target={target}&query={검색어}
```

| target | 설명 |
|---|---|
| `law` | 현행법령 |
| `eflaw` | 시행일 법령 |
| `prec` | 판례 |
| `detc` | 헌재결정례 |
| `expc` | 법령해석례(유권해석) |
| `admrul` | 행정규칙 |
| `ordin` | 자치법규 |
| `trty` | 조약 |

지원 필터: `query`(검색어), `display`, `page`, `sort`, `date`, `prncYd`(선고일자), `nb`(사건번호), `datSrcNm`(데이터출처명), `curt`(법원) 등. 활성 필터만 넘기고, 요약 전에 반환 메타데이터를 확인합니다.

### 본문/상세 조회

```
GET /v1/korean-law/detail?target={target}&ID={일련번호}
```

검색 결과의 식별자(`ID` 또는 `MST`/`LID`)를 넘겨 상세 본문을 가져옵니다. 조문 지정은 `JO`(예: `000200` = 제2조)로 넘깁니다.

## 예시

```bash
# 법령명 검색
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-law/search' \
  --data-urlencode 'target=law' \
  --data-urlencode 'query=관세법'

# 판례 검색
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-law/search' \
  --data-urlencode 'target=prec' \
  --data-urlencode 'query=부당해고'

# 판례 본문 조회
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-law/detail' \
  --data-urlencode 'target=prec' \
  --data-urlencode 'ID=228541'
```

## 기본 흐름

1. 질의가 법령/판례/행정해석/자치법규 중 어디에 가까운지 분류한다.
2. 법령명만 찾으면 `target=law` 로 `search` 한다.
3. 특정 조문이 필요하면 `search` 로 식별자(`MST`/`ID`)를 확인한 뒤 `detail` 을 호출한다.
4. 판례는 `target=prec`, 유권해석은 `target=expc`, 자치법규는 `target=ordin` 로 조회한다.
5. 범주가 애매하면 `target=law` 부터 시작한다.
6. 검색 결과가 0건이어도 바로 "관련 규범이 없다"고 단정하지 말고 검색어와 범주를 다시 확인한다.

## 실패 모드

- `target` 이 없거나 허용되지 않은 값이면 400 응답
- 검색어/식별자가 없으면 400 응답
- 프록시 서버에 `LAW_OC` 가 없으면 503 응답
- 법제처 API가 사용자 검증 실패를 반환하면 502 + `law_user_verification_failed` (운영자가 서버 OC/UA/Referer 점검)
- 법제처 API가 일시적으로 빈/HTML 응답이면 proxy가 재시도 후 502 + `upstream_unstable`
- 일부 출처는 본문을 제공하지 않을 수 있다. 본문을 못 가져오면 목록 메타데이터(사건번호·법원·선고일자·출처·요지)까지만 제공하고 본문이 없다는 점을 명시한다.

## 운영 팁

- `화관법` 같은 약칭은 `target=law` 로 정식 법령명을 먼저 확인한다.
- 조문 번호가 헷갈리면 `detail` 전에 법령 식별자부터 다시 확인한다.
- 요약은 할 수 있지만 법률 자문처럼 단정적으로 결론을 내리지는 않는다.

## 출처

- 설계 참고(upstream): `https://github.com/chrisryugj/korean-law-mcp`
- 공식 데이터 출처: 법제처 국가법령정보 공동활용 (`https://open.law.go.kr`, DRF `lawSearch.do`/`lawService.do`)
- 운영자(proxy) 전용 시크릿: `LAW_OC` (사용자는 불필요)
