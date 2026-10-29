# 약학정보원 의약품 검색

## What this skill does

약학정보원(KPIC) 공개 웹 정보를 조회합니다. 원본 [antegral/kpic-mcp](https://github.com/antegral/kpic-mcp)의 두 동작을 별도 MCP 서버 없이 번들 Node.js helper로 실행합니다.

- `search_drugs_by_name(drugname)`: 한글 또는 영문 의약품 이름으로 검색합니다.
- `get_drug_detail_by_id(drugcode)`: 검색 결과의 `drug_code`로 상세 정보를 조회합니다.

두 동작 모두 들여쓰기한 JSON 배열을 반환합니다. 검색은 공개 API의 모든 페이지에서 `items`를 모으고 각 항목의 전체 필드를 보존합니다. 상세는 upstream JSON 배열의 모든 필드와 값을 변형하거나 필터링하지 않습니다.

## When to use

- "타이레놀 제품을 찾아 주세요."
- "이 약품 코드의 효능과 용법, 주의사항 원문을 확인해 주세요."
- "검색된 제품의 성분과 제조사를 비교해 주세요."

## Prerequisites

- Node.js 18 이상과 인터넷 연결이 필요합니다.
- `@nomadamas/k-skill` CLI에 번들된 `scripts/kpic_drug_search.mjs`를 사용합니다. helper는 네이티브 `fetch`를 사용하며 추가 npm 의존성을 설치하지 않습니다.
- API 키, 로그인, 프록시, 브라우저 런타임, MCP 서버는 필요하지 않습니다.

스킬 설치 명령입니다.

```bash
npx skills add NomaDamas/k-skill --skill kpic-drug-search -g
```

## Inputs and outputs

| 동작 | 입력 | 출력 |
| --- | --- | --- |
| `search_drugs_by_name` | `drugname`: 비어 있지 않은 의약품 이름 문자열 | 전체 검색 페이지의 `items`를 합친 JSON 배열입니다. 검색 결과가 없으면 `[]`입니다. |
| `get_drug_detail_by_id` | `drugcode`: 비어 있지 않은 약품 코드 문자열 | 상세 원문의 JSON 배열입니다. 코드에 해당하는 상세 정보가 없으면 오류입니다. |

빈 이름이나 빈 코드는 네트워크 요청 전에 거부합니다. 약품 코드는 숫자로 변환하지 않고 문자열로 전달합니다. 성공 시 stdout에는 JSON만 출력하며 실패 시 stderr에 오류를 출력하고 0이 아닌 종료 코드를 반환합니다. helper 모듈에서도 같은 이름의 함수를 export하며, 각 함수는 JSON 문자열을 반환합니다.

검색 결과의 `drug_code`를 상세 입력 `drugcode`로 사용합니다. 검색 응답의 필드명과 값은 현재 공개 API를 따릅니다. 원본 MCP의 과거 검색 타입에 있던 `dosage`, `effect` 등이 현재 검색 응답에도 있다고 가정하지 않습니다. 효능과 용법이 필요하면 상세를 조회합니다.

2026-10-30에 관찰한 검색 항목에는 다음 필드가 포함되었습니다. 고정 스키마로 축소하지 않으며 이후 추가되는 필드도 보존합니다.

| 정보 | 검색 필드 |
| --- | --- |
| 제품 식별 및 업체 | `drug_code`, `drug_name`, `drug_enm`, `upso_name_kfda` |
| 성분 및 함량 | `list_sunb_name`, `ingr_mg`, `sunb_count` |
| 제형 및 분류 | `drug_form`, `dosage_route_name`, `drug_class`, `cls_name` |
| 보험, 이미지, 기타 | `boh_code`, `boh_price`, `list_boh`, `pack_img`, `drug_pic`, `produce`, `kfda_code`, `confirm_flag`, `etc`, `rnum` |

상세 응답에서 확인할 대표 필드입니다. 아래에 없는 upstream 필드도 그대로 보존합니다.

| 정보 | 상세 필드 |
| --- | --- |
| 제품 식별 | `drug_code`, `drug_name`, `drug_enm`, `upso_name`, `upso1` |
| 성분 및 첨가제 | `list_sunb_name`, `sunb`, `sunb_count`, `sunbcontent`, `additives` |
| 효능, 용법, 주의사항 | `effect`, `dosage`, `caution` |
| 분류, 제형, 투여 경로 | `drug_cls`, `cls_code`, `atc_cd`, `drug_form`, `dosage_route` |
| 허가 및 보험 | `item_permit_date`, `cancel_date`, `boh`, `boh_history`, `boh_hiracode` |
| DUR 정보 | `dur_age`, `dur_contra`, `dur_preg`, `dur_senior`, `dur_dose`, `dur_period`, `dur_donate`, `dur_form` |
| 안내문 및 이미지 | `insertpaper`, `paper_dt`, `mediguide`, `drug_pic`, `pack_img`, `picto_img` |

## Workflow

1. 의약품 이름이 없으면 이름을 확인합니다. 이름만으로 특정 제품이나 함량을 단정하지 않습니다.
2. 이름을 검색하고 제품명, 성분, 함량, 업체 등 응답에서 확인되는 정보로 후보를 구분합니다.
3. 후보의 `drug_code`를 사용해 상세를 조회합니다. 사용자가 코드를 이미 제공했다면 상세 조회부터 실행할 수 있습니다.
4. 요청한 항목을 실제 반환된 필드에 근거해 정리하고 조회 시각과 공식 상세 링크 `https://www.health.kr/drug/<drug_code>`를 함께 안내합니다.
5. 여러 후보 중 제품을 특정할 근거가 부족하면 사용자에게 확인합니다. 미제공 필드나 빈 값을 추론해 채우지 않습니다.

```bash
npx -y @nomadamas/k-skill@0 exec kpic-drug-search scripts/kpic_drug_search.mjs -- search_drugs_by_name "타이레놀"
npx -y @nomadamas/k-skill@0 exec kpic-drug-search scripts/kpic_drug_search.mjs -- get_drug_detail_by_id "<drug_code>"
```

상세 호출에는 검색 결과에서 확인한 실제 코드를 넣습니다. 예시 코드 형식은 `2013062800004`입니다.

새 스킬이 포함된 CLI를 배포하기 전에는 기존 npm 배포본에서 이 명령을 사용할 수 없습니다. 저장소 루트에서 CLI 번들을 동기화한 뒤 로컬 개발 CLI로 실행합니다.

```bash
node packages/k-skill-cli/bin/k-skill.js exec kpic-drug-search scripts/kpic_drug_search.mjs -- search_drugs_by_name "타이레놀"
node packages/k-skill-cli/bin/k-skill.js exec kpic-drug-search scripts/kpic_drug_search.mjs -- get_drug_detail_by_id "2013062800004"
```

## Official surfaces and migration note

- 공식 검색 페이지: `https://www.health.kr/searchResult`
- 공개 이름 검색 API: `GET https://www.health.kr/api/searchDrug?page=1&limit=5&drugName=<drugname>&total=1`
- 상세 JSON: `GET https://health.kr/searchDrug/ajax/ajax_result_drug2.asp?drug_cd=<drugcode>`
- 공식 상세 페이지: `https://www.health.kr/drug/<drug_code>`

2026-10-30에 관찰한 웹 동작을 기준으로 이전했습니다. 기존 `/searchDrug/search_total_result.asp`는 `/searchResult`로 리다이렉트되어 원본 MCP가 CSRF 토큰을 얻지 못했습니다. 기존 검색 AJAX GET도 405를 반환했습니다. 따라서 죽은 CSRF 경로를 재현하거나 실패 시 그 경로로 되돌아가지 않습니다. 현재 공개 검색 API의 `totalPages`에 따라 모든 페이지를 조회하며, 페이지 하나라도 실패하면 부분 결과를 성공으로 반환하지 않습니다. 상세 endpoint는 HTML Content-Type으로 응답해도 실제 본문이 JSON이면 JSON으로 처리합니다.

## Safety and failure handling

- 이 스킬은 공개 의약품 정보를 제공하며 진단, 처방, 개인별 복용 지시를 하지 않습니다. 복용 가능 여부, 용량 변경, 중단은 약사나 의사에게 확인하도록 안내합니다.
- 응답에 HTML 태그나 `brbr` 구분자가 포함될 수 있습니다. helper 출력은 이를 제거하거나 치환하지 않습니다. 읽기 쉽게 설명하더라도 원문과 요약을 구분하고 원문에 없는 내용을 보충하지 않습니다.
- 검색 결과 없음과 네트워크, HTTP, JSON 처리 실패를 구분합니다. 실패를 `[]`, 가짜 약품 정보, 캐시로 위장하지 않습니다.
- API가 실패하면 오류를 알리고 공식 검색 또는 해당 코드의 공식 상세 페이지를 사람이 직접 확인하도록 안내합니다. 접근 제한을 우회하지 않습니다.
- 개인의 일반적인 조회에만 사용하며 체계적인 대량 수집이나 데이터베이스 구축에 사용하지 않습니다.

## Source and license

원본은 [antegral/kpic-mcp](https://github.com/antegral/kpic-mcp)이며 MIT 라이선스 저작권 표시는 `Copyright (c) 2025 SeongUk Moon`입니다. 번들된 원본 라이선스는 다음 명령으로 읽습니다.

```bash
npx -y @nomadamas/k-skill@0 read kpic-drug-search references/LICENSE.md
```

## Done when

- 요청한 이름 검색 또는 코드별 상세 조회를 실제 실행하고 결과나 오류를 명확히 전달했습니다.
- 검색 후보와 상세 제품을 `drug_code`로 연결하고 원문 출처를 제시했습니다.
- 미제공 정보, 원문에 포함된 HTML, 의료적 판단의 한계를 구분해 설명했습니다.
