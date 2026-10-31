#!/usr/bin/env python3
"""Select event-sensitive assets from available sourced series."""

from __future__ import annotations

from typing import Any


PROFILES = {
    "monetary_policy": (("short_rates", "long_rates", "curve", "fx", "broad_equity", "volatility"), ("rates", "fx", "equity", "volatility")),
    "inflation": (("short_rates", "long_rates", "inflation_breakeven", "fx", "growth_equity", "broad_equity", "volatility"), ("rates", "fx", "equity", "volatility")),
    "employment": (("short_rates", "long_rates", "curve", "fx", "growth_equity", "broad_equity", "volatility"), ("rates", "fx", "equity", "volatility")),
    "growth": (("long_rates", "cyclical_equity", "broad_equity", "fx", "commodity"), ("rates", "equity", "fx", "commodity")),
    "financial_stress": (("short_rates", "bank_equity", "credit", "volatility", "safe_haven", "broad_equity", "fx"), ("rates", "credit", "equity", "volatility", "fx")),
    "sovereign_credit": (("government_bond", "sovereign_cds", "fx", "gold", "broad_equity", "volatility"), ("rates", "credit", "fx", "commodity", "equity", "volatility")),
    "geopolitics": (("oil", "gold", "safe_haven", "fx", "volatility", "broad_equity"), ("commodity", "fx", "rates", "volatility", "equity")),
    "commodity_supply": (("oil", "commodity", "inflation_breakeven", "commodity_equity", "fx", "broad_equity", "volatility"), ("commodity", "rates", "equity", "fx", "volatility")),
    "corporate_earnings": (("event_security", "sector_equity", "broad_equity", "volatility"), ("equity", "volatility")),
    "fiscal_policy": (("government_bond", "curve", "fx", "broad_equity"), ("rates", "fx", "equity")),
    "trade_policy": (("short_rates", "long_rates", "curve", "affected_equity", "broad_equity", "fx", "oil", "commodity", "volatility"), ("rates", "equity", "fx", "commodity", "volatility")),
    "regulation": (("affected_equity", "sector_equity", "broad_equity", "volatility"), ("equity", "volatility")),
    "market_shock": (("event_security", "broad_equity", "volatility", "credit", "safe_haven"), ("equity", "volatility", "credit", "rates")),
    "other": (("event_security", "broad_equity", "fx", "short_rates", "long_rates", "government_bond", "volatility"), ("price", "equity", "fx", "rates", "volatility")),
}

EVENT_TYPE_LABELS = {
    "monetary_policy": "통화정책", "inflation": "물가", "employment": "고용", "growth": "성장",
    "financial_stress": "금융스트레스", "sovereign_credit": "국가신용", "geopolitics": "지정학",
    "commodity_supply": "원자재 공급", "corporate_earnings": "기업실적", "fiscal_policy": "재정정책",
    "trade_policy": "무역정책", "regulation": "규제", "market_shock": "시장충격", "other": "사건별",
}
ROLE_LABELS = {
    "short_rates": "단기금리", "long_rates": "장기금리", "curve": "금리곡선", "government_bond": "국채",
    "bank_equity": "은행주", "credit": "신용", "volatility": "변동성", "safe_haven": "안전자산",
    "oil": "원유", "gold": "금", "fx": "외환", "broad_equity": "시장지수", "sector_equity": "업종주",
    "event_security": "사건 직접 노출 종목", "affected_equity": "영향 주식", "commodity": "원자재",
    "growth_equity": "성장주", "cyclical_equity": "경기민감주", "commodity_equity": "원자재 관련주",
    "inflation_breakeven": "기대인플레이션", "sovereign_cds": "국가 CDS",
}


def select_assets(series: list[dict[str, Any]], event: dict[str, Any], requested: tuple[str, ...] | None = None, limit: int = 8) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20:
        raise ValueError("asset selection limit must be an integer from 1 to 20")
    by_symbol = {item["symbol"].casefold(): item for item in series}
    if requested:
        selected, missing = [], []
        for symbol in requested:
            item = by_symbol.get(symbol.casefold())
            if item is None:
                missing.append(symbol)
            elif item not in selected:
                selected.append(item)
        reasons = [{"symbol": item["symbol"], "reason": "사용자 지정", "matched_roles": []} for item in selected]
        return selected, reasons, missing

    event_type = str(event.get("event_type") or "other")
    preferred_roles, preferred_classes = PROFILES.get(event_type, PROFILES["other"])
    event_region = str(event.get("region") or "GLOBAL").upper()
    scored: list[tuple[int, int, str, dict[str, Any], list[str]]] = []
    for item in series:
        roles = [str(role).casefold() for role in item.get("roles", [])]
        matched = [role for role in preferred_roles if role in roles]
        class_rank = preferred_classes.index(item["asset_class"]) if item["asset_class"] in preferred_classes else len(preferred_classes)
        role_score = sum(len(preferred_roles) - preferred_roles.index(role) for role in matched)
        region_score = 3 if item.get("region") == event_region else (1 if item.get("region") == "GLOBAL" else 0)
        explicit_priority = int(item.get("selection_priority", 0))
        availability_penalty = 100000 if item.get("selection_usable") is False else 0
        total = role_score * 100 + region_score * 10 + explicit_priority - availability_penalty
        # A generic role equal to its asset class conveys no narrower exposure.
        # Specific nonmatching roles (e.g. bank_equity for a CPI event) remain excluded.
        if roles and not matched and not all(role in {item["asset_class"], "price"} for role in roles):
            continue
        if not matched and item["asset_class"] not in preferred_classes:
            continue
        scored.append((total, -class_rank, item["symbol"], item, matched))
    scored.sort(key=lambda row: (-row[0], -row[1], row[2]))
    # Cover distinct asset classes before filling finer roles. Otherwise a
    # profile with many rate/equity roles can exhaust a small limit before FX
    # or volatility is considered. Unusable series never displace usable ones.
    selected_rows: list[tuple[int, int, str, dict[str, Any], list[str]]] = []
    used_symbols: set[str] = set()
    for pool in ([row for row in scored if row[3].get("selection_usable") is not False],
                 [row for row in scored if row[3].get("selection_usable") is False]):
        for asset_class in preferred_classes:
            candidate = next((row for row in pool if row[3]["asset_class"] == asset_class and row[2] not in used_symbols), None)
            if candidate is not None:
                selected_rows.append(candidate)
                used_symbols.add(candidate[2])
            if len(selected_rows) >= limit:
                break
        if len(selected_rows) >= limit:
            break
        for role in preferred_roles:
            candidate = next((row for row in pool if role in row[4] and row[2] not in used_symbols), None)
            if candidate is not None:
                selected_rows.append(candidate)
                used_symbols.add(candidate[2])
            if len(selected_rows) >= limit:
                break
        if len(selected_rows) >= limit:
            break
        for row in pool:
            if row[2] not in used_symbols:
                selected_rows.append(row)
                used_symbols.add(row[2])
            if len(selected_rows) >= limit:
                break
        if len(selected_rows) >= limit:
            break
    selected_rows.sort(key=lambda row: (preferred_classes.index(row[3]["asset_class"])
                                        if row[3]["asset_class"] in preferred_classes else len(preferred_classes),
                                        -row[0], row[2]))
    selected = [row[3] for row in selected_rows]
    reasons = [{
        "symbol": row[3]["symbol"],
        "reason": f"{EVENT_TYPE_LABELS.get(event_type, event_type)} 전달경로",
        "matched_roles": [ROLE_LABELS.get(role, role) for role in (row[4] or [row[3]["asset_class"]])],
    } for row in selected_rows]
    return selected, reasons, []
