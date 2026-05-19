#!/usr/bin/env bash
# html-presentation sample engine sync checker
# Verifies that samples/*/engine/ matches the canonical engine/
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL="$SKILL_DIR/engine"
SAMPLES_DIR="$SKILL_DIR/samples"

if [ ! -d "$CANONICAL" ]; then
  echo "ERROR: canonical engine not found at $CANONICAL" >&2
  exit 1
fi

EXIT_CODE=0

for sample_engine in "$SAMPLES_DIR"/*/engine; do
  [ -d "$sample_engine" ] || continue
  sample_name="$(basename "$(dirname "$sample_engine")")"

  # Compare each file in canonical against the sample copy
  while IFS= read -r -d '' canonical_file; do
    rel_path="${canonical_file#$CANONICAL/}"
    sample_file="$sample_engine/$rel_path"
    if [ ! -f "$sample_file" ]; then
      echo "MISSING in $sample_name: $rel_path" >&2
      EXIT_CODE=1
      continue
    fi
    if ! cmp -s "$canonical_file" "$sample_file"; then
      echo "DRIFT in $sample_name: $rel_path" >&2
      EXIT_CODE=1
    fi
  done < <(find "$CANONICAL" -type f -print0)
done

if [ $EXIT_CODE -eq 0 ]; then
  echo "all samples in sync with canonical engine"
fi

exit $EXIT_CODE
