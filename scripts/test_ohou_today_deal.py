import argparse
import contextlib
import importlib.util
import io
import json
import sys
import tempfile
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parent.parent
HELPER_PATH = REPO_ROOT / "ohou-today-deal" / "scripts" / "ohou_today_deal.py"

spec = importlib.util.spec_from_file_location("ohou_today_deal", HELPER_PATH)
ohou_today_deal = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["ohou_today_deal"] = ohou_today_deal
spec.loader.exec_module(ohou_today_deal)


def sample_payload():
    return {
        "pageProps": {
            "dehydratedState": {
                "queries": [
                    {
                        "state": {
                            "data": {
                                "feed": [
                                    {
                                        "title": "러그 특가",
                                        "startAt": "2026-05-17T15:00:00Z",
                                        "endAt": "2026-05-20T15:00:00Z",
                                        "type": "DEAL",
                                        "deal": {
                                            "id": "1215312",
                                            "name": "디아망 방수러그",
                                            "imageUrl": "https://example.com/rug.png",
                                            "isSoldOut": False,
                                            "price": {
                                                "representativeOriginalPrice": "41040",
                                                "representativeSellingPrice": "24800",
                                                "discountRate": "39",
                                            },
                                            "brand": {"name": "체고루루"},
                                            "badgeProperties": {"isFreeDelivery": True},
                                            "reviewStatistic": {"reviewCount": 7504, "reviewAverage": 4.8},
                                            "scrapInfo": {"scrapCount": 64757},
                                        },
                                        "salesStats": {"annualCumulativeSales": "1000"},
                                        "bestDiscountPrice": {
                                            "price": "21500",
                                            "discountRate": "47",
                                            "discountPlanDescription": "쿠폰 할인가",
                                        },
                                    },
                                    {
                                        "title": "식기 특가",
                                        "type": "DEAL",
                                        "deal": {
                                            "id": "4070154",
                                            "name": "식탁 위에 핀 꽃 bowl",
                                            "isSoldOut": False,
                                            "price": {
                                                "representativeOriginalPrice": "50000",
                                                "representativeSellingPrice": "50000",
                                                "discountRate": "0",
                                            },
                                            "brand": {"name": "미브래"},
                                            "badgeProperties": {"isFreeDelivery": False},
                                            "reviewStatistic": {"reviewCount": 0, "reviewAverage": 0},
                                        },
                                        "bestDiscountPrice": {"price": "43500", "discountRate": "13"},
                                    },
                                ]
                            }
                        }
                    }
                ]
            }
        }
    }


class OhouTodayDealTest(unittest.TestCase):
    def test_extract_deals_normalizes_public_today_deal_shape(self):
        deals = ohou_today_deal.extract_deals(sample_payload())

        self.assertEqual(len(deals), 2)
        first = deals[0]
        self.assertEqual(first.id, "1215312")
        self.assertEqual(first.title, "디아망 방수러그")
        self.assertEqual(first.brand, "체고루루")
        self.assertEqual(first.original_price, 41040)
        self.assertEqual(first.selling_price, 24800)
        self.assertEqual(first.best_price, 21500)
        self.assertEqual(first.best_discount_rate, 47)
        self.assertTrue(first.free_delivery)
        self.assertEqual(first.url, "https://ohou.se/productions/1215312/selling")

    def test_filter_and_sort_deals(self):
        deals = ohou_today_deal.extract_deals(sample_payload())

        filtered = ohou_today_deal.filter_deals(
            deals,
            query="러그",
            min_discount=40,
            free_delivery=True,
        )
        sorted_deals = ohou_today_deal.sort_deals(deals, "discount")

        self.assertEqual([deal.id for deal in filtered], ["1215312"])
        self.assertEqual([deal.id for deal in sorted_deals], ["1215312", "4070154"])

    def test_extract_next_data_accepts_html_script(self):
        html_doc = (
            '<html><script id="__NEXT_DATA__" type="application/json">'
            + json.dumps(sample_payload(), ensure_ascii=False)
            + "</script></html>"
        )

        payload = ohou_today_deal.extract_next_data(html_doc)

        self.assertEqual(
            payload["pageProps"]["dehydratedState"]["queries"][0]["state"]["data"]["feed"][0]["deal"]["id"],
            "1215312",
        )

    def test_cli_prints_json_from_html_file(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".html") as fixture:
            fixture.write(
                '<script id="__NEXT_DATA__" type="application/json">'
                + json.dumps(sample_payload(), ensure_ascii=False)
                + "</script>"
            )
            fixture.flush()
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                ohou_today_deal.main(["list", "--html-file", fixture.name, "--limit", "1"])

        output = json.loads(stdout.getvalue())

        self.assertEqual(output["count"], 1)
        self.assertEqual(output["items"][0]["id"], "1215312")


