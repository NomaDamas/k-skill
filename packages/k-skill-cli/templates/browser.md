<!-- mode:dolshoi -->
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.
<!-- mode:generic -->
- Use `k-skill-browser-runtime` (provider `auto`) for logged-in or rendered-page automation. On macOS it tries Aside Browser first, then BrowserOS CDP, then user-launched Chrome/Chromium CDP; on other platforms it tries BrowserOS CDP, then Aside Browser, then user-launched Chrome/Chromium CDP. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
