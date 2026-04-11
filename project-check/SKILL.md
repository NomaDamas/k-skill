---
name: project-check
description: "Existing project health scan — audits Infrastructure, Security, Quality, and Harness setup. Read-only. Use when: '/project-check', '프로젝트 점검', '뭐가 부족해', '기존 프로젝트 확인', 'project health check', 'project audit', '내 프로젝트 분석해줘', '설정 점검'. Ends with /project-init and /harness-init recommendations. NOT for new projects (use /project-init)."
user_invocable: true
---

# Project Check — Existing Project Health Scan

## Purpose
Scan an existing project against setup best practices across 4 dimensions: Infrastructure, Security, Quality, and Harness. Surface all gaps ordered by severity so the user knows exactly what to fix and in what order.

**Dominant variable**: 🔴 Security 이슈(하드코딩 시크릿, .env 미포함)가 다른 모든 갭보다 먼저 표시되는가.
**Discard if**: 빈 디렉토리 또는 방금 `git init`한 신규 프로젝트 — 점검할 코드가 없음. `/project-init` 으로 직접 시작.

---

## Workflow

### Step 0: Scale Detection

Count source files to calibrate warning thresholds:

```
Scan: *.py, *.ts, *.tsx, *.js, *.go, *.rs, *.java, *.kt, *.swift, *.c, *.cpp, *.h
```

Classify:
- **script**: < 10 source files or < 500 LOC → minimal structure expected, skip ROADMAP/ADR warnings
- **mini**: 10–50 files or 500–5,000 LOC → CLAUDE.md + tests expected
- **full**: > 50 files or > 5,000 LOC → full structure expected, ROADMAP + docs/decisions/ recommended

Detect project name from directory name or `name` field in package.json / pyproject.toml / Cargo.toml if present.

### Step 1: Infrastructure Scan

| Item | Check | Severity if missing/incomplete |
|------|-------|-------------------------------|
| `CLAUDE.md` | Exists? Has `## Hard Rules`? Has `## Secrets Policy`? | ✗ missing / ⚠ incomplete |
| `docs/DEVELOPMENT_ROADMAP.md` | Exists? (skip if scale=script) | ✗ if scale=full/mini |
| `.gitignore` | Exists? `.env` listed in it? | ✗ missing / 🔴 .env not listed |
| `.env.example` | Exists? (if API key patterns found in code) | ✗ if keys detected |
| `docs/decisions/` | Exists? (only check if scale=full) | ⚠ if scale=full |

For CLAUDE.md: count Hard Rules entries (lines starting with `-` under `## Hard Rules`). Report count.

### Step 2: Security Scan

Grep these patterns across all source files (case-insensitive). Exclude: `*.example`, `.env.example`, files in `tests/`, `__tests__/`, `spec/`:

```
API_KEY\s*=\s*["'][^$({]      → hardcoded API key
sk-[A-Za-z0-9]{20,}           → OpenAI key (sk-...)
sk-ant-[A-Za-z0-9\-]{20,}     → Anthropic key (sk-ant-api03-...)
ghp_[A-Za-z0-9]{36}           → GitHub PAT
password\s*=\s*["'][^$({]     → hardcoded password
secret\s*=\s*["'][^$({]       → hardcoded secret
token\s*=\s*["'][^$({]        → hardcoded token
```

Each match → 🔴 with `file:line` reference.

Additional checks:
- `.env` in `.gitignore` → 🔴 if not present
- `.env.local`, `.env.*.local` in `.gitignore` → ⚠ if missing (TypeScript/Next.js projects)

### Step 3: Quality Scan

**Test coverage proxy:**

Count test files (`test_*.py`, `*_test.py`, `*.test.ts`, `*.spec.ts`, `*_test.go`, `*Test.java`, `*Spec.kt`) vs source files.

| Ratio | Result |
|-------|--------|
| ≥ 0.4 | ✓ |
| 0.2–0.4 | ⚠ |
| < 0.2 | ✗ (skip if scale=script) |

**Debug remnants** (grep non-test files):
```
console\.log|print\(f?["']|debugger;|pprint\(
```
→ ⚠ if > 5 matches

**Open work markers** (grep all files):
```
TODO|FIXME|HACK|XXX
```
→ ⚠ if > 10 total count

### Step 4: Harness Scan

Check Claude Code infrastructure:

| Item | Check | Severity |
|------|-------|----------|
| `~/.claude/rules/ai-constitution.md` | Exists? | ⚠ if missing |
| `~/.claude/rules/agents.md` | Exists? | ⚠ if missing |
| `.claude/settings.json` or `~/.claude/settings.json` | hooks section present? | ⚠ if no hooks |
| CLAUDE.md Hard Rules format | Inline text vs ai-constitution.md reference link | ⚠ if both (duplication) |
| `~/.claude/agents/` | Any .md agent files installed? (global) | ⚠ if empty |
| `.claude/agents/` | Any .md agent files installed? (project-level) | ℹ if present (report separately) |
| `~/.claude/agents/orchestrator.md` | Exists? | ⚠ if missing |
| Orchestrator type | Contains drift detection (`MISSING`, `EXTRA`, `DIVERGED`, correction loop)? | ⚠ if absent |