def react_query_payload():
    """라이브 ohou.se 페이지와 동일한 React Query dehydratedState 구조.

    - `today-deal-feed` queryKey: today-deal 슬롯 2개 (DEAL 1개, GOODS 1개)
    - `special-today-deal-feed` queryKey: special-deal 슬롯 1개 (DEAL)
    - `navigation` queryKey: 무관한 deal-like 노드 (필터로 걸러내야 함)
    """
    return {
        "props": {
            "pageProps": {
                "dehydratedState": {
                    "queries": [
                        {
                            "queryKey": ["navigation"],
                            "state": {
                                "data": {
                                    "promo": {
                                        "type": "DEAL",
                                        "deal": {
                                            "id": "9999999",
                                            "name": "광고 배너 — 필터되어야 함",
                                            "price": {
                                                "representativeOriginalPrice": "100000",
                                                "representativeSellingPrice": "50000",
                                                "discountRate": "50",
                                            },
                                        },
                                    }
                                }
                            },
                        },
                        {
                            "queryKey": ["today-deal-feed"],
                            "state": {
                                "data": {
                                    "todayDealFeed": {
                                        "slots": [
                                            {
                                                "title": "오늘의딜 1",
                                                "type": "DEAL",
                                                "deal": {
                                                    "id": "111",
                                                    "name": "오늘의딜 상품 A",
                                                    "price": {
                                                        "representativeOriginalPrice": "10000",
                                                        "representativeSellingPrice": "7000",
                                                        "discountRate": "30",
                                                    },
                                                    "brand": {"name": "브랜드 A"},
                                                    "badgeProperties": {"isFreeDelivery": True},
                                                    "reviewStatistic": {"reviewCount": 10, "reviewAverage": 4.5},
                                                },
                                            },
                                            {
                                                "title": "오늘의딜 GOODS",
                                                "type": "GOODS",
                                                "goods": {"id": "GOODS-1"},
                                            },
                                        ]
                                    }
                                }
                            },
                        },
                        {
                            "queryKey": ["special-today-deal-feed"],
                            "state": {
                                "data": {
                                    "todayDealFeed": {
                                        "slots": [
                                            {
                                                "title": "스페셜 딜",
                                                "type": "DEAL",
                                                "deal": {
                                                    "id": "222",
                                                    "name": "스페셜 상품 B",
                                                    "price": {
                                                        "representativeOriginalPrice": "20000",
                                                        "representativeSellingPrice": "12000",
                                                        "discountRate": "40",
                                                    },
                                                },
                                            }
                                        ]
                                    }
                                }
                            },
                        },
                    ]
                }
            }
        }
    }


class OhouReactQueryShapeTest(unittest.TestCase):
    def test_extract_deals_picks_only_today_deal_and_special_feeds(self):
        deals = ohou_today_deal.extract_deals(react_query_payload())

        ids = sorted(deal.id for deal in deals)
        self.assertEqual(ids, ["111", "222"])

    def test_navigation_deal_like_node_is_excluded(self):
        deal_ids = {deal.id for deal in ohou_today_deal.extract_deals(react_query_payload())}

        self.assertNotIn("9999999", deal_ids)

    def test_non_deal_slot_types_are_excluded(self):
        deal_ids = {deal.id for deal in ohou_today_deal.extract_deals(react_query_payload())}

        self.assertNotIn("GOODS-1", deal_ids)

    def test_fixture_payload_without_react_query_still_works(self):
        deals = ohou_today_deal.extract_deals(sample_payload())

        self.assertEqual(sorted(deal.id for deal in deals), ["1215312", "4070154"])


class OhouArgvalidatorTest(unittest.TestCase):
    def test_limit_rejects_zero_and_negative(self):
        for bad in ["0", "-1", "-100"]:
            with self.subTest(value=bad):
                with self.assertRaises(SystemExit):
                    ohou_today_deal.parse_args(["list", "--limit", bad])

    def test_min_discount_rejects_out_of_range(self):
        for bad in ["-1", "101", "200"]:
            with self.subTest(value=bad):
                with self.assertRaises(SystemExit):
                    ohou_today_deal.parse_args(["list", "--min-discount", bad])

    def test_min_discount_accepts_boundary_values(self):
        for good in ["0", "50", "100"]:
            with self.subTest(value=good):
                args = ohou_today_deal.parse_args(["list", "--min-discount", good])
                self.assertEqual(args.min_discount, int(good))

    def test_positive_int_helper_rejects_non_integer(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            ohou_today_deal._positive_int("abc")

    def test_discount_rate_helper_rejects_non_integer(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            ohou_today_deal._discount_rate("abc")


if __name__ == "__main__":
    unittest.main()
