# k-skill-qa-bot

Automated QA daemon for the **k-skill** skill library. Runs every 3 days via macOS launchd, tests every suitable skill via `codex exec --json --dangerously-bypass-approvals-and-sandbox`, has a read-only/no-approval LLM judge grade pass/fail/skip, and files dedup'd GitHub issues for skills that have broken.

## What it does

1. **Refreshes** a shallow clone of `NomaDamas/k-skill` `main` every 3 days.
2. **Discovers** every `<skill>/SKILL.md`.
3. **Classifies** each skill (read-only / location / login / destructive / api-key / proxy-dependent / deprecated).
4. **Runs** each suitable skill through `codex exec --json --dangerously-bypass-approvals-and-sandbox` with a smoke-test prompt synthesized from the skill's `## When to use` bullets. The daemon runs as a dedicated LaunchAgent with non-interactive approvals; avoiding the Codex sandbox prevents false DNS/network failures during skill smoke tests.
5. **Judges** the result via a second read-only/no-approval `codex exec` call using the configured judge model and a strict JSON Schema.
6. **Files** dedup'd issues on `NomaDamas/k-skill` for true failures (with `auto-qa` label). Skipped skills (deprecated, login-required, missing API key) never create issues.

The k-skill repo itself is **never modified** by the bot — it is read-only SSOT. Test prompts are synthesized from each `SKILL.md`.

## Install

Prereqs (one-time):

```bash
brew install bats-core coreutils gh jq python@3
pip3 install pyyaml jsonschema pytest

codex --version       # codex-cli >= 0.130
codex login           # one-time

gh auth login         # one-time, needs `repo` scope
```

Then:

```bash
cd /path/to/k-skill
bash tools/k-skill-qa-bot/install.sh
```

Re-run `install.sh` to upgrade — it is idempotent and preserves `state/`.

## Configure

The default `CREATE_ISSUES=false` means **the first run does NOT file any issues**. After reviewing the first `summary.md`, opt in:

```bash
echo 'CREATE_ISSUES=true' >> ~/.local/share/k-skill-qa-bot/.env
```

Overridable variables (see `config/defaults.sh`):

| Var | Default | Meaning |
|---|---|---|
| `CREATE_ISSUES` | `false` | File GH issues for failures |
| `CODEX_MODEL` | `gpt-5.5` | Model for skill exec |
| `JUDGE_MODEL` | `gpt-5.5` | Model for LLM judge |
| `CODEX_PROVIDER` | `openai` | Codex model provider for skill exec and judge calls |
| `TIMEOUT_SECS` | `180` | Per-skill timeout |
| `JUDGE_TIMEOUT_SECS` | `60` | Per-judge timeout |
| `MAX_PARALLEL` | `4` | Concurrent skill tests |
| `LAST_RUN_MIN_AGE` | `259200` | Min seconds between runs (72h) |
| `GH_REPO` | `NomaDamas/k-skill` | Where to file issues |

`config/skill-overrides.yml` controls per-skill `force_skip` and category overrides. Destructive booking flows (`ktx-booking`, `srt-booking`, `catchtable-sniper`, etc.) and session-required skills (`kakaotalk-mac`, `hipass-receipt`, `toss-securities`, `iros-registry-automation`) are force-skipped by default so the bot never abuses an account.

## Logs and inspection

```bash
tail -f ~/Library/Logs/k-skill-qa-bot/stderr.log
cat ~/.local/share/k-skill-qa-bot/state/runs/$(ls -t ~/.local/share/k-skill-qa-bot/state/runs/ | head -1)/summary.md
```

The bot keeps the most recent 12 runs and purges older ones.

## Force a run

```bash
~/.local/share/k-skill-qa-bot/bin/run-qa.sh --force
~/.local/share/k-skill-qa-bot/bin/run-qa.sh --force --only kbo-results
~/.local/share/k-skill-qa-bot/bin/run-qa.sh --force --dry-run     # no issues regardless of CREATE_ISSUES
```

## Uninstall

```bash
bash ~/.local/share/k-skill-qa-bot/uninstall.sh
bash ~/.local/share/k-skill-qa-bot/uninstall.sh --yes --purge --purge-logs
```

## Safety

- Skill smoke tests use `--dangerously-bypass-approvals-and-sandbox` because the Codex sandbox can block legitimate DNS/network lookups for public skill endpoints exercised by smoke tests.
- A dedicated LaunchAgent is scheduling isolation only; it is not a separate OS user, container, or filesystem sandbox.
- The bot-managed clone is not write-protected from the unsandboxed smoke agent; treat it as mutable bot state and judge only against inputs whose provenance is understood.
- The LLM judge stays on the safer `-s read-only` path with `approval_policy="never"`; read-only/no-approval limits writes and approval prompts, but does not make the judge a no-tools or file-isolated model call. Treat transcript and skill Markdown as untrusted input.
- 10 destructive/login-required skills are force-skipped before any codex call is issued.
- Deprecated skills (`~~name~~ ⚠️ 지원 중단` in README) are detected and skipped.
- `update-clone.sh` refuses any `K_SKILL_CLONE` outside `K_QA_HOME/k-skill-clone` unless `ALLOW_EXTERNAL_CLONE_TARGET=1` (prevents the script from git-reset'ing the wrong directory).
- `CREATE_ISSUES=false` first-run default prevents accidental issue spam.
- Local state only: `~/.local/share/k-skill-qa-bot/`. Expected network egress is limited to git fetch, codex API, gh API, k-skill-proxy health checks, and the public skill endpoints exercised by smoke tests.

## Troubleshooting

- `codex: command not found` → check the plist's `EnvironmentVariables.PATH`. Default is `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`.
- `gh: not authenticated` → run `gh auth login` with `repo` scope.
- `gtimeout: command not found` → `brew install coreutils`.
- LaunchAgent state via `launchctl print "gui/$(id -u)/org.nomadamas.k-skill-qa-bot" | head`.
- Force a re-run: `launchctl kickstart -k "gui/$(id -u)/org.nomadamas.k-skill-qa-bot"`.
