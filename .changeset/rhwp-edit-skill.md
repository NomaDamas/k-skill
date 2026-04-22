---
"k-skill-rhwp": minor
---

Introduce the initial `k-skill-rhwp` Node CLI + library that wraps `@rhwp/core` WASM editing bindings as subcommands (`info`, `list-paragraphs`, `search`, `insert-text`, `delete-text`, `replace-all`, `create-table`, `set-cell-text`, `create-blank`, `render`). This is the editing engine backing the new `rhwp-edit` skill and is the counterpart to the existing `hwp` (kordoc, read/convert) and the new `rhwp-advanced` (upstream rhwp Rust CLI) skills. Case-insensitive `replace-all` rejects inputs whose case folding changes UTF-16 length (e.g. Turkish `İ` U+0130) with exit code 1 instead of silently drifting offsets; rerun with `--case-sensitive` for those documents. Closes #155.
