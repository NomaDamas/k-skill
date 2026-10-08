"""Session bootstrap tests for foresttrip-vacancy (issue #699).

An invalid credential (or a stale/placeholder one) previously pushed the helper
onto the reservation page while still logged out, where `#srchSido` was absent
and `page.evaluate(...'#srchSido').options` raised an unhandled Playwright
`TypeError`. These tests drive `bootstrap_session()` through a fake Playwright
surface and assert the documented, actionable `SystemExit` paths instead.
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parent
HELPER_PATH = SCRIPT_DIR.parent / "scripts" / "run_foresttrip_vacancy.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("run_foresttrip_vacancy", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["run_foresttrip_vacancy"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()

CSRF_SELECTOR = 'input[name="_csrf"]'


class FakePlaywrightError(Exception):
    pass


class FakeLocator:
    def __init__(self, page, selector):
        self.page = page
        self.selector = selector

    def count(self):
        return 1 if self.selector in self.page.present else 0

    @property
    def first(self):
        return self

    def get_attribute(self, name):
        return self.page.attrs.get((self.selector, name))


class FakePage:
    def __init__(
        self,
        *,
        present=(),
        csrf="csrf-token",
        user_agent="test-ua",
        sido_options=None,
        instt_options=None,
    ):
        self.present = set(present)
        self.attrs = {(CSRF_SELECTOR, "value"): csrf}
        self.user_agent = user_agent
        self.sido_options = sido_options if sido_options is not None else []
        self.instt_options = instt_options or {}
        self.selected_sido = None
        self.navigations = []
        self.actions = []

    def goto(self, url):
        self.navigations.append(url)

    def fill(self, selector, value):
        self.actions.append(("fill", selector))

    def click(self, selector):
        self.actions.append(("click", selector))

    def wait_for_load_state(self, state):
        pass

    def wait_for_timeout(self, ms):
        pass

    def locator(self, selector):
        return FakeLocator(self, selector)

    def select_option(self, selector, value=None):
        self.selected_sido = value

    @property
    def context(self):
        return types.SimpleNamespace(cookies=lambda: [{"name": "JSESSIONID", "value": "abc"}])

    def evaluate(self, script):
        if "#srchInstt" in script:
            return list(self.instt_options.get(self.selected_sido, []))
        if "#srchSido" in script:
            return list(self.sido_options)
        if "navigator.userAgent" in script:
            return self.user_agent
        raise AssertionError(f"unexpected evaluate script: {script}")


class FakeBrowser:
    def __init__(self, page):
        self.page = page
        self.closed = False

    def new_page(self):
        return self.page

    def close(self):
        self.closed = True


def install_fake_playwright(page):
    """Patch sys.modules so the helper's lazy playwright import resolves to fakes."""
    browser = FakeBrowser(page)

    class FakePlaywright:
        chromium = types.SimpleNamespace(launch=lambda **kwargs: browser)

    class FakeManager:
        def __enter__(self):
            return FakePlaywright()

        def __exit__(self, *args):
            return False

    module = types.ModuleType("playwright.sync_api")
    module.sync_playwright = lambda: FakeManager()
    module.Error = FakePlaywrightError
    package = types.ModuleType("playwright")
    package.sync_api = module
    return mock.patch.dict(sys.modules, {"playwright": package, "playwright.sync_api": module}), browser


class BootstrapSessionTest(unittest.TestCase):
    def bootstrap(self, page, **kwargs):
        patcher, browser = install_fake_playwright(page)
        with patcher:
            try:
                session = helper.bootstrap_session(forest_id="user", forest_pw="secret", **kwargs)
            except SystemExit as exc:
                return exc, browser, None
        return None, browser, session

    def test_login_failure_exits_with_actionable_message(self):
        page = FakePage(present={helper.LOGIN_FORM_SELECTOR})
        exc, browser, session = self.bootstrap(page)
        self.assertIsInstance(exc, SystemExit)
        self.assertIsNone(session)
        self.assertTrue(browser.closed)
        message = str(exc)
        self.assertIn("login failed", message)
        self.assertIn("KSKILL_FORESTTRIP_ID", message)
        self.assertIn("KSKILL_FORESTTRIP_PASSWORD", message)
        self.assertIn("CAPTCHA", message)
        self.assertIn("--refresh-session", message)

    def test_reservation_dom_missing_exits_without_type_error(self):
        page = FakePage(present=set())  # login form gone, reservation selectors absent
        exc, browser, session = self.bootstrap(page)
        self.assertIsInstance(exc, SystemExit)
        self.assertIsNone(session)
        self.assertTrue(browser.closed)
        message = str(exc)
        self.assertIn(helper.RESERVATION_SIDO_SELECTOR, message)
        self.assertIn(helper.RESERVATION_INSTT_SELECTOR, message)
        self.assertIn("--refresh-session", message)

    def test_missing_csrf_token_exits(self):
        page = FakePage(
            present={helper.RESERVATION_SIDO_SELECTOR, helper.RESERVATION_INSTT_SELECTOR},
        )
        exc, browser, session = self.bootstrap(page)
        self.assertIsInstance(exc, SystemExit)
        self.assertIn("CSRF token", str(exc))
        self.assertTrue(browser.closed)

    def test_empty_forest_list_exits(self):
        page = FakePage(
            present={helper.RESERVATION_SIDO_SELECTOR, helper.RESERVATION_INSTT_SELECTOR, CSRF_SELECTOR},
        )
        exc, browser, session = self.bootstrap(page)
        self.assertIsInstance(exc, SystemExit)
        self.assertIn("failed to extract forest list", str(exc))

    def test_success_builds_session_with_forests(self):
        page = FakePage(
            present={helper.RESERVATION_SIDO_SELECTOR, helper.RESERVATION_INSTT_SELECTOR, CSRF_SELECTOR},
            sido_options=[{"value": "01", "text": "서울"}],
            instt_options={"01": [{"value": "ID02030059", "text": "[공립](거제시)거제자연휴양림"}]},
        )
        exc, browser, session = self.bootstrap(page)
        self.assertIsNone(exc)
        self.assertTrue(browser.closed)
        self.assertIsNotNone(session)
        self.assertEqual(session.csrf, "csrf-token")
        self.assertEqual(session.cookies, {"JSESSIONID": "abc"})
        self.assertEqual(session.forests, {"ID02030059": "[공립](거제시)거제자연휴양림"})


if __name__ == "__main__":
    unittest.main()
