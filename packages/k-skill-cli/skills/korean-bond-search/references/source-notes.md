# 원천 메모

1. SEIBro 채권정보를 1차 원천으로 사용한다. ISIN을 알면 모바일 상세 페이지 `https://m.seibro.or.kr/cnts/bond/selectDetailSearch.do?txt_code=<ISIN>`를 직접 연다.
2. 종목명/발행사 검색은 사용 가능한 읽기 전용 검색 도구로 SEIBro 공식 상세 페이지를 찾는 것이 우선이다. 검색 결과는 후보 발견용이며 최종 필드 값은 열린 공식 상세 페이지에서 확인한다. 결과가 완전한지 증명되지 않으면 전수 목록처럼 말하지 않는다.
3. 검색 도구로 공식 상세 페이지를 열 수 없거나 대화형 입력이 꼭 필요할 때만 SEIBro 모바일 UI/브라우저 자동화를 사용한다. PC WebSquare 화면은 기본 경로가 아니다. 한 조회에서 출처 경로를 여러 개 중복 실행하지 말고, 한 번의 대체 시도 뒤에도 막히면 내보내기 파일을 요청한다.
4. WebSquare 화면은 단순 HTTP 요청에서 오류 안내 HTML이나 빈 껍데기를 반환할 수 있다. HTTP 200만으로 성공 판정하지 않는다. 화면에서 직접 확인한 값은 helper용 export로 수기 변환하지 않는다.
5. 실제 내려받은 JSON/CSV/TSV/HTML 또는 사용자 제공 export만 helper로 정규화한다. DART는 CB/EB/BW 발행결정 원문의 보조 검증에, KRX는 상장 보강에만 사용한다. 금융투자협회는 v1의 실시간 호가나 YTM 원천으로 쓰지 않는다.

각 레코드에는 `source.name`, `source.url`, `source.observed_at`, `source.observed_at_basis`를 유지한다. 기본 상태에서는 `source.name`을 `입력 자료`, `source.url`을 비움으로 저장한다. 사용자가 임의 JSON을 넣거나 테스트 픽스처를 실행해도 SEIBro 출처를 가장하지 않게 하기 위함이다.

원천 화면과 해당 입력 파일을 이번 실행에서 직접 대조한 경우에만 `--observed-at <ISO-8601> --verified-source`를 지정한다. 이때만 `source.name: "SEIBro"`, 공식 URL 및 `observed_at_basis: "source_verified"`로 기록한다. 시각만 `--observed-at`으로 전달하면 `observed_at_basis: "provided"`로 남기고 원천 확인 여부 미검증으로 표시한다. 시각 생략 시 파일 수정시각 대체값을 `file_mtime_fallback`으로 표시하며, 원천 확인시각이라고 부르지 않는다. `input_file`에는 파일명만 저장하고 로컬 경로는 보존하지 않는다. 어느 시각도 발행일과 혼동하지 않는다.
