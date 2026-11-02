# 약학정보원 의약품 검색 가이드

## 이 기능으로 할 수 있는 일

약학정보원(KPIC)의 공개 웹 정보에서 한글 또는 영문 의약품 이름으로 제품을 찾고, 약품 코드로 상세 원문을 조회합니다. [antegral/kpic-mcp](https://github.com/antegral/kpic-mcp)의 `search_drugs_by_name(drugname)`과 `get_drug_detail_by_id(drugcode)`를 k-skill 번들 helper로 이전했습니다. 별도 MCP 서버는 실행하지 않습니다.

실제 반환된 의약품 정보를 정리하는 조회 도구이며 진단, 처방, 개인별 복약 지시를 제공하지 않습니다. 복용 가능 여부, 용량 변경, 중단은 약사나 의사에게 확인해야 합니다.

## 설치와 실행 환경

Node.js 18 이상과 인터넷 연결이 필요합니다. Node.js 네이티브 `fetch`를 사용하는 `.mjs` helper이며 추가 npm 의존성, API 키, 로그인, 프록시, 브라우저 런타임이 필요하지 않습니다.

```bash
npx skills add NomaDamas/k-skill --skill kpic-drug-search -g
```

helper는 `@nomadamas/k-skill` CLI에 포함됩니다. 스킬 설치 경로를 추측하거나 원본 MCP 패키지를 설치하지 않고 CLI의 `exec` 명령으로 실행합니다.

## 이름 검색에서 상세 조회까지

1. `search_drugs_by_name`에 제품 이름을 전달합니다. 검색 결과가 없으면 빈 JSON 배열 `[]`을 받습니다.
2. 반환된 제품명, 업체, 성분과 함량을 비교해 제품을 구분합니다. 동명 제품이나 서로 다른 함량을 임의로 하나로 합치지 않습니다.
3. 후보의 `drug_code`를 문자열 그대로 `get_drug_detail_by_id`에 전달합니다.
4. 상세 원문의 효능, 용법, 주의사항 등 요청한 내용을 정리하고 조회 시각과 공식 상세 페이지를 함께 안내합니다.

```bash
npx -y @nomadamas/k-skill@0 exec kpic-drug-search scripts/kpic_drug_search.mjs -- search_drugs_by_name "타이레놀"
npx -y @nomadamas/k-skill@0 exec kpic-drug-search scripts/kpic_drug_search.mjs -- get_drug_detail_by_id "<drug_code>"
```

`<drug_code>`는 검색 결과에서 확인한 실제 코드로 바꿉니다. 코드 형식의 예시는 `2013062800004`입니다. 제품 코드를 이미 알고 있으면 이름 검색 없이 상세를 조회할 수 있습니다.

새 스킬이 포함된 CLI 배포 전에는 기존 npm 배포본으로 실행할 수 없습니다. 저장소에서 CLI 번들을 동기화한 개발 환경에서는 저장소 루트에서 다음 명령을 사용합니다.

```bash
node packages/k-skill-cli/bin/k-skill.js exec kpic-drug-search scripts/kpic_drug_search.mjs -- search_drugs_by_name "타이레놀"
node packages/k-skill-cli/bin/k-skill.js exec kpic-drug-search scripts/kpic_drug_search.mjs -- get_drug_detail_by_id "2013062800004"
```

## 입력과 JSON 출력

| 동작 | 입력 | 성공 출력 |
| --- | --- | --- |
| `search_drugs_by_name` | `drugname`: 비어 있지 않은 한글 또는 영문 이름 문자열 | 모든 검색 페이지의 항목을 합친 JSON 배열입니다. |
| `get_drug_detail_by_id` | `drugcode`: 비어 있지 않은 약품 코드 문자열 | upstream 상세 JSON 배열입니다. |

두 동작은 들여쓰기한 JSON 배열만 stdout으로 출력합니다. 모듈에서 export하는 같은 이름의 함수도 JSON 문자열을 반환합니다. 빈 이름과 코드는 요청 전에 거부합니다. 상세가 없거나 HTTP, 네트워크, JSON 처리에 실패하면 stderr에 오류를 출력하고 0이 아닌 종료 코드를 반환합니다. 상세 없음 오류와 검색 결과 없음 `[]`은 다르게 취급합니다.

### 검색 필드

공개 검색 API는 `{items, total, page, limit, totalPages}` 객체를 반환합니다. helper는 `totalPages`에 따라 모든 페이지의 `items`를 수집해 배열로 반환하므로 페이지 메타데이터를 감싼 객체가 아닙니다. 한 페이지라도 실패하면 일부 결과를 성공으로 출력하지 않습니다. 항목 내부는 변환하거나 특정 필드만 선택하지 않습니다.

2026-10-30에 관찰한 대표 검색 필드입니다. 이후 upstream에서 추가하는 필드도 보존합니다.

| 정보 | 필드 |
| --- | --- |
| 약품 코드, 이름, 업체 | `drug_code`, `drug_name`, `drug_enm`, `upso_name_kfda` |
| 성분과 함량 | `list_sunb_name`, `ingr_mg`, `sunb_count` |
| 제형, 투여 경로, 분류 | `drug_form`, `dosage_route_name`, `drug_class`, `cls_name` |
| 보험 | `boh_code`, `boh_price`, `list_boh` |
| 이미지 및 기타 | `pack_img`, `drug_pic`, `produce`, `kfda_code`, `confirm_flag`, `etc`, `rnum` |

과거 MCP 검색 타입에 있던 `dosage`, `effect`가 현재 검색에도 제공된다고 가정하지 않습니다. 효능과 용법은 코드별 상세 조회에서 확인합니다.

### 상세 필드와 원문 보존

상세 JSON 배열은 전체 필드를 변형하거나 필터링하지 않고 보존합니다. 대표 필드는 다음과 같으며 전체 스키마를 이 표로 제한하지 않습니다.

| 정보 | 필드 |
| --- | --- |
| 제품 및 성분 | `drug_code`, `drug_name`, `drug_enm`, `upso_name`, `list_sunb_name`, `sunb`, `sunb_count`, `sunbcontent`, `additives` |
| 효능, 용법, 주의사항 | `effect`, `dosage`, `caution` |
| 분류 및 허가 | `drug_cls`, `drug_form`, `dosage_route`, `cls_code`, `atc_cd`, `item_permit_date`, `cancel_date` |
| DUR 정보 | `dur_age`, `dur_contra`, `dur_preg`, `dur_senior`, `dur_dose`, `dur_period`, `dur_donate`, `dur_form` |
| 보험 및 안내문 | `boh`, `boh_history`, `boh_hiracode`, `insertpaper`, `paper_dt`, `stmt`, `mediguide` |
| 이미지 | `drug_pic`, `pack_img`, `picto_img` |

원문에 HTML 태그나 `brbr` 구분자가 포함될 수 있으며 helper가 이를 제거하거나 치환하지 않습니다. 요약할 때도 원문과 설명을 구분합니다. 비어 있거나 제공되지 않은 필드를 추론해 채우지 않습니다.

## 공식 페이지와 검색 경로 변경

- 공식 검색: [약학정보원 검색 페이지](https://www.health.kr/searchResult)
- 공개 검색 API: `GET https://www.health.kr/api/searchDrug?page=1&limit=5&drugName=<drugname>&total=1`
- 상세 JSON: `GET https://health.kr/searchDrug/ajax/ajax_result_drug2.asp?drug_cd=<drugcode>`
- 공식 상세: `https://www.health.kr/drug/<drug_code>`

2026-10-30에 관찰한 웹 동작을 기록합니다. 기존 `/searchDrug/search_total_result.asp`가 `/searchResult`로 리다이렉트되면서 원본 MCP의 CSRF 토큰 추출이 실패했고, 기존 검색 AJAX GET은 405를 반환했습니다. 새 helper는 현재 공개 검색 API를 직접 호출합니다. 죽은 CSRF 경로를 다시 구현하거나 실패 시 구 경로로 되돌아가지 않습니다. 상세 endpoint는 HTML Content-Type으로 응답해도 본문이 JSON이면 JSON으로 처리합니다.

조회에 실패하면 오류를 알리고 사람이 공식 검색 페이지 또는 해당 약품 코드의 공식 상세 페이지를 직접 확인하도록 안내합니다. 실패를 빈 검색 결과, 임의로 만든 정보, 가짜 fallback 응답으로 바꾸지 않습니다. 접근 제한을 우회하거나 체계적인 대량 수집, 데이터베이스 구축에 사용하지 않습니다.

## 원본과 라이선스

원본 [antegral/kpic-mcp](https://github.com/antegral/kpic-mcp)는 MIT 라이선스이며 저작권 표시는 `Copyright (c) 2025 SeongUk Moon`입니다. 번들에 보존한 라이선스 전문은 다음 명령으로 읽습니다.

```bash
npx -y @nomadamas/k-skill@0 read kpic-drug-search references/LICENSE.md
```
