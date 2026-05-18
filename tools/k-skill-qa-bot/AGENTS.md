# tools/k-skill-qa-bot — Agent instructions

Source tree for **k-skill-qa-bot**, an automated QA daemon for the k-skill repository.

## What this is

- Source for an **external** macOS daemon installed at `~/.local/share/k-skill-qa-bot/`.
- Every 3 days (launchd LaunchAgent), the daemon:
  1. Refreshes a shallow clone of `NomaDamas/k-skill` `main`.
  2. Discovers every `<skill>/SKILL.md`, classifies each skill (read-only / location / login / destructive / api-key / proxy-dependent / deprecated).
  3. Runs each suitable skill through `codex exec --dangerously-bypass-approvals-and-sandbox` with a smoke-test prompt synthesized from the skill's `## When to use`, while keeping the separate LLM judge on a read-only/no-approval Codex path.
  4. An LLM judge (`codex exec --output-schema`) grades pass / fail / skip.
  5. Failed skills are filed as dedup'd issues on `NomaDamas/k-skill`. Skipped skills (login required, deprecated, missing API key) never create issues.

## Install path

After running `install.sh`, the runtime lives at `~/.local/share/k-skill-qa-bot/`.

The k-skill repository itself is **never modified** by the bot — it is read-only SSOT. Test prompts are synthesized from each `SKILL.md`.

## Trust-boundary notes

- Smoke tests intentionally run unsandboxed and may contact public skill endpoints, plus git, Codex, GitHub, and k-skill-proxy health-check endpoints.
- A dedicated LaunchAgent is scheduling isolation only; it is not a separate OS user, container, or filesystem sandbox.
- The bot-managed clone is not write-protected from the unsandboxed smoke agent; treat it as mutable bot state rather than a write-protected filesystem boundary.
- The judge uses read-only/no-approval Codex settings, but is still a tool-capable Codex agent over untrusted transcripts and skill Markdown. Do not describe it as a no-tools or file-isolated model call unless the implementation changes to enforce that boundary.

## Design rules

- **SSOT**: All test prompts and skill metadata come from `SKILL.md` files in the bot's own shallow clone of `NomaDamas/k-skill` `main`. The k-skill repo gets no QA-bot-specific edits.
- **First-run safety**: `CREATE_ISSUES=false` is the default. Users must opt in by writing `CREATE_ISSUES=true` to `~/.local/share/k-skill-qa-bot/.env`.
- **Deprecated skills**: Detected by parsing the cloned `README.md` for `~~`…`~~` strike-through and `⚠️ 지원 중단` markers. Always SKIPPED, never failed.
- **Login / destructive skills**: Force-skipped via `config/skill-overrides.yml`. Never filed as issues.
- **`update-clone.sh` self-destruction guard**: Refuses to operate if `K_SKILL_CLONE` resolves to a directory that does not look like a managed-by-the-bot clone (no `state/clone-head` ancestor, or matches the development tree). Required after a real incident where the script git-reset the very tree it lived in.
