#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_CFG = _HERE.parent / "config"


def _symptom_hash(name: str, symptom_class: str) -> str:
    h = hashlib.sha1(f"{name}|{symptom_class}".encode("utf-8")).hexdigest()
    return h[:12]


def _read_transcript_tail(path, max_chars: int = 16384, max_events: int = 80) -> str:
    if not path or not Path(path).is_file():
        return ""
    lines = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    tail = lines[-max_events:]
    text = "\n".join(tail)
    if len(text) > max_chars:
        text = text[-max_chars:]
    return text


def _extract_agent_text_from_event(ev) -> str:
    if not isinstance(ev, dict):
        return ""
    if ev.get("type") == "item.completed":
        item = ev.get("item") or {}
        if isinstance(item, dict) and item.get("type") == "agent_message":
            t = item.get("text")
            if isinstance(t, str):
                return t
    if ev.get("type") == "agent_message":
        msg = ev.get("message") or {}
        for c in (msg.get("content") or []):
            if isinstance(c, dict) and c.get("type") == "text":
                t = c.get("text")
                if isinstance(t, str):
                    return t
    return ""


def _extract_final_assistant_text(jsonl_path) -> str:
    if not jsonl_path or not Path(jsonl_path).is_file():
        return ""
    last = ""
    for raw in Path(jsonl_path).read_text(encoding="utf-8", errors="replace").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            continue
        t = _extract_agent_text_from_event(ev)
        if t:
            last = t
    return last


def _render_prompt(template: str, **vars) -> str:
    out = template
    for k, v in vars.items():
        out = out.replace("{{" + k + "}}", str(v))
        out = out.replace("{{ " + k + " }}", str(v))
    return out


def _parse_codex_jsonl_final(stdout: str) -> str:
    last = ""
    for raw in stdout.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            if raw.startswith("{"):
                last = raw
            continue
        t = _extract_agent_text_from_event(ev)
        if t:
            last = t
    return last


def _call_judge(prompt: str, schema_path, model: str, timeout: int) -> dict:
    codex = shutil.which(os.environ.get("CODEX_BIN", "codex"))
    gtimeout = shutil.which("gtimeout") or shutil.which("timeout")
    if not codex:
        return {"verdict": "fail", "reason": "codex CLI not found", "symptom_class": "cli-missing", "confidence": 1.0, "evidence_quote": ""}

    provider = os.environ.get("CODEX_PROVIDER", "openai")
    cmd = []
    if gtimeout:
        cmd += [gtimeout, str(timeout)]
    cmd += [codex, "exec", "--json", "--ephemeral",
            "-s", "read-only",
            "--skip-git-repo-check", "-m", model,
            "--output-schema", str(schema_path),
            "-c", 'approval_policy="never"',
            "-c", f'model_provider="{provider}"',
            prompt]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           stdin=subprocess.DEVNULL,
                           timeout=timeout + 30)
    except subprocess.TimeoutExpired:
        return {"verdict": "unknown", "reason": "judge timed out", "symptom_class": "timeout", "confidence": 0.5, "evidence_quote": ""}

    text = _parse_codex_jsonl_final(r.stdout) or r.stdout
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if 0 <= start < end:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    return {}


