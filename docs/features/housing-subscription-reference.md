# Housing subscription reference (South Korea)

A read-only reference skill for Korean private-housing subscription scores (84 points) and regional/area deposit thresholds. Proposed in [issue #696](https://github.com/NomaDamas/k-skill/issues/696).

## Inputs and output

- Score: `category` and `condition` from the [versioned CSV](https://github.com/cheer710815-hub/apttosell-subscription-data/blob/main/housing_subscription_score_2026.csv); returns exact points, source, date.
- Deposit: `region` and `housing_area` from the [versioned CSV](https://github.com/cheer710815-hub/apttosell-subscription-data/blob/main/private_housing_deposit_2026.csv); returns threshold in 만원, source, date.

No API key, login, scraper, or proxy. Uses public raw CSV with GitHub viewer fallback. A failed source is explicitly reported; no inferred numbers.

## Examples

- 서울, 85㎡ 이하: 300만원 (as of 2026-09-25).
- 기타 광역시, 102㎡ 이하: 400만원 (as of 2026-09-25).
- 가점 최대: 무주택기간 32 + 부양가족 35 + 청약통장 가입기간 17 = 84점 (as of 2026-09-18).

## Scope and attribution

Static reference only; not a current 청약Home announcement, application eligibility decision, or legal advice. Always consult the latest official announcement and law. Source: [AptToSell housing subscription reference](https://apttosell.com/housing-subscription-data/) ([DOI](https://doi.org/10.5281/zenodo.22842058)), dataset CC BY 4.0. Disclosure: dataset maintained by the PR author.
