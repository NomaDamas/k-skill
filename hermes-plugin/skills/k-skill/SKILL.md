---
name: k-skill
description: Use for any request about Korean services or data (KTX/SRT, 당근, 쿠팡, 다이소, 미세먼지, 주유소, 공시지가, 법령, 공공데이터, 병원/약국, 부동산, 주식/공시, 맞춤법). Finds the right k-skill and runs its bundled helpers through the k-skill plugin tools.
license: MIT
---

# k-skill workflow (Hermes)

The k-skill plugin exposes ~130 Korean everyday/work skills through four tools.

1. `kskill_search` — find the skill. Query in Korean or English; every word must match. Retry with fewer or different words if nothing matches.
2. `kskill_instructions` — read the chosen skill's full instructions **before acting**, and follow them (what to ask the user first, which endpoint to call, failure modes).
3. `kskill_exec` — run a helper script the instructions name (`scripts/<file>`), one argv entry per array item. Instruction text such as `npx -y @nomadamas/k-skill@0 exec <skill> scripts/<f> -- <args>` means this tool; skip any `... update` step.
4. `kskill_read` — read a bundled `references/<file>` the instructions point to.

Rules that always apply:

- Ask the user for missing required input (location, dates, IDs) exactly as the skill says; never guess.
- Use the `clarify` tool immediately before any irreversible side effect (payment, message sending, final submission, cancellation, public posting).
- Never ask for, echo, or store plaintext credentials in chat; follow the skill's credential section.
- Do not bypass CAPTCHA, identity proofing or electronic-signature steps; take the user to the official step instead.
- Humans can run the same lookups: `/kskill <keywords>` in chat, `hermes k-skill search|show|run|doctor` in a shell.
