---
---

Removed `k-skill-rhwp` wrapper package. Skills (`rhwp-edit`, `rhwp-advanced`,
`hwp`, `corporate-registration-consulting`) now call `@rhwp/core` directly via
inline Node.js scripts. No replacement package — see `rhwp-edit/SKILL.md` for
the WASM init recipe and API usage.

`corporate-registration-consulting/scripts/fill_official_hwp.py` now uses a
batch Node.js helper (`_rhwp_set_cell.mjs`) that initializes WASM once and
applies all cell edits in a single pass.
