# 작명소 가이드

`naming-house`는 성씨, 생년월일시, 성별, 후보 이름을 인터뷰로 확인한 뒤 `saju-fortune`의 사주 보완 오행과 성명학식 획수·발음 흐름을 참고해 이름 후보를 추천·채점하는 스킬이다.

## 기본 흐름

1. 성씨, 양력/음력, 생년월일, 태어난 시간, 성별, 후보 이름과 한자를 확인한다.
2. 음력은 검증된 만세력으로 양력 변환 후 입력한다.
3. `naming-house` package가 없으면 `npm install -g naming-house`로 설치하고 `NODE_PATH="$(npm root -g)"`를 설정한다.
4. `recommendNames` 또는 `callNamingHouseTool("score_name", ...)`을 호출해 결과 JSON을 얻는다.
5. 후보별 총점, 성명학 구성 점수, 사주 보완 오행, 한계와 주의사항을 함께 설명한다.

## 입력값

| 항목 | 필수 여부 | 설명 |
| --- | --- | --- |
| 성씨 | 필수 | 한글 성씨, 가능하면 성 한자도 함께 입력 |
| 양력/음력 | 필수 | 음력은 검증된 만세력으로 양력 변환 후 입력 |
| 생년월일 | 필수 | `YYYY-MM-DD` 형식 |
| 태어난 시간 | 권장 | 모르면 시주 기반 해석 한계를 표시 |
| 성별 | 필수 | package 호출 시 `male` 또는 `female` |
| 출생 시군구 | 선택 | 사주 해석 맥락용 |
| 후보 이름 | 필수 | 한글 이름 필수, 한자 이름 선택 |
| 선호 조건 | 선택 | 선호/회피 음절, 스타일, 최대 후보 수 |

## 사용 예시

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const { recommendNames } = require("naming-house")

recommendNames({
  surname: "김",
  surnameHanja: "金",
  birthDate: "2024-05-18",
  birthTime: "09:20",
  calendar: "solar",
  gender: "female",
  candidates: [
    { givenName: "서아", hanjaName: "瑞雅", tags: ["modern"] },
    { givenName: "하린", hanjaName: "河潾" },
    { givenName: "지유" }
  ]
}).then((result) => console.log(JSON.stringify(result, null, 2)))
JS
```

CLI:

```bash
naming-house --tool recommend_names --input-json '{"surname":"김","birthDate":"2024-05-18","birthTime":"09:20","calendar":"solar","gender":"female","candidates":[{"givenName":"서아","hanjaName":"瑞雅"}]}'
```

## 점수 구조

| 구성 | 범위 | 의미 |
| --- | --- | --- |
| `elementBalance` | 0-40 | 사주에서 보완할 오행과 이름 오행의 일치·상생 여부 |
| `strokeHarmony` | 0-30 | 한자 필순 횟수 또는 한글 fallback 획수의 흐름 |
| `soundFlow` | 0-20 | 전체 이름 길이, 반복 음절, 로마자 흐름 |
| `preferenceFit` | 0-10 | 선호 음절, 회피 음절, 스타일 태그, 의미 메모 반영 |

등급은 `excellent`(85-100), `good`(70-84), `fair`(50-69), `weak`(0-49)이다.

## 해석 가이드

- 점수가 가장 높은 이름을 단정적으로 "최고"라고 하지 말고, 어떤 요소가 강한지 설명한다.
- 한자 이름이 있는 후보는 `hanja-stroke-order` 기반 한자 필순 횟수 출처를 표시한다.
- 한자가 없는 후보는 `korean-stroke` 한글 획수 fallback이며 정밀도가 낮다고 표시한다.
- 태어난 시간이 없으면 시주 기반 보완 오행은 확정하지 않는다.
- 결과는 성명학 참고용이며 법적 개명, 인명용 한자 검증, 운명 판단을 대신하지 않는다.
- `hanja-stroke-order`를 강희자전 원획수나 81수리 4격 값으로 해석하지 않는다.

## 주의사항

- 음력 또는 윤달 생일은 package 안에서 임의 변환하지 않는다.
- 공식 인명용 한자, 불용문자, 법원 개명 가능성은 보증하지 않는다.
- MCP 서버나 proxy를 실행하지 않고 로컬 또는 전역 npm package를 직접 호출한다.