def _deterministic_override(receipt: dict, transcript_text: str, judge: dict, timeout_secs: int) -> dict:
    out = dict(judge) if isinstance(judge, dict) else {}
    out.setdefault("verdict", "unknown")
    out.setdefault("reason", "no judge response")
    out.setdefault("symptom_class", "unknown")
    out.setdefault("confidence", 0.0)
    out.setdefault("evidence_quote", "")

    exit_code = receipt.get("exit_code")
    duration_ms = receipt.get("duration_ms") or 0

    if isinstance(exit_code, int) and exit_code != 0:
        if exit_code in (124, 137):
            out["verdict"] = "fail"
            out["symptom_class"] = "timeout"
            out["reason"] = f"codex exited {exit_code} (timeout)"
            out["confidence"] = 1.0
        elif out["verdict"] != "fail":
            out["verdict"] = "fail"
            if out.get("symptom_class") in (None, "", "success", "unknown"):
                out["symptom_class"] = "wrong-output"
            out["reason"] = f"codex exit_code={exit_code}: {out.get('reason','')}"
            out["confidence"] = max(out.get("confidence", 0.0) or 0.0, 0.95)

    if isinstance(duration_ms, int) and timeout_secs > 0:
        if duration_ms >= timeout_secs * 900:
            if out["verdict"] == "pass":
                out["verdict"] = "fail"
                out["symptom_class"] = "timeout"
                out["reason"] = f"duration {duration_ms}ms near timeout"
                out["confidence"] = max(out["confidence"], 0.8)

    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Judge one k-skill smoke-test transcript")
    ap.add_argument("--skill-md", type=Path, required=True)
    ap.add_argument("--prompt-template", type=Path, default=_CFG / "judge-prompt.md")
    ap.add_argument("--schema", type=Path, default=_CFG / "judge-schema.json")
    ap.add_argument("--model", default=os.environ.get("JUDGE_MODEL", "gpt-5.5"))
    ap.add_argument("--timeout", type=int, default=int(os.environ.get("JUDGE_TIMEOUT_SECS", "60")))
    ap.add_argument("--timeout-secs", type=int, default=int(os.environ.get("TIMEOUT_SECS", "180")))
    ap.add_argument("--offline", action="store_true",
                    help="Skip codex call; use deterministic gates only")
    args = ap.parse_args(argv)

    raw = sys.stdin.read()
    receipt = json.loads(raw)
    name = receipt.get("name", "")

    if receipt.get("status") == "skip":
        out = {
            "name": name,
            "verdict": "skip",
            "reason": receipt.get("reason", "skipped"),
            "symptom_class": receipt.get("symptom_class", "skipped"),
            "symptom_hash": _symptom_hash(name, receipt.get("symptom_class", "skipped")),
            "confidence": 1.0,
            "evidence_quote": "",
            "judge_model": "n/a",
            "judge_duration_ms": 0,
        }
        json.dump(out, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    transcript_path = Path(receipt.get("transcript_path") or "")
    transcript_tail = _read_transcript_tail(transcript_path)
    final_text = _extract_final_assistant_text(transcript_path)
    skill_md_text = ""
    if args.skill_md and args.skill_md.is_file():
        skill_md_text = args.skill_md.read_text(encoding="utf-8-sig", errors="replace")[:8000]

    template = args.prompt_template.read_text(encoding="utf-8")
    prompt = _render_prompt(
        template,
        skill_name=name,
        skill_md=skill_md_text,
        test_prompt=receipt.get("test_prompt", ""),
        codex_transcript_tail=transcript_tail,
        exit_code=str(receipt.get("exit_code", "")),
        duration_ms=str(receipt.get("duration_ms", "")),
    )

    if args.offline:
        judge = {}
        if "VERDICT: PASS" in final_text and receipt.get("exit_code") == 0:
            judge = {"verdict": "pass", "reason": "offline: VERDICT line found and exit 0",
                     "symptom_class": "success", "confidence": 0.9,
                     "evidence_quote": "VERDICT: PASS"}
        elif "VERDICT: FAIL" in final_text:
            judge = {"verdict": "fail", "reason": "offline: VERDICT: FAIL in transcript",
                     "symptom_class": "wrong-output", "confidence": 0.9,
                     "evidence_quote": "VERDICT: FAIL"}
        judge_duration_ms = 0
        judge_model = "offline"
    else:
        t0 = time.time()
        judge = _call_judge(prompt, args.schema, args.model, args.timeout)
        judge_duration_ms = int((time.time() - t0) * 1000)
        judge_model = args.model

    final = _deterministic_override(receipt, final_text, judge, args.timeout_secs)
    final["name"] = name
    final["symptom_hash"] = _symptom_hash(name, final.get("symptom_class", "unknown"))
    final["judge_model"] = judge_model
    final["judge_duration_ms"] = judge_duration_ms

    json.dump(final, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
