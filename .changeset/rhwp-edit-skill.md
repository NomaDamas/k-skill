---
"k-skill-rhwp": minor
---

Introduce the initial `k-skill-rhwp` Node CLI + library that wraps `@rhwp/core` WASM editing bindings as subcommands (`info`, `list-paragraphs`, `search`, `insert-text`, `delete-text`, `replace-all`, `create-table`, `set-cell-text`, `create-blank`, `render`). This is the editing engine backing the new `rhwp-edit` skill and is the counterpart to the existing `hwp` (kordoc, read/convert) and the new `rhwp-advanced` (upstream rhwp Rust CLI) skills. Closes #155.
