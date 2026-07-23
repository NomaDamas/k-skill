<!-- mode:dolshoi -->
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.
<!-- mode:generic -->
- Use `k-skill-browser-runtime` (provider `auto`: BrowserOS CDP, then Aside CLI, then user-launched Chrome CDP) for logged-in or rendered-page automation. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
