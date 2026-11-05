# 출처, 라이선스, 재배포 범위

## 참고한 오픈소스

- 프로젝트: [djfksjd/ir-search](https://github.com/djfksjd/ir-search)
- 라이선스: [MIT License](https://github.com/djfksjd/ir-search/blob/main/LICENSE)
- 원 저작권 표시: `Copyright (c) 2026 ir-search contributors`

MIT 라이선스는 사용·수정·병합·배포·재라이선스를 허용하며, 소프트웨어의 복제물 또는 중요한 부분에 저작권 고지와 허가 고지를 포함해야 한다. 이 문서는 해당 attribution을 보존한다.

이번 통합은 upstream 파일을 그대로 복제하지 않고, 공개 포털 접근 경로·정규화 스키마·fail-closed 원칙을 참고해 k-skill-proxy의 Node.js 구현과 k-skill CLI 계약으로 재작성했다.

## 공식 데이터 출처

| 소스 | 공식 URL | k-skill 처리 |
|---|---|---|
| K-Startup | https://www.data.go.kr/data/15125364/openapi.do | 공공데이터포털 Open API 응답의 공고 메타데이터와 링크 |
| 기업마당 | https://www.bizinfo.go.kr/ | 공개 모집 목록의 메타데이터와 공식 상세 링크 |
| NIPA | https://www.nipa.kr/home/2-2 | 공개 사업공고 목록의 메타데이터와 공식 상세 링크 |
| KOCCA | https://www.kocca.kr/kocca/pims/list.do | 공개 지원공고 목록의 메타데이터와 공식 상세 링크 |
| SMTECH | https://www.smtech.go.kr/front/ifg/no/notice02_list.do | 공개 R&D 공고 목록의 메타데이터와 공식 상세 링크 |

## 재배포 판단

- **오픈소스 코드**: MIT 조건에 따라 attribution을 유지하면 재사용·수정·재배포 가능.
- **K-Startup Open API 데이터**: 데이터셋 상세 페이지의 이용조건을 따라 사용하며 출처를 표시한다.
- **각 기관의 공고 원문·첨부파일**: 개별 저작권·공공누리·제3자 권리가 다를 수 있으므로 일괄 재배포 가능하다고 간주하지 않는다.
- **k-skill-proxy 응답**: 제목, 기관, 날짜, 식별자, 공식 링크 같은 사실 메타데이터만 구조화한다. 공고 본문·첨부파일을 저장하거나 미러링하지 않는다.

공고 내용을 인용하거나 첨부파일을 재배포해야 하는 별도 기능은 각 자료에 표시된 공공누리 유형과 이용약관을 건별 확인한 뒤 구현해야 한다.
