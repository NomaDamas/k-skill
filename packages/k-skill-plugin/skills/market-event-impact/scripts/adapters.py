#!/usr/bin/env python3
"""Optional specialized adapters layered on the generic event engine."""

from __future__ import annotations

from typing import Any


ADAPTERS = {
    "FOMC": {"label": "FOMC", "channels": ("성명서", "SEP·점도표", "Powell 기자회견", "사전 정책금리 pricing")},
    "BOK_MPC": {"label": "한국은행 금통위", "channels": ("통화정책방향 결정문", "소수의견", "총재 기자회견", "성장·물가 전망")},
    "ECB": {"label": "ECB", "channels": ("결정문", "경제전망", "Lagarde 기자회견", "사전 정책금리 pricing")},
    "INFLATION": {"label": "물가지표", "channels": ("Headline", "Core", "MoM·YoY", "세부 품목", "컨센서스·수정치")},
    "EMPLOYMENT": {"label": "고용지표", "channels": ("고용증감", "실업률", "임금", "참가율", "수정치")},
    "EARNINGS": {"label": "기업실적", "channels": ("매출·이익", "가이던스", "사업부문", "컨센서스", "경영진 발언")},
}


def adapter_for_event(event: dict[str, Any]) -> dict[str, Any] | None:
    explicit = str(event.get("adapter") or "").strip().upper()
    family = str(event.get("event_family") or "").strip().upper()
    event_type = str(event.get("event_type") or "")
    key = explicit or family
    if key in ADAPTERS:
        return {"key": key, **ADAPTERS[key]}
    if event_type == "inflation":
        return {"key": "INFLATION", **ADAPTERS["INFLATION"]}
    if event_type == "employment":
        return {"key": "EMPLOYMENT", **ADAPTERS["EMPLOYMENT"]}
    if event_type == "corporate_earnings":
        return {"key": "EARNINGS", **ADAPTERS["EARNINGS"]}
    return None
