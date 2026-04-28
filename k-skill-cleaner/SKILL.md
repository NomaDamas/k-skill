---
name: k-skill-cleaner
description: Interview the user and inspect coding-agent skill trigger counts to recommend unused K-skills for removal.
---

# k-skill-cleaner

Use this skill when the user wants to slim down a K-skill bundle, find skills they never use, or make an evidence-backed deletion shortlist instead of deleting directories by guesswork.

## Safety contract

- **Do not delete skills automatically.** Produce a ranked recommendation first, then make deletions only after the user explicitly approves the shortlist.
- Treat trigger counts as **best-effort signals**, not absolute truth. Different agents store transcripts differently and may rotate or omit logs.
- Protect any skill the user marks as "keep", even if its trigger count is zero.
- Prefer removing whole root-level skill directories only after checking README/docs/install references in the same change.

## Interview first

Ask a compact interview before scanning or recommending deletion:

1. 어떤 에이전트를 주로 쓰나요? (Claude Code, Codex, OpenCode, OpenClaw/ClawHub, Hermes Agent, 기타)
2. 절대 지우면 안 되는 스킬은 무엇인가요?
3. 본인이 절대로 쓰지 않는다고 확신하는 스킬은 무엇인가요?
4. 최근 30/90/180일 중 어떤 기간의 사용 흔적을 우선 볼까요? helper 실행 시 `--days` 또는 `--since`로 반영합니다.
5. 추천만 원하나요, 아니면 승인 후 실제 삭제까지 원하나요?

## Trigger count sources by agent

| Agent | Where to check | Reliability | Notes |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl`, `~/.claude/transcripts/**/*.jsonl` | best-effort | Look for skill-trigger events, `$skill-name` mentions, and `SKILL.md` loads. |
| Codex | `~/.codex/sessions/**/*.jsonl`, `~/.codex/log/**/*.log`, `.omx/logs/**/*.log` | best-effort | Look for routed skill names, explicit `$skill` invocations, and skill file reads. |
| OpenCode | `~/.local/share/opencode/**/*.jsonl`, `~/.config/opencode/**/*.jsonl` | best-effort | If local schema differs, ask the user for an exported transcript or usage JSON. |
| OpenClaw/ClawHub | `~/.openclaw/**/*.jsonl`, `~/.clawhub/**/*.jsonl` if present | manual-confirm | No stable public local trigger-count schema is assumed; prefer exported stats when available. |
| Hermes Agent | `~/.hermes/**/*.jsonl`, `~/.config/hermes/**/*.jsonl` if present | manual-confirm | No stable public local trigger-count schema is assumed; prefer exported stats when available. |

## Local helper

From an installed standalone skill, run the deterministic helper from the `k-skill-cleaner` skill directory. In a full repository checkout, the compatibility wrapper at `scripts/k_skill_cleaner.py` accepts the same options.

```bash
python3 scripts/k_skill_cleaner.py \
  --skills-root . \
  --scan-default-logs \
  --days 90 \
  --never-use blue-ribbon-nearby,lotto-results \
  --keep k-skill-setup,k-skill-cleaner
```

For agent exports or hand-curated counts, pass a JSON object mapping skill name to trigger count:

```bash
python3 scripts/k_skill_cleaner.py --skills-root . --usage-json usage-counts.json --days 90
```

`--days` and `--since` filter scanned log records only. `--usage-json` values are already-aggregated counts, so prepare/export that JSON for the same time window before passing it to the helper.

The helper prints JSON with:

- `skill_count`: number of root-level skills discovered.
- `candidates`: ranked `remove` or `review` candidates with `trigger_count` and `reasons`.
- `agent_usage_sources`: the agent-specific paths and caveats above.
- `time_window`: the effective `--since`/`--days` cutoff and mtime fallback caveat.
- `usage_json`: whether imported counts were merged and the pre-windowing caveat.
- `scanned_logs`: how many readable log files were scanned and which paths contributed best-effort evidence.
- `safety`: reminder that no files were deleted.

## Recommendation policy

- `remove`: user explicitly marked the skill as never used. Mention any zero/low trigger evidence as supporting context.
- `review`: trigger count is zero or below the selected low-usage threshold, but the user did not explicitly ask to remove it.
- `keep`: user-protected skills and actively triggered skills.

When reporting, group recommendations like this:

1. **삭제 후보** — interview says never used, with trigger evidence.
2. **검토 후보** — zero/low trigger count only.
3. **보존 후보** — protected or recently used.
4. **통계 한계** — which agents had no readable logs and require manual export.

## If deletion is approved

1. Remove the skill directory.
2. Remove README table/list entries and `docs/features/<skill>.md` links.
3. Remove `docs/install.md --skill <skill>` entries.
4. Remove package/workspace/test references only if the skill owns those files.
5. Run `npm run lint`, `npm run typecheck`, and `npm run test` (or `npm run ci` for packaging/release changes).
