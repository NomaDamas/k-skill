import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from asset_selector import PROFILES, select_assets
from event_resolver import EventResolutionError, normalize_event


def series(symbol, asset_class, roles):
    return {
        "symbol": symbol,
        "region": "GLOBAL",
        "asset_class": asset_class,
        "unit": "index",
        "roles": roles,
        "selection_priority": 0,
        "source": {"name": "fixture", "url": "https://example.test"},
        "observations": [{"date": "2024-01-01", "value": 100}],
    }


class GenericEngineTests(unittest.TestCase):
    def setUp(self):
        self.series = [
            series("WTI", "commodity", ["oil"]),
            series("GOLD", "commodity", ["gold", "safe_haven"]),
            series("VIX", "volatility", ["volatility"]),
            series("KRE", "equity", ["bank_equity"]),
            series("NVDA", "equity", ["event_security"]),
            series("SOX", "equity", ["sector_equity"]),
            series("SPX", "equity", ["broad_equity"]),
        ]

    def test_geopolitics_selects_transmission_assets_not_region_basket(self):
        event = {"event_type": "geopolitics", "event_date": "2024-02-01", "region": "GLOBAL"}
        selected, _, _ = select_assets(self.series, event)
        symbols = {item["symbol"] for item in selected}
        self.assertTrue({"WTI", "GOLD", "VIX"}.issubset(symbols))
        self.assertNotIn("KRE", symbols)

    def test_earnings_selects_security_sector_and_index(self):
        event = {"event_type": "corporate_earnings", "event_date": "2024-02-01", "region": "GLOBAL"}
        selected, _, _ = select_assets(self.series, event)
        self.assertEqual({item["symbol"] for item in selected}, {"NVDA", "SOX", "SPX", "VIX"})

    def test_financial_stress_includes_broad_equity_and_fx_when_available(self):
        event = {"event_type": "financial_stress", "event_date": "2024-02-01", "region": "GLOBAL"}
        available = self.series + [series("USDX", "fx", ["fx"])]
        selected, _, _ = select_assets(available, event)
        symbols = {item["symbol"] for item in selected}
        self.assertTrue({"KRE", "VIX", "SPX", "USDX"}.issubset(symbols))
        self.assertNotIn("WTI", symbols)

    def test_trade_policy_includes_rates_in_cross_asset_transmission(self):
        event = {"event_type": "trade_policy", "event_date": "2024-02-01", "region": "GLOBAL"}
        available = self.series + [
            series("DGS2", "rates", ["short_rates"]),
            series("DGS10", "rates", ["long_rates", "curve"]),
            series("USDX", "fx", ["fx"]),
        ]
        selected, _, _ = select_assets(available, event, limit=20)
        symbols = {item["symbol"] for item in selected}
        self.assertTrue({"DGS2", "DGS10", "USDX", "SPX", "WTI", "VIX"}.issubset(symbols))

    def test_sovereign_credit_keeps_cross_asset_coverage_with_many_bonds(self):
        event = {"event_type": "sovereign_credit", "event_date": "2023-08-01", "region": "US"}
        bonds = [series(f"UST{i}", "rates", ["government_bond"]) for i in range(20)]
        available = bonds + [
            series("EURUSD", "fx", ["fx"]),
            series("SPX", "equity", ["broad_equity"]),
            series("VIX", "volatility", ["volatility"]),
        ]
        selected, _, _ = select_assets(available, event, limit=4)
        self.assertEqual({item["symbol"] for item in selected} & {"EURUSD", "SPX", "VIX"},
                         {"EURUSD", "SPX", "VIX"})
        self.assertEqual(len(selected), 4)

    def test_inflation_selects_broad_equity_and_volatility_as_well_as_growth(self):
        event = {"event_type": "inflation", "event_date": "2022-11-10", "region": "US"}
        available = self.series + [
            series("DGS2", "rates", ["short_rates"]),
            series("DGS10", "rates", ["long_rates"]),
            series("EURUSD", "fx", ["fx"]),
            series("NASDAQ", "equity", ["growth_equity", "broad_equity"]),
        ]
        selected, _, _ = select_assets(available, event)
        symbols = {item["symbol"] for item in selected}
        self.assertTrue({"DGS2", "DGS10", "EURUSD", "NASDAQ", "SPX", "VIX"}.issubset(symbols))
        self.assertNotIn("KRE", symbols)

    def test_small_limit_covers_distinct_asset_classes_before_variants(self):
        event = {"event_type": "trade_policy", "event_date": "2025-04-02", "region": "US"}
        available = self.series + [
            series("DGS2", "rates", ["short_rates"]),
            series("DGS10", "rates", ["long_rates", "curve"]),
            series("EURUSD", "fx", ["fx"]),
        ]
        selected, _, _ = select_assets(available, event, limit=5)
        self.assertEqual({item["asset_class"] for item in selected},
                         {"rates", "equity", "fx", "commodity", "volatility"})

    def test_broad_equity_role_is_not_lost_in_other_event_profiles(self):
        for event_type in ("monetary_policy", "employment", "growth", "geopolitics", "commodity_supply", "fiscal_policy"):
            with self.subTest(event_type=event_type):
                selected, _, _ = select_assets(self.series, {"event_type": event_type, "region": "GLOBAL"})
                self.assertIn("SPX", {item["symbol"] for item in selected})

    def test_generic_class_role_falls_back_but_unrelated_specific_role_does_not(self):
        event = {"event_type": "inflation", "region": "US"}
        available = [series("GENERIC", "equity", ["equity"]), series("BANK", "equity", ["bank_equity"])]
        selected, _, _ = select_assets(available, event)
        self.assertEqual([item["symbol"] for item in selected], ["GENERIC"])

    def test_unusable_class_does_not_displace_usable_other_channel(self):
        event = {"event_type": "inflation", "region": "US"}
        stale = series("STALE_RATE", "rates", ["short_rates"])
        stale["selection_usable"] = False
        available = [stale, series("FX", "fx", ["fx"]), series("SPX", "equity", ["broad_equity"])]
        selected, _, _ = select_assets(available, event, limit=2)
        self.assertEqual({item["symbol"] for item in selected}, {"FX", "SPX"})

    def test_profile_matrix_can_cover_each_declared_asset_class(self):
        candidates = [
            series("DGS2", "rates", ["short_rates"]),
            series("DGS10", "rates", ["long_rates", "curve", "government_bond", "safe_haven"]),
            series("BEI", "rates", ["inflation_breakeven"]),
            series("CDS", "credit", ["credit", "sovereign_cds"]),
            series("FX", "fx", ["fx"]),
            series("SPX", "equity", ["broad_equity"]),
            series("NASDAQ", "equity", ["growth_equity"]),
            series("KRE", "equity", ["bank_equity"]),
            series("CYCLICAL", "equity", ["cyclical_equity"]),
            series("RESOURCE", "equity", ["commodity_equity"]),
            series("EVENT", "equity", ["event_security", "affected_equity", "sector_equity"]),
            series("WTI", "commodity", ["oil", "commodity"]),
            series("GOLD", "commodity", ["gold", "safe_haven"]),
            series("VIX", "volatility", ["volatility"]),
            series("DIRECT", "price", ["event_security"]),
        ]
        for event_type, (_, expected_classes) in PROFILES.items():
            with self.subTest(event_type=event_type):
                selected, _, _ = select_assets(candidates, {"event_type": event_type, "region": "GLOBAL"}, limit=20)
                self.assertTrue(set(expected_classes).issubset({item["asset_class"] for item in selected}))

    def test_automatic_selection_prefers_usable_series_in_same_role(self):
        event = {"event_type": "sovereign_credit", "event_date": "2023-08-01", "region": "US"}
        stale = series("A_UNUSABLE", "rates", ["government_bond"])
        stale["selection_usable"] = False
        valid = series("Z_VALID", "rates", ["government_bond"])
        valid["selection_usable"] = True
        selected, _, _ = select_assets([stale, valid], event, limit=1)
        self.assertEqual([item["symbol"] for item in selected], ["Z_VALID"])

    def test_user_symbols_override_automatic_selection(self):
        event = {"event_type": "geopolitics", "event_date": "2024-02-01", "region": "GLOBAL"}
        selected, reasons, missing = select_assets(self.series, event, ("NVDA", "UNKNOWN"))
        self.assertEqual([item["symbol"] for item in selected], ["NVDA"])
        self.assertEqual(reasons[0]["reason"], "사용자 지정")
        self.assertEqual(missing, ["UNKNOWN"])

    def test_asset_limit_rejects_out_of_range_and_boolean_values(self):
        event = {"event_type": "geopolitics", "event_date": "2024-02-01", "region": "GLOBAL"}
        for invalid in (0, 21, True, 1.5):
            with self.subTest(limit=invalid), self.assertRaisesRegex(ValueError, "integer from 1 to 20"):
                select_assets(self.series, event, limit=invalid)

    def test_ambiguous_type_requires_explicit_classification(self):
        with self.assertRaisesRegex(EventResolutionError, "ambiguous"):
            normalize_event({
                "event_name": "OPEC 감산과 중동 전쟁",
                "region": "GLOBAL",
                "event_date": "2024-02-01",
                "source": {"name": "fixture", "url": "https://example.test"},
            })


if __name__ == "__main__":
    unittest.main()
