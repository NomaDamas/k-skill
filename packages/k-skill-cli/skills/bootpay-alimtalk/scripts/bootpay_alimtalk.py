#!/usr/bin/env python3
"""부트페이 알림톡 REST API helper (표준 라이브러리만 사용).

조회는 바로 실행하고, 실제 발송·예약 취소는 `--yes-i-understand` 가 있어야 나간다.
알림톡에는 샌드박스가 없어 발송 한 번이 곧 실제 카카오톡 발송이고 과금이다.

공식 문서: https://commerce.bootpay.ai/alimtalk/overview
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://message.bootapi.com"
SECRET_FILE = Path.home() / ".config" / "k-skill" / "secrets.env"
TIMEOUT_SECONDS = 15
SERVER_MAX_RECIPIENTS = 1000  # 서버가 벌크 요청 하나에 받는 수신자 수(넘으면 요청 전체를 거부한다)
DEFAULT_MAX_RECIPIENTS = SERVER_MAX_RECIPIENTS

ENV_ALIASES = {
    "client_key": ("KSKILL_BOOTPAY_CLIENT_KEY", "BOOTPAY_COMMERCE_CLIENT_KEY"),
    "secret_key": ("KSKILL_BOOTPAY_SECRET_KEY", "BOOTPAY_COMMERCE_SECRET_KEY"),
    "sender_key": ("KSKILL_BOOTPAY_ALIMTALK_SENDER_KEY", "BOOTPAY_ALIMTALK_SENDER_KEY"),
    "max_recipients": ("KSKILL_BOOTPAY_ALIMTALK_MAX_RECIPIENTS", "BOOTPAY_ALIMTALK_MAX_RECIPIENTS"),
    "base_url": ("KSKILL_BOOTPAY_MESSAGE_API_URL",),
}

BILLING_URL = "https://admin.bootpay.co.kr/notification/edit?cursor=subscribe"
KAKAO_CONSOLE = "https://business.kakao.com/dashboard"

HINTS = {
    "PROJECT_CLIENT_KEY_NOT_FOUND": "client_key 가 틀렸습니다. 부트페이 관리자에서 발급한 Client Key 인지 확인하세요.",
    "PROJECT_SK_INVALID": "secret_key 가 틀렸습니다.",
    "PROJECT_CLIENT_KEY_EXPIRED": "연동키가 만료됐습니다. 새로 발급하세요.",
    "API_SCOPE_INVALID": "이 키에 알림톡 스코프(user:alimtalk_*)가 없습니다. 전체 권한(supervisor) 키를 쓰거나 스코프를 추가하세요.",
    "PROJECT_FIREWALL_BLOCKED": "프로젝트 방화벽이 지금 IP 를 막았습니다. 관리자에서 허용 IP 를 확인하세요.",
    "SENDER_NOT_LINKED": f"연동된 카카오 채널이 없거나 sender_key 가 맞지 않습니다. `senders` 로 확인하고, 연동 전이면 `sender-otp` → `sender-register` 로 채널을 먼저 연결하세요(채널 준비: {KAKAO_CONSOLE}).",
    "SENDER_BLOCKED": "부트페이 발송 제어가 이 프로젝트의 발송을 보류·차단했습니다. 부트페이에 문의하세요.",
    "TEMPLATE_NOT_FOUND": "템플릿이 없습니다. 공식은 `official-search`, 자체는 `templates` 로 코드를 확인하세요.",
    "TEMPLATE_NOT_APPROVED": "승인(APR)되지 않은 자체 템플릿이거나, 그룹키가 없는 채널로 공식 템플릿을 보내려 했거나, 노출이 중단된 공식 템플릿입니다.",
    "TEMPLATE_VARIABLE_MISSING": "필수 변수가 비었거나 규격을 어겼습니다. 템플릿의 required_variables 를 모두 채우세요.",
    "RECIPIENT_OPTED_OUT": "발송 제외 목록에 있는 번호입니다. 발송되지 않았고 과금도 없습니다.",
    "RATE_LIMIT_EXCEEDED": "이 프로젝트에 따로 정해 둔 발송 한도를 넘었습니다. 벌크는 수신자 수 전체로 세어 요청 전체가 거부되니 나눠 보내고, 한도는 부트페이에 문의하세요.",
    "SEND_NOT_CANCELABLE": "이미 전송 단계에 들어가 취소할 수 없습니다. `message <receipt_id>` 로 결과를 확인하세요.",
    "MESSAGE_RECEIPT_NOT_FOUND": "receipt_id 가 없거나 이 프로젝트의 발송이 아닙니다. `messages --ref-id` 로 찾아 보세요.",
    "WEBHOOK_URL_INVALID": "webhook_url 은 https:// 로 시작하고 2,000자 이하여야 합니다.",
    "NOTIFICATION_NEED_PAYMENT": f"API 알림톡 충전(선불)이 설정되지 않은 프로젝트입니다. {BILLING_URL} 에서 알림톡 충전을 신청하세요.",
    "MESSAGE_PREPAID_NOT_CHARGED": f"선불 요금제인데 아직 충전하지 않아 발송이 막혔습니다. {BILLING_URL} 에서 먼저 충전하세요.",
    "SERVICE_PAYMENT_BLOCKED": f"정산이 차단된 상태(이용료 미납 등)라 발송이 막혔습니다. {BILLING_URL} 에서 상태를 확인하세요.",
    "SERVICE_CHARGE_BALANCE_INSUFFICIENT": f"선불 잔액이 부족합니다. {BILLING_URL} 에서 충전한 뒤 거부된 건만 다시 보내세요.",
    "SENDER_NOT_VERIFIED": f"대행사가 발신 프로필 키를 내주지 않았습니다. 인증번호가 틀렸거나 만료됐으면 `sender-otp` 로 새로 받으세요. 아니면 {KAKAO_CONSOLE} → [채널] → [비즈니스 심사] 가 승인 완료인지 확인하세요(영업일 3~7일).",
    "KAKAO_SENDER_REQUEST_FAILED": "대행사가 채널 요청을 거부했습니다. 카카오톡 앱에서 그 채널이 검색되는지(채널 공개·검색 허용 ON), 검색용 아이디가 맞는지, 비즈니스 심사가 승인됐는지, 휴대폰이 채널 관리자 번호인지 순서대로 확인하세요. 같은 오류가 두 번이면 재시도하지 마세요.",
    "INVALID_PARAMETER": "파라미터가 잘못됐거나 지금 상태에서 할 수 없는 호출입니다. message 를 확인하세요.",
}


class CliError(Exception):
    def __init__(self, payload: dict[str, Any]):
        super().__init__(payload.get("message", "error"))
        self.payload = payload


# ---------------------------------------------------------------- config

def load_dotenv(path: Path = SECRET_FILE) -> None:
    if not path.exists():
        return
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise CliError({"message": f"{path} 권한이 {oct(mode)} 입니다. chmod 600 으로 맞추세요."})
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env_value(name: str) -> str | None:
    for key in ENV_ALIASES[name]:
        value = os.environ.get(key, "").strip()
        if value and value != "replace-me":
            return value
    return None


def base_url() -> str:
    url = (env_value("base_url") or DEFAULT_BASE_URL).rstrip("/")
    parsed = urllib.parse.urlparse(url)
    local = parsed.hostname in ("127.0.0.1", "localhost")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        raise CliError({"message": "KSKILL_BOOTPAY_MESSAGE_API_URL 은 https 주소여야 합니다."})
    return url


def credentials() -> tuple[str, str]:
    client_key = env_value("client_key")
    secret_key = env_value("secret_key")
    if not client_key or not secret_key:
        raise CliError({
            "error_code": "CREDENTIALS_REQUIRED",
            "message": "부트페이 Client Key / Secret Key 가 없습니다.",
            "setup": [
                "부트페이 관리자(https://admin.bootpay.co.kr) → 프로젝트 → 연동키에서 Client Key · Secret Key 를 확인하세요.",
                "KSKILL_BOOTPAY_CLIENT_KEY · KSKILL_BOOTPAY_SECRET_KEY 를 환경변수나 ~/.config/k-skill/secrets.env(0600)에 넣으세요.",
                "범위 키라면 알림톡 스코프(user:alimtalk_*)가 있어야 합니다.",
            ],
        })
    return client_key, secret_key


def max_recipients() -> int:
    raw = env_value("max_recipients")
    try:
        value = int(raw) if raw else DEFAULT_MAX_RECIPIENTS
    except ValueError:
        value = DEFAULT_MAX_RECIPIENTS
    if value <= 0:
        return DEFAULT_MAX_RECIPIENTS
    return min(value, SERVER_MAX_RECIPIENTS)


# ---------------------------------------------------------------- http

def request(method: str, path: str, params: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> Any:
    client_key, secret_key = credentials()
    query = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    url = f"{base_url()}/alimtalk{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    token = base64.b64encode(f"{client_key}:{secret_key}".encode()).decode()
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Basic {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "k-skill-bootpay-alimtalk",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            status, text, request_id = res.status, res.read().decode("utf-8"), res.headers.get("x-request-id")
    except urllib.error.HTTPError as err:
        status, text, request_id = err.code, err.read().decode("utf-8", "replace"), err.headers.get("x-request-id")
    except (urllib.error.URLError, TimeoutError) as err:
        # 응답을 못 받았으면 서버가 접수했는지 모른다
        raise CliError({"error_code": "UPSTREAM_UNAVAILABLE", "message": f"응답을 받지 못했습니다: {err}", "accepted": "unknown"})

    try:
        parsed = json.loads(text) if text.strip() else None
    except json.JSONDecodeError:
        raise CliError({"error_code": "INVALID_RESPONSE", "http_status": status, "message": "JSON 이 아닌 응답입니다."})

    error_code = parsed.get("error_code") if isinstance(parsed, dict) else None
    if status >= 400 or error_code:
        payload: dict[str, Any] = {
            "http_status": status,
            "error_code": error_code,
            "message": (parsed or {}).get("message") if isinstance(parsed, dict) else f"HTTP {status}",
        }
        if isinstance(parsed, dict) and parsed.get("payload") is not None:
            payload["server_payload"] = parsed["payload"]
        if request_id:
            payload["request_id"] = request_id
        if isinstance(error_code, str) and error_code in HINTS:
            payload["hint"] = HINTS[error_code]
        raise CliError(payload)
    return parsed


# ---------------------------------------------------------------- helpers

def normalize_phone(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def is_mobile(value: str) -> bool:
    return re.fullmatch(r"01[016789]\d{7,8}", normalize_phone(value)) is not None


def parse_vars(pairs: list[str] | None, raw_json: str | None) -> dict[str, str]:
    variables: dict[str, str] = {}
    if raw_json:
        loaded = json.loads(Path(raw_json[1:]).read_text(encoding="utf-8") if raw_json.startswith("@") else raw_json)
        if not isinstance(loaded, dict):
            raise CliError({"message": "--vars-json 은 JSON 객체여야 합니다."})
        variables.update({str(k): str(v) for k, v in loaded.items()})
    for pair in pairs or []:
        if "=" not in pair:
            raise CliError({"message": f"--var 는 key=value 형식입니다: {pair}"})
        key, value = pair.split("=", 1)
        variables[key.strip()] = value
    return variables


def check_reserved_at(value: str | None, now: dt.datetime | None = None) -> str | None:
    """서버는 해석 못 한 값과 과거 시각을 즉시 발송한다 — 여기서 먼저 막는다."""
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise CliError({"message": "reserved_at 은 2026-08-27T10:00:00+09:00 처럼 오프셋을 붙인 ISO8601 이어야 합니다."})
    if parsed.tzinfo is None:
        raise CliError({"message": "reserved_at 에 시간대 오프셋(+09:00)을 붙이세요. 없으면 의도와 다른 시각에 나갈 수 있습니다."})
    if parsed <= (now or dt.datetime.now(dt.timezone.utc)):
        raise CliError({"message": "reserved_at 이 이미 지난 시각입니다. 서버는 과거 시각을 즉시 발송합니다."})
    return parsed.isoformat()


def load_template(code: str) -> tuple[str, dict[str, Any]]:
    """공식(G_)은 /official, 자체는 /templates. 확신할 수 없어 없으면 반대편도 본다."""
    order = [("official", f"/official/{urllib.parse.quote(code, safe='')}"), ("private", f"/templates/{urllib.parse.quote(code, safe='')}")]
    if not code.startswith("G_"):
        order.reverse()
    last: CliError | None = None
    for kind, path in order:
        try:
            data = request("GET", path)
            if isinstance(data, dict):
                return kind, data
        except CliError as err:
            last = err
            if err.payload.get("error_code") != "TEMPLATE_NOT_FOUND" and err.payload.get("http_status") != 404:
                raise
    raise last or CliError({"error_code": "TEMPLATE_NOT_FOUND", "message": "템플릿이 없습니다."})


def render(content: str, variables: dict[str, str]) -> str:
    return re.sub(r"#\{([^}]+)\}", lambda m: variables.get(m.group(1), m.group(0)), content or "")


def build_preview(template_code: str, recipients: list[dict[str, Any]]) -> dict[str, Any]:
    kind, template = load_template(template_code)
    required = [str(v) for v in template.get("required_variables") or []]
    blockers: list[str] = []
    warnings: list[str] = []

    if kind == "private" and template.get("inspection_status") not in (None, "approved", 3, "APR"):
        blockers.append(f"자체 템플릿이 승인(approved) 상태가 아닙니다: {template.get('inspection_status')}")
    if template.get("vendor_blocked"):
        blockers.append("카카오 제재로 차단된 템플릿입니다.")

    limit = max_recipients()
    if len(recipients) > limit:
        blockers.append(f"수신자 {len(recipients)}명이 한 번에 보낼 수 있는 {limit}명을 넘습니다. {limit}명 이하로 나눠 보내세요.")

    ref_ids = [r.get("ref_id") for r in recipients if r.get("ref_id")]
    if len(ref_ids) != len(set(ref_ids)):
        blockers.append("같은 ref_id 가 여러 수신자에 있습니다. 서버는 뒤 수신자를 보내지 않고 앞 접수를 돌려줍니다.")

    rows = []
    for r in recipients:
        to = normalize_phone(r["to"])
        variables = r.get("variables") or {}
        missing = [name for name in required if not str(variables.get(name, "")).strip()]
        if not is_mobile(to):
            blockers.append(f"휴대폰 번호 형식이 아닙니다: {r['to']}")
        if missing:
            blockers.append(f"{to}: 필수 변수 누락 {missing}")
        rows.append({"to": to, "ref_id": r.get("ref_id"), "missing_variables": missing, "rendered": render(str(template.get("content", "")), variables)})

    phones = [row["to"] for row in rows if is_mobile(row["to"])]
    if phones:
        try:
            check = request("POST", "/optouts/check", body={"phones": phones[:1000]})
            opted = [item.get("phone") for item in (check or {}).get("list", []) if item.get("opted_out")]
            if opted:
                warnings.append(f"발송 제외 목록에 있어 건너뛸 번호(과금 없음): {opted}")
        except CliError as err:
            warnings.append(f"발송 제외 확인 실패: {err.payload.get('error_code') or err.payload.get('message')}")

    return {
        "template": {"kind": kind, "code": template.get("code", template_code), "name": template.get("name"), "required_variables": required},
        "recipients": rows,
        "blockers": blockers,
        "warnings": warnings,
        "must_tell_user": "알림톡에는 샌드박스가 없습니다. 발송하면 실제 카카오톡이 나가고 성공한 건마다 과금됩니다.",
    }


def recipients_from_args(args: argparse.Namespace) -> list[dict[str, Any]]:
    if getattr(args, "file", None):
        loaded = json.loads(Path(args.file).read_text(encoding="utf-8"))
        if not isinstance(loaded, list) or not loaded:
            raise CliError({"message": "--file 은 [{\"to\":..., \"variables\":{...}, \"ref_id\":...}] 형식의 비어 있지 않은 배열이어야 합니다."})
        return [{"to": str(r["to"]), "variables": {str(k): str(v) for k, v in (r.get("variables") or {}).items()}, "ref_id": r.get("ref_id")} for r in loaded]
    return [{"to": args.to, "variables": parse_vars(args.var, args.vars_json), "ref_id": args.ref_id}]


# ---------------------------------------------------------------- commands

def cmd_config_check(_: argparse.Namespace) -> dict[str, Any]:
    return {
        "client_key": bool(env_value("client_key")),
        "secret_key": bool(env_value("secret_key")),
        "sender_key": bool(env_value("sender_key")),
        "max_recipients": max_recipients(),
        "base_url": base_url(),
        "secrets_file": str(SECRET_FILE) if SECRET_FILE.exists() else None,
    }


def cmd_status(_: argparse.Namespace) -> dict[str, Any]:
    senders = request("GET", "/senders")
    templates = request("GET", "/templates", {"ins": "approved"})
    channel_list = senders.get("list", senders) if isinstance(senders, dict) else senders
    active = [c for c in channel_list or [] if c.get("status") in (None, "active")]
    next_steps = []
    if not active:
        next_steps.append(f"연동된 카카오 채널이 없습니다. 카카오비즈니스({KAKAO_CONSOLE})에서 비즈니스 채널 전환·채널 공개·검색 허용·고객센터 정보를 마친 뒤 `sender-otp` → `sender-register` 로 연결하세요.")
    elif len(active) > 1 and not env_value("sender_key"):
        next_steps.append("연동 채널이 둘 이상입니다. 사용자가 KSKILL_BOOTPAY_ALIMTALK_SENDER_KEY 로 보낼 채널을 정해야 합니다.")
    return {
        "channels": [{k: c.get(k) for k in ("ksp_id", "yellow_id", "channel_name", "status", "verified", "group_key_registered")} for c in active],
        "approved_template_count": (templates or {}).get("count") if isinstance(templates, dict) else None,
        "next_steps": next_steps,
    }


def cmd_preview(args: argparse.Namespace) -> dict[str, Any]:
    preview = build_preview(args.template, recipients_from_args(args))
    preview["sent"] = False
    return preview


def cmd_send(args: argparse.Namespace) -> dict[str, Any]:
    recipients = recipients_from_args(args)
    reserved_at = check_reserved_at(args.reserved_at)
    preview = build_preview(args.template, recipients)
    if preview["blockers"]:
        raise CliError({"message": "발송 전 검사에서 막혔습니다. 발송하지 않았습니다.", "blockers": preview["blockers"], "sent": False})
    if not args.yes_i_understand:
        preview["sent"] = False
        preview["next_step"] = "위 미리보기를 사용자에게 보여 주고 승인받은 뒤 같은 명령에 --yes-i-understand 를 붙이세요."
        return preview

    stamp = uuid.uuid4().hex[:12]
    for index, r in enumerate(recipients):
        r["to"] = normalize_phone(r["to"])
        r["ref_id"] = r.get("ref_id") or f"kskill-{stamp}-{index}"
    common = {
        "template_code": args.template,
        "reserved_at": reserved_at,
        "sender_key": env_value("sender_key"),
        "webhook_url": args.webhook_url,
    }
    common = {k: v for k, v in common.items() if v}
    try:
        if len(recipients) == 1 and not getattr(args, "file", None):
            result = request("POST", "/send", body={**common, **recipients[0]})
        else:
            result = request("POST", "/send/bulk", body={**common, "recipients": recipients})
    except CliError as err:
        err.payload["ref_ids"] = [r["ref_id"] for r in recipients]
        if err.payload.get("accepted") == "unknown":
            err.payload["next_step"] = "접수 여부를 모릅니다. `messages --ref-id <값>` 으로 먼저 확인하고, 다시 보낼 때는 같은 ref_id 를 쓰세요(중복 발송되지 않습니다)."
        raise
    return {
        "sent": True,
        "result": result,
        "ref_ids": [r["ref_id"] for r in recipients],
        "next_step": "접수 직후는 requested 상태입니다. 확정 결과는 `message <receipt_id>` 로 확인하세요." + (" 예약 건은 응답의 reserved_at 이 채워졌는지 확인하세요." if reserved_at else ""),
    }


def cmd_cancel(args: argparse.Namespace) -> dict[str, Any]:
    if not args.yes_i_understand:
        return {"canceled": False, "next_step": f"예약 {args.receipt_id} 을 취소합니다. 사용자 승인 후 --yes-i-understand 를 붙이세요."}
    return {"canceled": True, "result": request("DELETE", f"/send/{urllib.parse.quote(args.receipt_id, safe='')}")}


def normalize_yellow_id(value: str) -> str:
    value = (value or "").strip()
    return value if value.startswith("@") else f"@{value}"


def cmd_sender_otp(args: argparse.Namespace) -> dict[str, Any]:
    body = {"yellow_id": normalize_yellow_id(args.yellow_id), "phone": normalize_phone(args.phone)}
    if not args.yes_i_understand:
        return {"requested": False, "request": body, "next_step": "채널 관리자 휴대폰으로 인증번호가 실제로 나갑니다. 사용자 승인 후 --yes-i-understand 를 붙이세요."}
    result = request("POST", "/senders/otp", body=body)
    return {"requested": True, "result": result, "next_step": "사용자에게 받은 인증번호로 `sender-register --otp <번호>` 를 부르세요. 만료되면 다시 요청합니다."}


def cmd_sender_register(args: argparse.Namespace) -> dict[str, Any]:
    body = {k: v for k, v in {
        "otp": args.otp,
        "yellow_id": normalize_yellow_id(args.yellow_id),
        "phone": normalize_phone(args.phone),
        "category_code": args.category_code,
    }.items() if v}
    if not args.yes_i_understand:
        return {"registered": False, "request": {**body, "otp": "***"}, "next_step": "카카오에 발신프로필로 실제 등록됩니다. 사용자 승인 후 --yes-i-understand 를 붙이세요."}
    result = request("POST", "/senders", body=body)
    out: dict[str, Any] = {"registered": True, "result": result}
    if isinstance(result, dict) and result.get("group_key_registered") is False:
        out["warning"] = "채널은 등록됐지만 그룹키 등록이 거절됐습니다. 이 상태로는 공식 템플릿 발송이 막힙니다. 부트페이에 문의하세요."
    else:
        out["next_step"] = "공식 템플릿을 바로 쓸 수 있습니다. `recommend --text ...` 로 문구에 맞는 템플릿을 찾으세요."
    return out


def simple(method: str, path_fn, params_fn=None, body_fn=None):
    def run(args: argparse.Namespace) -> Any:
        return request(method, path_fn(args), params_fn(args) if params_fn else None, body_fn(args) if body_fn else None)
    return run


q = lambda v: urllib.parse.quote(v, safe="")  # noqa: E731


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="bootpay_alimtalk", description="부트페이 알림톡 API helper")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("config-check", help="키 존재 여부만 확인 (값은 출력하지 않음)").set_defaults(func=cmd_config_check)
    sub.add_parser("status", help="연동 채널과 승인 템플릿 수").set_defaults(func=cmd_status)
    sub.add_parser("senders", help="연동된 카카오 채널 목록").set_defaults(func=simple("GET", lambda a: "/senders"))
    sub.add_parser("categories", help="채널 등록용 업종 코드 목록").set_defaults(func=simple("GET", lambda a: "/categories"))

    p = sub.add_parser("sender-otp", help="채널 연동 인증번호 요청 (--yes-i-understand 필요)")
    p.add_argument("--yellow-id", required=True, help="카카오 채널 검색용 아이디 (@ 는 없어도 붙여 보낸다)")
    p.add_argument("--phone", required=True, help="채널 관리자 휴대폰 번호")
    p.add_argument("--yes-i-understand", action="store_true"); p.set_defaults(func=cmd_sender_otp)

    p = sub.add_parser("sender-register", help="인증번호로 채널을 발신프로필로 등록 (--yes-i-understand 필요)")
    p.add_argument("--otp", required=True); p.add_argument("--yellow-id", required=True); p.add_argument("--phone", required=True)
    p.add_argument("--category-code", help="업종 코드 11자리. 생략하면 서버 기본값")
    p.add_argument("--yes-i-understand", action="store_true"); p.set_defaults(func=cmd_sender_register)

    p = sub.add_parser("official-search", help="공식 템플릿 검색 (검수 없이 바로 쓰는 공용 템플릿)")
    p.add_argument("--q"); p.add_argument("--category"); p.add_argument("--msg-type", choices=["BA", "EX"])
    p.add_argument("--page", type=int); p.add_argument("--per", type=int)
    p.set_defaults(func=simple("GET", lambda a: "/official", lambda a: {"q": a.q, "category": a.category, "msg_type": a.msg_type, "page": a.page, "per": a.per}))

    p = sub.add_parser("official", help="공식 템플릿 상세"); p.add_argument("code")
    p.set_defaults(func=simple("GET", lambda a: f"/official/{q(a.code)}"))

    p = sub.add_parser("recommend", help="보내려는 문구로 공식 템플릿 추천"); p.add_argument("--text", required=True)
    p.add_argument("--category"); p.add_argument("--limit", type=int)
    p.set_defaults(func=simple("POST", lambda a: "/official/recommend", body_fn=lambda a: {k: v for k, v in {"text": a.text, "category": a.category, "limit": a.limit}.items() if v is not None}))

    p = sub.add_parser("templates", help="자체 템플릿 목록"); p.add_argument("--ins"); p.add_argument("--keyword")
    p.add_argument("--sort", choices=["latest", "oldest", "code"])
    p.set_defaults(func=simple("GET", lambda a: "/templates", lambda a: {"ins": a.ins, "keyword": a.keyword, "sort": a.sort}))

    p = sub.add_parser("template", help="자체 템플릿 상세 (id 또는 코드)"); p.add_argument("id")
    p.set_defaults(func=simple("GET", lambda a: f"/templates/{q(a.id)}"))

    for name, func, helptext in (("preview", cmd_preview, "발송 미리보기 (보내지 않음)"), ("send", cmd_send, "실제 발송 (--yes-i-understand 필요)")):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("--template", required=True, help="템플릿 코드 (공식 G_*, 자체 BT_*)")
        target = p.add_mutually_exclusive_group(required=True)
        target.add_argument("--to", help="수신 휴대폰 번호")
        target.add_argument("--file", help="수신자 JSON 배열 파일 (벌크)")
        p.add_argument("--var", action="append", help="변수 key=value (여러 번)")
        p.add_argument("--vars-json", help="변수 JSON 객체 또는 @파일")
        p.add_argument("--ref-id", help="멱등 키 (주문번호 등). 같은 값은 중복 발송되지 않는다")
        if name == "send":
            p.add_argument("--reserved-at", help="예약 시각 ISO8601 + 오프셋")
            p.add_argument("--webhook-url", help="이 건의 결과 웹훅 주소 (https)")
            p.add_argument("--yes-i-understand", action="store_true")
        p.set_defaults(func=func)

    p = sub.add_parser("messages", help="발송내역 목록")
    for opt in ("--template-code", "--status", "--ref-id", "--to", "--s-at", "--e-at"):
        p.add_argument(opt)
    p.add_argument("--page", type=int); p.add_argument("--limit", type=int)
    p.set_defaults(func=simple("GET", lambda a: "/messages", lambda a: {
        "template_code": a.template_code, "status": a.status, "ref_id": a.ref_id,
        "to": normalize_phone(a.to) if a.to else None, "s_at": a.s_at, "e_at": a.e_at, "page": a.page, "limit": a.limit}))

    p = sub.add_parser("message", help="발송 결과 상세"); p.add_argument("receipt_id")
    p.set_defaults(func=simple("GET", lambda a: f"/messages/{q(a.receipt_id)}"))

    p = sub.add_parser("stats", help="기간 집계"); p.add_argument("--s-at"); p.add_argument("--e-at")
    p.set_defaults(func=simple("GET", lambda a: "/messages/stats", lambda a: {"s_at": a.s_at, "e_at": a.e_at}))

    p = sub.add_parser("cancel", help="예약 발송 취소 (--yes-i-understand 필요)"); p.add_argument("receipt_id")
    p.add_argument("--yes-i-understand", action="store_true"); p.set_defaults(func=cmd_cancel)

    p = sub.add_parser("optout-check", help="발송 제외 목록 대조"); p.add_argument("phones", nargs="+")
    p.set_defaults(func=simple("POST", lambda a: "/optouts/check", body_fn=lambda a: {"phones": [normalize_phone(x) for x in a.phones]}))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        load_dotenv()
        result = args.func(args)
        print(json.dumps({"ok": True, "data": result}, ensure_ascii=False, indent=2))
        return 0
    except CliError as err:
        print(json.dumps({"ok": False, **err.payload}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
