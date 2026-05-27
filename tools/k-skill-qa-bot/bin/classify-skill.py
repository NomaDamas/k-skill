#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / "lib"))

import qa_utils  # type: ignore  # noqa: E402


LOCATION_REQUIRED = {
    "blue-ribbon-nearby", "cheap-gas-nearby", "kakao-bar-nearby",
    "public-restroom-nearby", "parking-lot-search", "fine-dust-location",
    "daangn-cars-search", "daangn-jobs-search", "daangn-realty-search",
    "daangn-used-goods-search", "donation-place-search",
    "korean-transit-route", "delivery-tracking",
}
LOGIN_REQUIRED = {
    "catchtable-sniper", "kakaotalk-mac", "hipass-receipt", "toss-securities",
    "iros-registry-automation", "ktx-booking", "srt-booking",
    "foresttrip-vacancy",
}
DESTRUCTIVE = {
    "ktx-booking", "srt-booking", "express-bus-booking",
    "intercity-bus-booking", "catchtable-sniper", "foresttrip-vacancy",
}
API_KEY_ENV_BY_SKILL = {
    "k-dart": "API_K_DART",
    "korean-patent-search": "KIPRIS_API_KEY",
    "korean-transit-route": "ODSAY_API_KEY",
    "korean-stock-search": "KRX_API_KEY",
    "kosis-stats": "KOSIS_API_KEY",
}
PROXY_DEPENDENT = {
    "blue-ribbon-nearby", "cheap-gas-nearby", "daangn-cars-search",
    "daangn-jobs-search", "daangn-realty-search", "daangn-used-goods-search",
    "daishin-report-search", "donation-place-search", "fine-dust-location",
    "gangnamunni-clinic-search", "gongsijiga-search", "han-river-water-level",
    "household-waste-info", "k-schoollunch-menu", "kbl-results", "kbo-results",
    "kleague-results", "korea-weather", "korean-marathon-schedule",
    "korean-stock-search", "korean-transit-route", "kosis-stats",
    "lh-notice-search", "library-book-search", "mfds-drug-safety",
    "mfds-food-safety", "naver-news-search", "naver-shopping-search",
    "nts-business-registration", "seoul-density", "seoul-subway-arrival",
    "toss-securities",
}

_API_VAR_RE = re.compile(r"\b(API_[A-Z][A-Z0-9_]+)\b")


def _is_read_only(flags: dict) -> bool:
    return not (
        flags["login"]
        or flags["destructive"]
        or flags["api_key"]
        or flags["location"]
    )


def _read_skill_md(md_path):
    if not md_path:
        return ""
    p = Path(md_path)
    if not p.is_file():
        return ""
    try:
        return p.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return ""


def classify(entry: dict, overrides: dict, deprecated: set) -> dict:
    name = entry.get("name") or ""
    flags = {
        "location": name in LOCATION_REQUIRED,
        "login": name in LOGIN_REQUIRED,
        "destructive": name in DESTRUCTIVE,
        "api_key": name in API_KEY_ENV_BY_SKILL,
        "proxy_dependent": name in PROXY_DEPENDENT,
        "read_only": False,
    }
    env_required = []
    if name in API_KEY_ENV_BY_SKILL:
        env_required.append(API_KEY_ENV_BY_SKILL[name])

    md_text = _read_skill_md(entry.get("skill_md_path"))
    if "k-skill-proxy" in md_text:
        flags["proxy_dependent"] = True
    for m in _API_VAR_RE.finditer(md_text):
        env_required.append(m.group(1))
        flags["api_key"] = True

    env_required = sorted(set(env_required))
    flags["read_only"] = _is_read_only(flags)

    skip_reason = None
    override_applied = False

    if name in deprecated:
        skip_reason = "deprecated in README"
        override_applied = True
    else:
        ov = overrides.get(name) if isinstance(overrides, dict) else None
        if isinstance(ov, dict):
            if isinstance(ov.get("category_override"), dict):
                for k, v in ov["category_override"].items():
                    if k in flags:
                        flags[k] = bool(v)
                flags["read_only"] = _is_read_only(flags)
                override_applied = True
            extra_env = ov.get("env_required")
            if isinstance(extra_env, list) and extra_env:
                env_required = sorted(set(env_required) | {str(e) for e in extra_env})
                flags["api_key"] = True
            if ov.get("force_skip"):
                skip_reason = str(ov.get("reason") or "force_skip override")
                override_applied = True

        if skip_reason is None and (flags["login"] or flags["destructive"]):
            skip_reason = "requires user login or executes destructive actions"

        if skip_reason is None and flags["api_key"]:
            missing = [v for v in env_required if not os.environ.get(v)]
            if missing:
                skip_reason = f"missing required env: {', '.join(missing)}"

    description = ""
    fm = entry.get("frontmatter")
    if isinstance(fm, dict):
        d = fm.get("description")
        if isinstance(d, str):
            description = d
    when_to_use = entry.get("when_to_use") or []
    default_inputs = {}
    ov = overrides.get(name) if isinstance(overrides, dict) else None
    if isinstance(ov, dict) and isinstance(ov.get("default_inputs"), dict):
        default_inputs = ov["default_inputs"]

    prompt = qa_utils.synthesize_test_prompt(
        name=name,
        when_to_use=when_to_use,
        description=description,
        category_flags=flags,
        default_inputs=default_inputs,
    )

    return {
        "name": name,
        "category_flags": flags,
        "env_required": env_required,
        "default_test_prompt": prompt,
        "skip_reason": skip_reason,
        "override_applied": override_applied,
    }


def _default_overrides_path() -> Path:
    home = os.environ.get("K_QA_HOME")
    if home:
        p = Path(home) / "config" / "skill-overrides.yml"
        if p.is_file():
            return p
    return _HERE.parent / "config" / "skill-overrides.yml"


def _default_readme_path() -> Path:
    clone = os.environ.get("K_SKILL_CLONE")
    if clone:
        p = Path(clone) / "README.md"
        if p.is_file():
            return p
    return Path("README.md")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Classify a k-skill manifest entry.")
    ap.add_argument("--overrides", type=Path, default=None)
    ap.add_argument("--readme", type=Path, default=None)
    args = ap.parse_args(argv)

    overrides_path = args.overrides or _default_overrides_path()
    readme_path = args.readme or _default_readme_path()

    raw = sys.stdin.read()
    try:
        entry = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"classify-skill.py: invalid JSON on stdin: {exc}", file=sys.stderr)
        return 2
    if not isinstance(entry, dict):
        print("classify-skill.py: stdin JSON must be an object", file=sys.stderr)
        return 2

    try:
        overrides = qa_utils.load_overrides(overrides_path)
    except RuntimeError as exc:
        print(f"classify-skill.py: {exc}", file=sys.stderr)
        return 2

    deprecated = qa_utils.parse_readme_deprecations(readme_path)

    result = classify(entry, overrides, deprecated)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
