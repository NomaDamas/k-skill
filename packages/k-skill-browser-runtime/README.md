# k-skill-browser-runtime

Browser runtime adapter for k-skill packages, with BrowserOS first and Aside Browser before Chrome CDP fallback.

## Scope

- The recommended default is `auto`: prefer a user-launched BrowserOS session, then Aside Browser when available, then a Chrome/Chromium CDP session.
- BrowserOS is used as a GUI/session browser over CDP, not as a headless backend, CAPTCHA bypass, login solver, payment solver, or stealth scraping browser.
- The `browseros` provider connects to a user-launched BrowserOS session. It never launches BrowserOS and never passes headless flags.
- The `aside` provider uses the public `aside repl` CLI surface. It does not rely on undocumented local ports or a private CDP endpoint.
- Site-specific navigation, parsing, and irreversible-boundary decisions stay in each skill.

## Providers

| Provider | Default surface | Launches browser | Intended use |
| --- | --- | --- | --- |
| `auto` (default) | BrowserOS `9100`, then `aside repl`, then Chrome `9222` | No | Recommended fallback order |
| `browseros` | `http://127.0.0.1:9100` | No | Force a user-launched BrowserOS GUI/session browser |
| `aside` | `aside repl` | No | Force an available Aside Browser session through the documented CLI REPL |
| `chrome-cdp` | `http://127.0.0.1:9222` | No | Force a Chrome/Chromium CDP session |
Unknown provider names fail closed with a typed `UNKNOWN_PROVIDER` error rather than silently falling back to BrowserOS.

## Environment
- `KSKILL_BROWSER_PROVIDER` selects `auto` (default), `browseros`, `aside`, or `chrome-cdp`.
- `KSKILL_BROWSEROS_CDP_URL` overrides the BrowserOS CDP URL.
- `KSKILL_CHROME_CDP_URL` overrides the Chrome CDP URL.
- `KSKILL_ASIDE_COMMAND` overrides the Aside CLI command (default `aside`).

## Lifecycle

For BrowserOS CDP and Chrome CDP sessions, disconnect automation clients instead of closing the browser application or persistent user profile. For Aside Browser sessions, close only tabs created by the adapter. Pre-existing user pages must not be closed.

## Connect options

`connect(options)` selects and connects to a CDP endpoint. It supports dependency injection for tests:

- `options.probe` — `false` skips the CDP health probe; a function replaces the default `probeCdp` probe.
- `options.connectLoader` — function `(cdpUrl, options) => browser` replacing the default `connectOverCDP` path (which lazily loads `playwright-core`/`playwright`/`rebrowser-playwright`).
- `options.chromiumLoader` — function passed through to the default CDP loader for lazy chromium resolution and caching.

`connect()` probes CDP providers with `<cdpUrl>/json/version` before connecting. For Aside, it runs a safe `aside repl` probe that lists tabs without opening a page. Provider failures throw `UNAVAILABLE`; unknown providers throw `UNKNOWN_PROVIDER`.

## Stop rules

The runtime exports typed stop reasons for manual handoff boundaries: authentication, CAPTCHA, payment, electronic signature, irreversible submit, blocked upstream responses, and provider unavailability.

## Job runner

`runJob({ url, steps, stopOn })` is a narrow declared-step runner. It executes ONLY caller-supplied step functions in declared order and never invents navigation, generates steps, or plans site behavior.

- `steps` — array of caller-supplied async functions `({ page, results }) => result`. Empty/non-array `steps` returns `{ status: "no-steps", results: [] }` without navigating.
- `url` — optional. When a URL is supplied AND at least one caller step exists, the runner performs a single `page.goto(url, { waitUntil: "domcontentloaded" })` before the steps. No URL means no navigation.
- `page` — caller-supplied automation page (for example from `getAutomationPage`). Required only when `url` is supplied.
- `stopOn` — optional async callback `({ page, phase, url, step, index, results }) => stopReason | null` invoked at phase boundaries: once before navigation (`phase: "navigate"`) and once before each step (`phase: "step"`, with `index`). A truthy `stopReason` short-circuits to `{ status: "stopped", stopReason, results }` without bypassing manual handoff boundaries.

Returns `{ status, results }` where `status` is `"no-steps"`, `"stopped"`, or `"complete"`. Non-function steps throw a `TypeError` before any navigation or step execution.
