# K-Skill Korean Writing

A K-Skill bundle for editing Korean text that a user pastes into the current conversation. It preserves facts, quotations, dates, figures, and tone while improving awkward phrasing.

## Install in Claude Code

```text
/plugin install k-skill-korean-writing --marketplace NomaDamas/k-skill
```

This installs only the directory-safe Korean writing plugin, not the full K-Skill marketplace bundle.

## Scope

This bundle contains one instruction-only skill: `korean-writing-editor`. It has no executable helpers, hooks, MCP server, proxy route, login flow, background job, file access, analytics, or credential handling. It does not inspect a user’s device or fetch remote writing instructions.

The host model processes the text under its own data practices. Do not paste passwords, authentication codes, payment-card numbers, government identifiers, or private medical details.

## Examples

- `보고서 문장을 자연스럽게 다듬되, 숫자와 날짜는 그대로 두세요.`
- `이 업무 메일에서 어색한 번역투만 최소한으로 고쳐 주세요.`
- `고치지 말고 반복되는 표현과 그 이유만 알려 주세요.`

## Support and license

Report package issues at [NomaDamas/k-skill](https://github.com/NomaDamas/k-skill/issues) with a synthetic example. Read the [plugin privacy notice](https://github.com/NomaDamas/k-skill/blob/main/docs/official-plugin-privacy.md) and [directory terms](https://github.com/NomaDamas/k-skill/blob/main/docs/official-plugin-terms.md) before installing. MIT License.
