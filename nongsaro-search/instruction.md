# 농사로 작목·병해충·농업기술 조회

## Draft status

이 스킬은 #389의 **draft scaffold**다. 농사로는 서비스별 Open API 계약과
인증키·응답 필드가 다르므로 대표 operation을 실제 운영 키로 검증하기
전까지 live 조회 구현으로 간주하지 않는다.

## Planned v1

- 작목·농업기술 정보
- 병해충·방제 정보
- 좁은 서비스 allowlist와 공식 필드 보존
- 빈 결과, 키 오류, quota, 상류 장애 구분

## Prerequisite

농사로 Open API 이용신청과 인증키 발급 후 gpu01 proxy runtime env에
등록한다. 키는 저장소·PR·로그·사용자 응답에 노출하지 않는다.

공식 API 안내: https://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00191

## Draft stop condition

대표 operation의 실제 성공 응답을 확인하면 실패하는 live E2E부터 추가하고
proxy route, helper, 문서와 manual QA를 완성한다.
