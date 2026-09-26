#!/usr/bin/env python3
"""Backward-compatible entry point for the KAMIS price helper.

The canonical implementation lives in ``kamis_food_price.py`` (same
directory). This module keeps the historically documented
``scripts/run_kamis.py`` command working without duplicating logic.
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from kamis_food_price import (  # noqa: E402,F401
    HelperError,
    RequestError,
    UsageError,
    build_query,
    main,
    normalize_items,
    parse_price,
    read_secrets,
    resolve_api_key,
    run,
    summarize,
)

if __name__ == "__main__":
    raise SystemExit(main())
