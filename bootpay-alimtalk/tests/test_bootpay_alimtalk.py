import base64
import contextlib
import datetime as dt
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import bootpay_alimtalk as cli

OFFICIAL = {
    "code": "G_ORDER_COMPLETE_user",
    "name": "주문 완료",
    "content": "#{company_name}\n#{user_name}님 주문이 완료됐어요.",
    "required_variables": ["company_name", "user_name"],
}


class FakeServer:
    def __init__(self):
        self.calls = []
        self.opted_out = set()
        self.fail_send = None
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _reply(self, status, body):
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("x-request-id", "req-1")
                self.end_headers()
                self.wfile.write(raw)

            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length)) if length else None
                outer.calls.append((self.command, self.path, body, self.headers.get("Authorization")))
                path = self.path.split("?")[0]
                if path == "/alimtalk/official/G_ORDER_COMPLETE_user":
                    return self._reply(200, OFFICIAL)
                if path.startswith("/alimtalk/official/") or path.startswith("/alimtalk/templates/"):
                    return self._reply(404, {"error_code": "TEMPLATE_NOT_FOUND", "message": "없음"})
                if path == "/alimtalk/optouts/check":
                    return self._reply(200, {"list": [{"phone": p, "opted_out": p in outer.opted_out} for p in body["phones"]]})
                if path == "/alimtalk/send":
                    if outer.fail_send:
                        return self._reply(400, {"error_code": outer.fail_send, "message": "거부"})
                    return self._reply(200, {"receipt_id": "r1", "ref_id": body["ref_id"], "status": "requested"})
                if path == "/alimtalk/send/bulk":
                    return self._reply(200, {"count": len(body["recipients"]), "requested": len(body["recipients"])})
                if path == "/alimtalk/senders/otp":
                    return self._reply(200, {"sent": True})
                if path == "/alimtalk/senders" and self.command == "POST":
                    return self._reply(200, {"ksp_id": "k1", "verified": True, "group_key_registered": True})
                if path == "/alimtalk/messages":
                    return self._reply(200, {"list": [], "count": 0})
                return self._reply(404, {"error_code": "NOT_FOUND", "message": path})

            do_GET = do_POST = do_DELETE = do_PUT = _handle

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class BootpayAlimtalkTest(unittest.TestCase):
    def setUp(self):
        self.server = FakeServer()
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {
            "KSKILL_BOOTPAY_CLIENT_KEY": "ck",
            "KSKILL_BOOTPAY_SECRET_KEY": "sk",
            "KSKILL_BOOTPAY_MESSAGE_API_URL": self.server.url,
        }, clear=True)
        self.env.start()
        self.secret = mock.patch.object(cli, "SECRET_FILE", Path(self.tmp.name) / "missing.env")
        self.secret.start()

    def tearDown(self):
        self.secret.stop()
        self.env.stop()
        self.tmp.cleanup()
        self.server.close()

    def run_cli(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cli.main(list(argv))
        return code, json.loads(out.getvalue())

    def sends(self):
        return [c for c in self.server.calls if c[1].startswith("/alimtalk/send")]

    def test_basic_auth_header(self):
        self.run_cli("messages")
        expected = "Basic " + base64.b64encode(b"ck:sk").decode()
        self.assertEqual(self.server.calls[0][3], expected)

    def test_missing_credentials(self):
        os.environ.pop("KSKILL_BOOTPAY_SECRET_KEY")
        code, out = self.run_cli("senders")
        self.assertEqual(code, 1)
        self.assertEqual(out["error_code"], "CREDENTIALS_REQUIRED")
        self.assertEqual(self.server.calls, [])

    def test_config_check_never_prints_values(self):
        code, out = self.run_cli("config-check")
        self.assertEqual(code, 0)
        self.assertNotIn("sk", json.dumps(out["data"]["secret_key"]))
        self.assertIs(out["data"]["secret_key"], True)

    def test_send_without_approval_only_previews(self):
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--to", "010-1234-5678",
                                 "--var", "company_name=테스트", "--var", "user_name=홍길동")
        self.assertEqual(code, 0)
        self.assertFalse(out["data"]["sent"])
        self.assertIn("홍길동님", out["data"]["recipients"][0]["rendered"])
        self.assertEqual(self.sends(), [])

    def test_send_with_approval(self):
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--to", "010-1234-5678",
                                 "--var", "company_name=테스트", "--var", "user_name=홍길동",
                                 "--ref-id", "order-1", "--yes-i-understand")
        self.assertEqual(code, 0)
        self.assertTrue(out["data"]["sent"])
        (_, path, body, _), = self.sends()
        self.assertEqual(path, "/alimtalk/send")
        self.assertEqual(body["to"], "01012345678")
        self.assertEqual(body["ref_id"], "order-1")
        self.assertEqual(body["variables"], {"company_name": "테스트", "user_name": "홍길동"})

    def test_missing_required_variable_blocks_send(self):
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--to", "01012345678",
                                 "--var", "company_name=테스트", "--yes-i-understand")
        self.assertEqual(code, 1)
        self.assertFalse(out["sent"])
        self.assertEqual(self.sends(), [])

    def test_landline_blocks_send(self):
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--to", "02-123-4567",
                                 "--var", "company_name=a", "--var", "user_name=b", "--yes-i-understand")
        self.assertEqual(code, 1)
        self.assertEqual(self.sends(), [])

    def test_bulk_over_limit_blocks(self):
        recipients = [{"to": f"0101234{i:04d}", "variables": {"company_name": "a", "user_name": "b"}, "ref_id": f"r{i}"} for i in range(11)]
        path = Path(self.tmp.name) / "r.json"
        path.write_text(json.dumps(recipients))
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--file", str(path), "--yes-i-understand")
        self.assertEqual(code, 1)
        self.assertTrue(any("상한" in b for b in out["blockers"]))
        self.assertEqual(self.sends(), [])

    def test_bulk_within_limit_uses_bulk_endpoint(self):
        recipients = [{"to": f"0101234{i:04d}", "variables": {"company_name": "a", "user_name": "b"}, "ref_id": f"r{i}"} for i in range(3)]
        path = Path(self.tmp.name) / "r.json"
        path.write_text(json.dumps(recipients))
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--file", str(path), "--yes-i-understand")
        self.assertEqual(code, 0)
        (_, url, body, _), = self.sends()
        self.assertEqual(url, "/alimtalk/send/bulk")
        self.assertEqual(len(body["recipients"]), 3)

    def test_duplicate_ref_id_blocks(self):
        recipients = [{"to": "01012340001", "variables": {"company_name": "a", "user_name": "b"}, "ref_id": "same"},
                      {"to": "01012340002", "variables": {"company_name": "a", "user_name": "b"}, "ref_id": "same"}]
        path = Path(self.tmp.name) / "r.json"
        path.write_text(json.dumps(recipients))
        code, _ = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--file", str(path), "--yes-i-understand")
        self.assertEqual(code, 1)
        self.assertEqual(self.sends(), [])

    def test_optout_warning_in_preview(self):
        self.server.opted_out.add("01012345678")
        _, out = self.run_cli("preview", "--template", "G_ORDER_COMPLETE_user", "--to", "01012345678",
                              "--var", "company_name=a", "--var", "user_name=b")
        self.assertTrue(any("발송 제외" in w for w in out["data"]["warnings"]))

    def test_error_hint_and_ref_ids(self):
        self.server.fail_send = "NOTIFICATION_NEED_PAYMENT"
        code, out = self.run_cli("send", "--template", "G_ORDER_COMPLETE_user", "--to", "01012345678",
                                 "--var", "company_name=a", "--var", "user_name=b", "--yes-i-understand")
        self.assertEqual(code, 1)
        self.assertEqual(out["error_code"], "NOTIFICATION_NEED_PAYMENT")
        self.assertIn("알림톡 충전", out["hint"])
        self.assertEqual(out["request_id"], "req-1")
        self.assertEqual(len(out["ref_ids"]), 1)

    def test_unknown_template(self):
        code, out = self.run_cli("preview", "--template", "BT_NOPE", "--to", "01012345678")
        self.assertEqual(code, 1)
        self.assertEqual(out["error_code"], "TEMPLATE_NOT_FOUND")

    def test_cancel_requires_approval(self):
        code, out = self.run_cli("cancel", "r1")
        self.assertEqual(code, 0)
        self.assertFalse(out["data"]["canceled"])
        self.assertEqual(self.server.calls, [])

    def test_sender_otp_requires_approval_and_normalizes(self):
        code, out = self.run_cli("sender-otp", "--yellow-id", "mychannel", "--phone", "010-1111-2222")
        self.assertEqual(code, 0)
        self.assertFalse(out["data"]["requested"])
        self.assertEqual(self.server.calls, [])
        self.run_cli("sender-otp", "--yellow-id", "mychannel", "--phone", "010-1111-2222", "--yes-i-understand")
        (_, path, body, _), = self.server.calls
        self.assertEqual(path, "/alimtalk/senders/otp")
        self.assertEqual(body, {"yellow_id": "@mychannel", "phone": "01011112222"})

    def test_sender_register(self):
        code, out = self.run_cli("sender-register", "--otp", "123456", "--yellow-id", "@mychannel", "--phone", "01011112222")
        self.assertEqual(out["data"]["request"]["otp"], "***")
        self.assertEqual(self.server.calls, [])
        code, out = self.run_cli("sender-register", "--otp", "123456", "--yellow-id", "@mychannel", "--phone", "01011112222", "--yes-i-understand")
        self.assertEqual(code, 0)
        self.assertTrue(out["data"]["registered"])
        self.assertEqual(self.server.calls[0][2]["otp"], "123456")

    def test_reserved_at_rules(self):
        now = dt.datetime(2026, 8, 27, tzinfo=dt.timezone.utc)
        with self.assertRaises(cli.CliError):
            cli.check_reserved_at("2026-08-28T10:00:00", now)  # 오프셋 없음
        with self.assertRaises(cli.CliError):
            cli.check_reserved_at("2026-08-26T10:00:00+09:00", now)  # 과거
        with self.assertRaises(cli.CliError):
            cli.check_reserved_at("내일 10시", now)
        self.assertEqual(cli.check_reserved_at("2026-08-28T10:00:00+09:00", now), "2026-08-28T10:00:00+09:00")

    def test_rejects_plain_http_remote_base_url(self):
        os.environ["KSKILL_BOOTPAY_MESSAGE_API_URL"] = "http://example.com"
        code, _ = self.run_cli("senders")
        self.assertEqual(code, 1)

    def test_secrets_file_permission(self):
        path = Path(self.tmp.name) / "secrets.env"
        path.write_text("KSKILL_BOOTPAY_CLIENT_KEY=x\n")
        path.chmod(0o644)
        with self.assertRaises(cli.CliError):
            cli.load_dotenv(path)


if __name__ == "__main__":
    unittest.main()