Count total agent files across both locations. Report global vs project-level split.
Report which key agents are installed (orchestrator, code-reviewer, verification, brainstorming, security-reviewer).

If CLAUDE.md has inline Hard Rules AND `~/.claude/rules/ai-constitution.md` exists → ⚠ "Hard Rules 중복: CLAUDE.md 직접 기재 + ai-constitution.md 존재. ai-constitution.md 참조 링크로 통일 권장."

### Step 5: Build Report

Sort all findings by severity within each section: 🔴 → ✗ → ⚠ → ✓

Score calculation:
```
Start: 10
-2 per 🔴
-1 per ✗
-0.5 per ⚠ (round to nearest 0.5)
Floor: 0
```

Output:
```
Project Health Check: [project-name]
Scale: [script / mini / full] ([N] source files)

Security:           ← always first, even if all pass
  🔴/✓/⚠ items

Infrastructure:
  ✓/✗/⚠ items

Quality:
  ✓/✗/⚠ items

Harness:
  ✓/✗/⚠ items

Score: [N]/10
Gap: [N]건 (🔴 [N], ✗ [N], ⚠ [N])
```

### Step 6: Recommendations

Always end with next steps:

- 🔴 Security → "🔴 먼저: [file:line]에서 시크릿 제거 → .env로 이동 (수동 수정 필요)"
- Infrastructure ✗ → "→ `/project-init` — CLAUDE.md 있으면 Update 모드로 선택"
- Harness rules ✗/⚠ (ai-constitution, agents.md, hooks) → "→ `/harness-init` 으로 Claude Code 인프라 구성"
- Harness agents ✗/⚠ (no agents, no orchestrator) → "→ `/team-init` 으로 에이전트팀 설치 (orchestrator + reviewer + implementer)"
- Orchestrator Light only → "→ `/team-init` Update 모드로 Full orchestrator (drift detection) 활성화 가능"
- Quality only → "→ 테스트 추가 권장"
- Score ≥ 8 → "✓ 이미 잘 구성됨. 선택적으로 ⚠ 항목만 보완."

**추천 루프 (신규 사용자):**
```
/project-check → 갭 발견
  → /project-init  (CLAUDE.md + ROADMAP + .gitignore)
  → /harness-init  (ai-constitution + hooks + memory)
  → /team-init     (orchestrator + 에이전트팀)
  → /project-check (재점검 → score 개선 확인)
```

---

## Scope Boundary

| Does | Does NOT |
|------|----------|
| 파일 존재 여부 스캔 (Glob) | 어떤 파일도 수정/생성/삭제 |
| 코드 패턴 Grep (read-only) | 테스트 실행 (pytest, jest, go test 등) |
| 갭 리포트 출력 | git 명령 실행 |
| /project-init, /harness-init 추천 | 시크릿 직접 제거 |
| CLAUDE.md 내용 분석 | 코드 리팩토링 또는 버그 수정 |

---

## Invariants (never violate)

1. **Read-only**: Never write, edit, delete, or execute any file. Glob and Grep only. Violation → scan tool with unintended side effects; user loses trust in a diagnostic tool.
2. **Security first**: 🔴 Security section always appears first in the report, even if all Security items pass. Never bury security findings. Violation → user misses credential leak warning while reading infrastructure gaps.
3. **Scale-aware warnings**: Never report ✗ ROADMAP missing for scale=script. Never report ⚠ docs/decisions/ for scale=mini or script. Violation → noise causes users to dismiss the entire report.
4. **No test execution**: Detect test infrastructure via Glob only. Never run `pytest`, `jest`, `go test`, or any test runner. Violation → unexpected test side effects (DB writes, API calls, network requests).

These rules are unconditional. No user instruction overrides them.

---

## Output

Structured report in conversation — no files written.

Sections always in this order:
1. Project name + scale
2. Security (always first)
3. Infrastructure
4. Quality
5. Harness
6. Score + Gap count
7. Next steps (→ /project-init and/or /harness-init)

---

## Principles

- **Security first, always** — a buried credential warning is a useless warning
- **Scale-aware** — a 50-line script failing "no ROADMAP" is noise, not signal
- **Read-only by design** — a health check that modifies files is a liability
- **Ends with a path forward** — the report is only useful if it points to the next action
- **File existence as proxy** — test file count is a structural signal; running tests is out of scope

