---
"@nomadamas/k-skill": patch
---

`kamis-food-price`에서 `p_regday`를 생략하면 KST 기준 최근 조사일을 하루씩 되짚어 찾고, 응답 `query.p_regday`에 실제 사용한 조사일을 담아 반환하도록 고칩니다. 그전에는 `p_regday`를 생략하면 proxy가 조사일을 넘기지 않아 KAMIS가 `001`(자료 없음)만 돌려주고 조사일을 명시해야만 실제 시세가 나왔습니다.
