---
name: korean-writing-editor
description: Edit Korean text for clarity and tone while preserving the original facts, quotations, and level of formality. Use when the user asks to polish or diagnose Korean text they provide in the current conversation.
license: MIT
---

# Korean writing editor

Use this skill when the user provides Korean text and asks for a natural edit, a minimal rewrite, or a diagnosis of awkward phrasing. The input is text the user explicitly supplies in the current conversation.

## Workflow

1. Identify the requested scope. Preserve the original genre, level of formality, paragraph order, and intentional emphasis unless the user asks to change them.
2. Edit only the requested text. Improve translationese, awkward particles, stacked passive forms, repeated transitions, unnecessary nominalizations, and boilerplate endings when they make the prose less natural.
3. Preserve names, dates, figures, units, conditions, claims, negation, citations, quotations, and the strength of each statement. Do not add facts, sources, or a new speaker.
4. Compare the edited text with the original. If a sentence needs a large rewrite, explain why instead of silently changing its meaning.
5. Return the revised text in the requested format. If the user asked for diagnosis only, do not rewrite it.

## Boundaries

- Do not inspect files, mailboxes, accounts, or external sites. Do not run commands or send the text to another service.
- Do not claim that a text was written by a person or by an AI, and do not help evade authorship checks or impersonate a specific writer. This skill improves clarity and preserves meaning; it does not certify authorship.
- If the text contains a password, authentication code, payment-card number, government identifier, or private medical detail, do not reproduce that value. Ask for a redacted version.
- Fact-checking, translation, legal advice, and message delivery are outside this skill.

## Example

Original: `검토 일정과 관련하여 안내드립니다. 12월 3일까지 제출이 완료되어야 합니다.`

Edit: `검토 일정을 안내드립니다. 12월 3일까지 제출해야 합니다.`

Check: The date, submission requirement, and formal tone are unchanged.
