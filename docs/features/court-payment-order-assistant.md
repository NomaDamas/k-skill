# 지급명령 신청 보조 가이드

`court-payment-order-assistant`는 법원 전자소송 지급명령 신청을 준비하기 위해 필요한 사실관계를 묻고, 신청서 초안·검토 체크리스트·공식 전자소송 브라우저 handoff를 만드는 스킬이다.

## 이 기능으로 할 수 있는 일

- 채권자/채무자 인적사항 누락 확인
- 청구금액, 변제기, 청구원인, 신청취지 초안 정리
- 계약서, 차용증, 송금내역, 세금계산서, 독촉 메시지 등 증빙 체크리스트 작성
- 전자소송 포털에서 사용자가 로그인한 뒤 되돌릴 수 있는 입력 단계까지 handoff

## 하지 않는 일

- 법률 자문, 승소 가능성 판단, 관할 확정
- 공동/금융인증서 조작, 보안 프로그램 우회, CAPTCHA 우회
- 전자서명, 인지대/송달료 결제, 최종 제출

## 공식 접근 경로

```text
https://ecfs.scourt.go.kr/psp/index.on
```

발견한 경계:

- 공개 화면에서 로그인/사용자등록, `서류제출`, `민사 서류` 영역을 확인할 수 있다.
- 문서 작성은 로그인 이후 가능하다.
- `/ecf/index.jsp`는 점검/오류 화면으로 redirect될 수 있어 `/psp/index.on`을 기본 진입점으로 쓴다.

## 사용 예시

```js
const {
  buildBrowserHandoff,
  buildPaymentOrderDraft,
  buildRequiredQuestions
} = require("court-payment-order-assistant")

const input = {
  creditor: { name: "홍길동", address: "서울특별시 강남구 테헤란로 1" },
  debtor: { name: "김채무", address: "서울특별시 서초구 반포대로 2" },
  claim: {
    amount: "3500000",
    cause: "2026-05-01 물품대금 미지급",
    dueDate: "2026-06-01",
    demand: "채무자는 채권자에게 3,500,000원 및 지연손해금을 지급하라."
  },
  evidence: [{ title: "계약서" }, { title: "송금내역" }]
}

console.log(buildRequiredQuestions(input))
console.log(buildPaymentOrderDraft(input))
console.log(buildBrowserHandoff(input))
```

## Browser policy

1. `k-skill-browser-runtime`의 BrowserOS provider를 기본으로 쓴다. CDP-only로 사용자가 직접 띄운 BrowserOS GUI 세션에 붙는다(기본 `KSKILL_BROWSEROS_CDP_URL=http://127.0.0.1:9100`, `KSKILL_BROWSER_PROVIDER`, `KSKILL_CHROME_CDP_URL`). 런타임이 BrowserOS를 launch하거나 headless로 띄우지 않는다.
2. 공개 화면은 직접 HTTP로 먼저 확인하고, 브라우저는 BrowserOS CDP로 붙은 사용자 세션에서 되돌릴 수 있는 입력 handoff에만 쓴다. BrowserOS CDP가 불가하면 정확한 입력값을 수동 브라우저 handoff로 넘긴다.
3. 로그인, 인증서, 보안 모듈, 전자서명, 결제, 제출은 사용자가 직접 한다. 해당 경계에 도달하면 runtime의 typed stop rule(`AUTH_REQUIRED`, `CAPTCHA_DETECTED`, `PAYMENT_REQUIRED`, `ELECTRONIC_SIGNATURE`, `IRREVERSIBLE_BOUNDARY`)로 멈추고 수동 handoff로 넘긴다.
4. CAPTCHA/로그인/결제/전자서명/되돌릴 수 없는 제출 자동화 우회는 하지 않는다.

## Done when

- 누락 정보 질문 또는 초안이 생성됐다.
- 공식 전자소송 포털과 로그인-required 경계가 확인됐다.
- 전자서명/결제/최종 제출 전 stop rule을 지켰다.
