import importlib.util
import json
import pathlib
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "danawa-price-search" / "scripts" / "danawa_search.py"
spec = importlib.util.spec_from_file_location("danawa_search", MODULE_PATH)
danawa_search = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(danawa_search)


def diff_item(*, mall="테스트몰", price="100,000원", badge_html=""):
    return f"""
    <div class="diff_item">
      <div class="d_mall"><img alt="{mall}" /></div>
      <div class="prc_line">
        {badge_html}
        <em class="prc_c">{price}</em>
      </div>
      <div class="ship">무료배송</div>
      <a class="priceCompareBuyLink" href="/bridge/test"></a>
    </div>
    """


class DanawaPaymentBadgeTest(unittest.TestCase):
    def offers_from_rows(self, rows_html):
        with mock.patch.object(
            danawa_search,
            "product_meta",
            return_value={
                "pcode": "75001853",
                "source_url": "https://prod.danawa.com/info/?pcode=75001853",
                "sProductFullName": "테스트 상품",
            },
        ), mock.patch.object(danawa_search, "fetch", return_value=f"<div>{rows_html}</div>"):
            return danawa_search.offers("75001853", limit=10)

    def test_discount_badge_is_conditional_and_counted(self):
        result = self.offers_from_rows(
            diff_item(badge_html='<span class="ico discount">할인</span>')
        )

        self.assertEqual(result["normal_count"], 0)
        self.assertEqual(result["conditional_count"], 1)
        offer = result["offers"][0]
        self.assertEqual(offer["payment_badges"], ["할인"])
        self.assertTrue(offer["discount_badge"])
        self.assertTrue(offer["is_conditional_price"])
        self.assertIn("discount", offer["payment_condition_types"])
        self.assertEqual(offer["payment_condition_label"], "할인")

    def test_membership_badge_is_conditional_and_counted(self):
        result = self.offers_from_rows(
            diff_item(badge_html='<span class="ico membership">멤버십</span>')
        )

        self.assertEqual(result["normal_count"], 0)
        self.assertEqual(result["conditional_count"], 1)
        offer = result["offers"][0]
        self.assertEqual(offer["payment_badges"], ["멤버십"])
        self.assertTrue(offer["membership_badge"])
        self.assertTrue(offer["is_conditional_price"])
        self.assertIn("membership", offer["payment_condition_types"])
        self.assertEqual(offer["payment_condition_label"], "멤버십")

    def test_class_only_payment_badges_synthesize_display_labels(self):
        cases = [
            ("cash", "현금", "cash_only"),
            ("point", "포인트", "point_only"),
            ("coupon", "쿠폰", "coupon_only"),
            ("card", "카드", "card_only_badge"),
            ("discount", "할인", "discount_badge"),
            ("membership", "멤버십", "membership_badge"),
        ]

        for badge_type, label, boolean_field in cases:
            with self.subTest(badge_type=badge_type):
                result = self.offers_from_rows(
                    diff_item(badge_html=f'<span class="ico {badge_type}"></span>')
                )

                self.assertEqual(result["normal_count"], 0)
                self.assertEqual(result["conditional_count"], 1)
                offer = result["offers"][0]
                self.assertEqual(offer["payment_badges"], [label])
                self.assertEqual(offer["payment_condition_types"], [badge_type])
                self.assertEqual(offer["payment_condition_label"], label)
                self.assertTrue(offer[boolean_field])
                self.assertTrue(offer["is_conditional_price"])

    def test_payment_badges_are_deduped_with_canonical_class_order(self):
        result = self.offers_from_rows(
            diff_item(
                badge_html=(
                    '<span class="ico cash"></span>'
                    '<span class="ico">현금</span>'
                    '<span class="ico card">카드</span>'
                )
            )
        )

        offer = result["offers"][0]
        self.assertEqual(offer["payment_badges"], ["현금", "카드"])
        self.assertEqual(offer["payment_condition_types"], ["cash", "card"])
        self.assertEqual(offer["payment_condition_label"], "현금, 카드")

    def test_text_only_card_badge_is_conditional_and_counted(self):
        result = self.offers_from_rows(
            diff_item(badge_html='<span class="ico">카드</span>')
        )

        self.assertEqual(result["normal_count"], 0)
        self.assertEqual(result["conditional_count"], 1)
        offer = result["offers"][0]
        self.assertEqual(offer["payment_badges"], ["카드"])
        self.assertTrue(offer["card_only_badge"])
        self.assertTrue(offer["is_conditional_price"])
        self.assertEqual(offer["payment_condition_types"], ["card"])
        self.assertEqual(offer["payment_condition_label"], "카드")

    def test_non_payment_ico_is_not_captured(self):
        result = self.offers_from_rows(
            diff_item(badge_html='<span class="ico quick">빠른배송</span>')
        )

        self.assertEqual(result["normal_count"], 1)
        self.assertEqual(result["conditional_count"], 0)
        offer = result["offers"][0]
        self.assertEqual(offer["payment_badges"], [])
        self.assertFalse(offer["is_conditional_price"])
        self.assertEqual(offer["payment_condition_types"], [])
        self.assertIsNone(offer["payment_condition_label"])

    def test_cli_json_includes_normalized_payment_fields(self):
        rows = diff_item(badge_html='<span class="ico cash">현금</span>')
        with mock.patch.object(
            danawa_search,
            "product_meta",
            return_value={
                "pcode": "75001853",
                "source_url": "https://prod.danawa.com/info/?pcode=75001853",
                "sProductFullName": "테스트 상품",
            },
        ), mock.patch.object(danawa_search, "fetch", return_value=f"<div>{rows}</div>"), mock.patch.object(
            danawa_search.sys, "argv", ["danawa_search.py", "offers", "75001853", "--limit", "1"]
        ), mock.patch("builtins.print") as mocked_print:
            self.assertEqual(danawa_search.main(), 0)

        payload = json.loads(mocked_print.call_args.args[0])
        offer = payload["offers"][0]
        self.assertEqual(offer["payment_condition_types"], ["cash"])
        self.assertEqual(offer["payment_condition_label"], "현금")


if __name__ == "__main__":
    unittest.main()
