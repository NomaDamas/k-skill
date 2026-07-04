---
"k-skill-browser-runtime": minor
"hipass-receipt": minor
"court-auction-notice-search": minor
"court-payment-order-assistant": minor
"yebigun-training": minor
"d2b-notice-search": minor
"s2b-notice-search": minor
---

Add `k-skill-browser-runtime`, a BrowserOS-first CDP adapter for k-skill packages, and migrate the CDP-attaching browser consumers onto it. The recommended default provider is `auto`: prefer a user-launched BrowserOS session (`KSKILL_BROWSEROS_CDP_URL=http://127.0.0.1:9100`) and fall back to a Chrome/Chromium CDP session (`KSKILL_CHROME_CDP_URL=http://127.0.0.1:9222`); `KSKILL_BROWSER_PROVIDER` can force `browseros` or `chrome-cdp`. The runtime is CDP-only, never launches BrowserOS or runs headless, and exposes typed stop rules for authentication/CAPTCHA/payment/electronic-signature/irreversible-submit boundaries. `hipass-receipt`, `court-auction-notice-search`, `court-payment-order-assistant`, and `yebigun-training` now depend on `k-skill-browser-runtime` via semver (`^0.1.0`), default to the `auto` provider, keep site-specific navigation and parsing in each skill, preserve public/direct HTTP first where available, and disconnect (never close) user-owned browsers. `court-auction-notice-search` and `court-payment-order-assistant` produce their core output (search results / draft + handoff) without launching a real browser. `d2b-notice-search` and `s2b-notice-search` are instruction generators (no CDP connection); their browser fallback guidance now prefers a user-launched BrowserOS CDP or local browser instead of headless Chrome. No login, CAPTCHA, payment, e-signature, or irreversible bypass.
