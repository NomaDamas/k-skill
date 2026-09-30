# 원천과 재현 가능한 스냅샷

두 보조 스크립트는 Node.js 18 이상에서 표준 라이브러리만 사용한다. TypeScript 원본과 실행용 JavaScript를 함께 둔다.

| 시장 | 1차 원천 | 식별자 |
| --- | --- | --- |
| 한국 | [DART 공개 공시](https://dart.fss.or.kr/), [KIND 공개 공시·IR](https://kind.krx.co.kr/), 발행사 IR | 회사·종목코드, 접수번호, 정정 여부, 회계기간 |
| 미국 | [SEC 공개 제출·XBRL API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), 개별 EDGAR 공시, 발행사 IR | CIK, accession, form, filed, start/end, unit |
| 기타 해외 | 해당 감독기관·거래소의 공개 공시, 발행사 IR | 현지 법인·증권 ID, 공시 ID, 회계기간 |

숫자는 가장 구체적인 원문을 택한다. 미국 `companyfacts`는 여러 공시의 수치를 모으므로 `val`만 고르지 말고 `accn`, `filed`, `form`, `start/end`, `unit`을 묶어 특정 공시와 대조한다. DART는 정정 공시가 있으면 사용한 버전을 밝힌다. 컨센서스·시총·시장점유율은 기본 필드가 아니다. 시점과 정의가 확인될 때만 추가한다.

3대 재무제표는 성격이 다르다. 손익계산서는 동일 길이의 단일 분기 또는 연간 흐름끼리, 재무상태표는 표시된 결산일의 잔액끼리, 현금흐름표는 같은 시작일·종료일의 누적 흐름끼리 비교한다. 현금흐름표에서 영업·투자·재무 현금흐름, 기초·기말 현금을 혼동하지 않는다. 단일 분기 현금흐름을 누적값에서 차감해 새로 만들거나, 설비투자·FCF를 회사마다 다른 정의로 섞지 않는다. 원문에 없는 파생값은 현재 검증기에서 출력하지 않는다.

FRED·ECOS·KOSIS·OpenDART API는 키가 필요하므로 사용하지 않는다. SEC 공개 데이터 API는 인증키가 없지만 이용 정책을 지킨다. 다른 공개 페이지도 로그인·쿠키·인증 우회 없이 접근 가능한 경우에만 사용한다. 주가만은 공시 수치와 별도로 호출 직후 조회한 시세 스냅샷을 사용한다. 미국 나스닥의 공개 종목 JSON과 네이버증권의 공개 한국 종목 JSON(제3자·비공식 경로)만 구조 검증기에 연결되어 있다. 이 경로가 막히거나 필드가 바뀌면 가격은 `확인 불가`다.

## 스냅샷 절차

1. 기업·티커·시장과 `as_of`를 확정하고, 기준일 이전에 발행된 원문 URL만 선택한다. 발행일은 원문에 그대로 있는 `published_date_quote`와 함께 기록하며 둘이 같은 날짜여야 한다(ISO·`YYYY.MM.DD`·영문 월 이름/약어·영문 일-월-년·한국어 연월일 지원). 상시 갱신되는 기업 식별 페이지는 발행일을 추정하지 말고 두 필드를 생략한다. 발행일 없는 원천은 일반 숫자 주장의 근거로 쓰지 않는다. 시세와 검증된 DART 공시의 하위 재무제표 본문만 예외다.
2. 로그인 없는 직접 URL을 `npx -y @nomadamas/k-skill@0 exec company-analysis scripts/fetch-public.js -- URL NEW_DIRECTORY`로 수집한다. 도구가 `raw`와 `capture.json`을 새 디렉터리에 저장한다. 두 파일의 SHA-256을 출력하며 기존 디렉터리는 덮어쓰지 않는다. 스냅샷 `url`에는 `capture.json`에 기록된 정규화 URL을 그대로 쓴다. 발표일과 공시 ID는 원문에서 따로 확인한다. 다운로드 실패나 차단은 해당 출처 실패로 남긴다. 예전 캐시를 새 관측값으로 대체하지 않는다.
3. 원본 파일 SHA-256을 기록한다. DART 하위 재무제표 HTML은 `npx -y @nomadamas/k-skill@0 exec company-analysis scripts/dart-rows.js -- CAPTURE_DIRECTORY`로 `rows.txt`를 만든다. 각 행은 원래 열 순서대로 한 줄이 되며, 검증기는 `text_file`·`text_sha256`을 받으면 저장된 원본에서 같은 행이 재생성되는지 확인한다. PDF·그 밖의 복잡한 HTML은 텍스트 추출본과 그 SHA-256을 별도로 기록하되 추출본을 원본이라고 부르지 않는다.
4. 분석 주장을 아래 JSON의 해당 섹션에 넣고, 각 주장에 저장된 텍스트와 일치하는 짧은 `quote`를 연결한다. 모든 근거 원문에 대상 기업명이 있어야 한다. 단, DART 하위 재무제표 본문은 `filing_index_source_id`로 회사명·발표일이 있는 모공시의 접수번호와 정확한 목차 항목에 묶인 경우에만 예외다. 숫자가 들어간 문장은 문장 전체가 인용문 하나에 그대로 있어야 하며 `period`, `unit`, `scope`도 적는다. `financials`의 각 주장에는 `statement`를 `income`, `balance_sheet`, `cash_flow` 중 하나로 붙인다. 세 유형은 출력에서 항상 별도 소제목으로 나오며 근거가 없는 유형은 `확인 불가`다. 계산값은 원문에 같은 값이 명시되지 않았다면 이 경량 검증기에서 출력하지 않는다. 주요 일정은 선택적 최상위 `schedule` 배열에 넣고 원문에 적힌 행사 날짜를 `date_quote` 및 인용문으로 증명한다.
5. `npx -y @nomadamas/k-skill@0 exec company-analysis scripts/evidence.js -- SNAPSHOT.json`을 실행한다. 실패하면 값을 수정하거나 출처를 다시 수집한 뒤 재검증한다. 검증기의 Markdown은 재현 가능한 사실 목록이다. 최종 채팅 분석은 그 사실만 사용해 작성하고, 출력한 수치·기간·단위·대상 범위·원문 링크를 사실 목록과 다시 대조한다. 결과 Markdown과 JSON·원본을 각각 보존하면 검증된 사실을 재생할 수 있다.

```json
{
  "company": {"name": "기업명", "aliases": ["공식 영문명"], "ticker": "종목코드", "market": "KRX", "evidence_source_id": "filing_1"},
  "as_of": "2026-09-22",
  "sources": [{
    "id": "filing_1",
    "url": "https://official.example/filing/123",
    "published_at": "2026-09-20",
    "published_date_quote": "2026-09-20",
    "file": "sources/filing/raw",
    "sha256": "원본 파일의 64자리 소문자 SHA-256",
    "capture_file": "sources/filing/capture.json",
    "capture_sha256": "수집 메타데이터의 64자리 소문자 SHA-256",
    "text_file": "sources/filing.txt",
    "text_sha256": "추출 텍스트의 64자리 소문자 SHA-256"
  }],
  "sections": {
    "company_snapshot": [], "business": [], "recent": [],
    "financials": [{
      "statement": "income", "text": "매출 100억원",
      "period": "2025년", "unit": "억원", "scope": "연결",
      "evidence": [{"source_id": "filing_1", "quote": "매출 100억원"}]
    }],
    "earnings": [], "catalyst_risk": []
  },
  "schedule": [{
    "kind": "date", "start": "2026-09-23",
    "date_quote": "September 23, 2026", "text": "주주총회",
    "evidence": [{"source_id": "filing_1", "quote": "September 23, 2026 주주총회"}]
  }]
}
```

`schedule`은 없거나 빈 배열이어도 되며, 이 경우 `Catalyst & Risk > 주요 일정`에 `확정된 일정 없음`이 나온다. `kind`는 단일일 `date`, 시작·종료일이 모두 확정된 `range`, 시작일만 확정된 지속 일정 `from` 중 하나다. `range`는 두 날짜를 각각 적는 경우 `end`·`end_date_quote`를, `September 29–30`처럼 압축 표기한 경우 `end`와 연도가 명시된 원문 구절 전체를 `date_quote`에 넣는다(`end_date_quote` 생략). `start`와 `end`는 유효한 `YYYY-MM-DD`이고 날짜 인용은 저장된 한 인용문 안에 있어야 한다. `from`은 원문에 종료일이 없는 지속 일정일 때만 선택한다. `text`에는 날짜나 숫자를 반복 기입하지 않는다. 검증기는 일정의 존재와 날짜 표기는 검사하지만 행사명·종료일 미정 여부의 의미까지 자동 증명할 수 없으므로 원문을 사람이 다시 대조한다. 출력은 날짜순이며 당해 연도 `9/23`, 다른 연도 `2027년 1/3`, 기간 `9/23~9/25`, 시작일만 `9/23~`다.

공식 국문·영문 이름을 함께 쓰는 회사는 두 이름과 티커가 **하나의 식별 원문**에 모두 있을 때만 `company.aliases`를 쓴다. `filing_index_source_id`는 DART `report/viewer.do` 하위 본문에만 쓸 수 있다. 모공시는 동일 접수번호의 `dsaf001/main.do`이고 발표일·회사명이 확인되어야 한다. 검증기는 하위 URL의 `rcpNo`, `dcmNo`, `eleId`, `offset`, `length`, `dtd` 여섯 값이 모공시 목차의 **동일한 항목**과 모두 일치하는지 확인한다. 다른 공시·다른 목차·해시 불일치라면 수치를 내보내지 않는다.

DART 하위 표의 `sources` 항목에는 `published_at`을 다시 적지 말고 `filing_index_source_id`에 모공시의 `id`를 넣는다. `text_file`은 `rows.txt`, `text_sha256`은 `dart-rows.js`가 출력한 값으로 채운다. 원본·수집 메타데이터의 파일 경로와 해시도 일반 출처와 똑같이 필요하다.

주가를 넣을 때는 호출 직후 UTC 시각을 `invoked_at`으로 기록하고 즉시 `fetch-public.js`로 아래 URL 중 해당 종목을 수집한다. 수집 메타데이터의 `retrieved_at`이 호출 후 10분 이내여야 한다. 시세 원천에는 `published_at`을 쓰지 않는다. 일반 `sources` 배열에 수집 파일·두 해시를 추가하고 다음 필드를 붙인다.

```json
"invoked_at": "2026-09-23T00:00:00.000Z",
"price": {"source_id": "price_1", "provider": "nasdaq"}
```

- Nasdaq: `https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks`에서 티커를 교체하고 `provider`를 `nasdaq`으로 지정한다. 응답의 `symbol`, `companyName`, `primaryData.lastSalePrice`, `lastTradeTimestamp`, `marketStatus`를 검증한다.
- 국내: `https://m.stock.naver.com/api/stock/005930/basic`에서 6자리 종목코드를 교체하고 `provider`를 `naver-kr`로 지정한다. `itemCode`, `stockName`, `closePrice`, `localTradedAt`, `marketStatus`, `marketSessionType`을 검증한다. 이 경로는 네이버의 비공식 공개 JSON으로 변경 가능성이 있다.
- 검증기는 가격을 사용자가 적은 문자열에서 읽지 않고 저장된 JSON에서 직접 읽는다. 통화·시장 상태·수집 시각을 함께 표시한다. Nasdaq이 장 마감 시 날짜만 제공하면 `거래일`과 `시각 미제공`으로 표기하며 시각을 추정하지 않는다. 거래일이 미래이거나 7일 넘게 오래됐거나 원천을 확인할 수 없으면 가격을 출력하지 않는다. 표시가는 실시간 체결 보장이 아니며 정규장 종가·시간외 가격을 혼동하지 않는다.

검증기는 원본·수집 메타데이터 해시, 수집 URL 일치, 원문에 있는 발표일, 기업명·티커의 원문 포함 여부, 인용 구간, 문장 속 숫자 토큰과 여섯 섹션 형식을 검사한다. 각 주장에 연결된 원문에도 기업명이 있어야 한다. 부호·퍼센트·천 단위 구분은 보존하며 잘못된 표기는 거부한다. PDF·복잡한 HTML은 추출 텍스트 파일을 만들고 그 해시를 별도로 적는다. 해시는 저장 파일의 변경 여부를 증명하지만, 추출과 문장 해석의 정확성까지 증명하지는 못한다. 원천 식별·회계 의미·인과관계는 원문 대조가 필요하다.
