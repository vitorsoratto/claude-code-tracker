#!/usr/bin/env python3
"""
Import local agent harness token usage into the tracker.

Supported local sources:
- Codex: ~/.codex/logs_2.sqlite response.completed telemetry
- Pi: ~/.pi/agent/sessions/**/*.jsonl assistant messages with usage
- Droid: ~/.factory/sessions/**/*.settings.json cumulative tokenUsage deltas
"""
import argparse
import glob
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen


SCRIPT_DIR = Path(__file__).resolve().parent
WEBHOOK_URL = os.environ.get(
    "TOKEN_TRACKER_WEBHOOK",
    "http://100.72.188.102:3001/api/webhook/track-tokens",
)
WEBHOOK_TOKEN = os.environ.get("TOKEN_TRACKER_TOKEN", "seu-webhook-token-aqui")
STATE_FILE = Path(
    os.environ.get("TOKEN_TRACKER_HARNESS_STATE", SCRIPT_DIR / ".harness_import_state.json")
).expanduser()

CODEX_LOG_DB = Path(os.environ.get("CODEX_LOG_DB", "~/.codex/logs_2.sqlite")).expanduser()
CODEX_STATE_DB = Path(os.environ.get("CODEX_STATE_DB", "~/.codex/state_5.sqlite")).expanduser()
PI_SESSION_DIR = Path(os.environ.get("PI_SESSION_DIR", "~/.pi/agent/sessions")).expanduser()
DROID_SESSION_DIR = Path(os.environ.get("DROID_SESSION_DIR", "~/.factory/sessions")).expanduser()


def load_state():
    if not STATE_FILE.exists():
        return {}
    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(STATE_FILE.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)
    tmp.replace(STATE_FILE)


def iso_from_epoch(ts):
    return datetime.fromtimestamp(float(ts), timezone.utc).isoformat()


def iso_from_mtime(path):
    return iso_from_epoch(path.stat().st_mtime)


def as_int(value, default=0):
    try:
        return int(value or 0)
    except Exception:
        return default


def as_float(value, default=0.0):
    try:
        return float(value or 0)
    except Exception:
        return default


def truncate_name(text, max_len=80):
    if not text:
        return None
    text = " ".join(str(text).split())
    if not text:
        return None
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rsplit(" ", 1)[0] + "..."


def first_text_from_content(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for block in content:
            if isinstance(block, str):
                return block
            if isinstance(block, dict):
                if block.get("type") == "text":
                    return block.get("text") or block.get("content")
                if isinstance(block.get("content"), str):
                    return block.get("content")
    return None


def send_to_webhook(payload, dry_run=False, verbose=False):
    if dry_run:
        if verbose:
            print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        return True

    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_TOKEN:
        headers["X-Webhook-Token"] = WEBHOOK_TOKEN

    req = Request(WEBHOOK_URL, data=data, headers=headers, method="POST")
    with urlopen(req, timeout=10) as res:
        return 200 <= res.status < 300


def parse_kv_fields(text):
    fields = {}
    for key, value in re.findall(r"([A-Za-z0-9_.]+)=((?:\"[^\"]*\")|\S+)", text):
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = value[1:-1]
        fields[key] = value
    return fields


def load_codex_threads():
    if not CODEX_STATE_DB.exists():
        return {}
    try:
        conn = sqlite3.connect(f"file:{CODEX_STATE_DB}?mode=ro", uri=True)
        rows = conn.execute("SELECT id, title, model FROM threads").fetchall()
        conn.close()
        return {row[0]: {"title": row[1], "model": row[2]} for row in rows}
    except Exception:
        return {}


def import_codex(state, cutoff_ts, all_history, dry_run, verbose):
    source_state = state.setdefault("codex", {})
    last_id = as_int(source_state.get("last_log_id"), 0)
    sent_keys = set(source_state.get("sent_keys", []))
    max_seen_id = last_id
    imported = 0

    if not CODEX_LOG_DB.exists():
        return imported

    min_ts = 0 if all_history else int(cutoff_ts)
    threads = load_codex_threads()

    conn = sqlite3.connect(f"file:{CODEX_LOG_DB}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            """
            SELECT id, ts, feedback_log_body
            FROM logs
            WHERE id > ?
              AND ts >= ?
              AND feedback_log_body LIKE '%event.name="codex.sse_event"%'
              AND feedback_log_body LIKE '%event.kind=response.completed%'
            ORDER BY id ASC
            """,
            (last_id, min_ts),
        )
        for row_id, ts, body in rows:
            max_seen_id = max(max_seen_id, row_id)
            fields = parse_kv_fields(body or "")
            session_id = fields.get("conversation.id")
            event_ts = fields.get("event.timestamp") or iso_from_epoch(ts)
            if not session_id:
                continue

            input_total = as_int(fields.get("input_token_count"))
            cache_read = as_int(fields.get("cached_token_count"))
            output_tokens = as_int(fields.get("output_token_count"))
            input_tokens = max(input_total - cache_read, 0)
            if input_tokens == 0 and output_tokens == 0 and cache_read == 0:
                continue

            meta = threads.get(session_id, {})
            model = fields.get("model") or fields.get("slug") or meta.get("model") or "unknown"
            key = f"{session_id}:{event_ts}:{model}:{input_tokens}:{output_tokens}:{cache_read}"
            if key in sent_keys:
                continue

            payload = {
                "timestamp": event_ts,
                "source": "codex",
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_tokens": cache_read,
                "cache_write_tokens": 0,
                "total_tokens": input_tokens + output_tokens + cache_read,
                "session_id": session_id,
                "conversation_url": "",
            }
            auto_name = truncate_name(meta.get("title"))
            if auto_name:
                payload["auto_name"] = auto_name

            send_to_webhook(payload, dry_run=dry_run, verbose=verbose)
            sent_keys.add(key)
            imported += 1
    finally:
        conn.close()

    source_state["last_log_id"] = max_seen_id
    source_state["sent_keys"] = list(sent_keys)[-2000:]
    return imported


def parse_jsonl(path):
    objects = []
    line_count = 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line_count += 1
            line = line.strip()
            if not line:
                objects.append(None)
                continue
            try:
                objects.append(json.loads(line))
            except json.JSONDecodeError:
                objects.append(None)
    return objects, line_count


def pi_session_meta(objects, path):
    session_id = path.stem.split("_")[-1]
    auto_name = None
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        if obj.get("type") == "session" and obj.get("id"):
            session_id = obj["id"]
        msg = obj.get("message")
        if not isinstance(msg, dict) or msg.get("role") != "user":
            continue
        auto_name = truncate_name(first_text_from_content(msg.get("content")))
        if auto_name:
            break
    return session_id, auto_name


def import_pi(state, cutoff_ts, all_history, dry_run, verbose):
    source_state = state.setdefault("pi", {}).setdefault("files", {})
    imported = 0

    for raw_path in glob.glob(str(PI_SESSION_DIR / "**" / "*.jsonl"), recursive=True):
        path = Path(raw_path)
        previous_lines = as_int(source_state.get(str(path)), 0)
        if previous_lines == 0 and not all_history and path.stat().st_mtime < cutoff_ts:
            continue

        objects, line_count = parse_jsonl(path)
        if line_count <= previous_lines:
            source_state[str(path)] = line_count
            continue

        session_id, auto_name = pi_session_meta(objects, path)
        for idx, obj in enumerate(objects, start=1):
            if idx <= previous_lines or not isinstance(obj, dict):
                continue
            if obj.get("type") != "message":
                continue
            msg = obj.get("message")
            if not isinstance(msg, dict):
                continue
            usage = msg.get("usage")
            if not isinstance(usage, dict):
                continue

            input_tokens = as_int(usage.get("input"))
            output_tokens = as_int(usage.get("output"))
            cache_read = as_int(usage.get("cacheRead"))
            cache_write = as_int(usage.get("cacheWrite"))
            if input_tokens == 0 and output_tokens == 0 and cache_read == 0 and cache_write == 0:
                continue

            payload = {
                "timestamp": obj.get("timestamp") or msg.get("timestamp") or iso_from_mtime(path),
                "source": "pi",
                "model": msg.get("model") or "unknown",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_tokens": cache_read,
                "cache_write_tokens": cache_write,
                "total_tokens": as_int(usage.get("totalTokens"))
                or input_tokens + output_tokens + cache_read + cache_write,
                "cost_usd": as_float((usage.get("cost") or {}).get("total")),
                "session_id": session_id,
                "conversation_url": "",
            }
            if previous_lines == 0 and auto_name:
                payload["auto_name"] = auto_name

            send_to_webhook(payload, dry_run=dry_run, verbose=verbose)
            imported += 1

        source_state[str(path)] = line_count

    return imported


def droid_session_meta(settings_path):
    session_id = settings_path.name.replace(".settings.json", "")
    jsonl_path = settings_path.with_name(f"{session_id}.jsonl")
    auto_name = None
    if jsonl_path.exists():
        try:
            with jsonl_path.open("r", encoding="utf-8") as f:
                first = json.loads(f.readline())
            auto_name = truncate_name(first.get("sessionTitle") or first.get("title"))
        except Exception:
            auto_name = None
    return session_id, auto_name


def import_droid(state, cutoff_ts, all_history, dry_run, verbose):
    source_state = state.setdefault("droid", {}).setdefault("files", {})
    imported = 0
    fields = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "thinkingTokens"]

    for raw_path in glob.glob(str(DROID_SESSION_DIR / "**" / "*.settings.json"), recursive=True):
        path = Path(raw_path)
        previous = source_state.get(str(path))
        if previous is None and not all_history and path.stat().st_mtime < cutoff_ts:
            continue

        try:
            with path.open("r", encoding="utf-8") as f:
                settings = json.load(f)
        except Exception:
            continue

        usage = settings.get("tokenUsage")
        if not isinstance(usage, dict):
            continue

        current = {field: as_int(usage.get(field)) for field in fields}
        if previous is None:
            delta = current
        else:
            delta = {field: max(current[field] - as_int(previous.get(field)), 0) for field in fields}

        source_state[str(path)] = current

        if sum(delta.values()) == 0:
            continue

        session_id, auto_name = droid_session_meta(path)
        output_tokens = delta["outputTokens"] + delta["thinkingTokens"]
        payload = {
            "timestamp": iso_from_mtime(path),
            "source": "droid",
            "model": settings.get("model") or "unknown",
            "input_tokens": delta["inputTokens"],
            "output_tokens": output_tokens,
            "cache_read_tokens": delta["cacheReadTokens"],
            "cache_write_tokens": delta["cacheCreationTokens"],
            "total_tokens": delta["inputTokens"]
            + output_tokens
            + delta["cacheReadTokens"]
            + delta["cacheCreationTokens"],
            "session_id": session_id,
            "conversation_url": "",
        }
        if previous is None and auto_name:
            payload["auto_name"] = auto_name

        send_to_webhook(payload, dry_run=dry_run, verbose=verbose)
        imported += 1

    return imported


def main():
    parser = argparse.ArgumentParser(description="Import local harness token usage into the tracker.")
    parser.add_argument(
        "--source",
        choices=["all", "codex", "pi", "droid"],
        default="all",
        help="Harness source to import.",
    )
    parser.add_argument(
        "--backfill-days",
        type=int,
        default=int(os.environ.get("TOKEN_TRACKER_BACKFILL_DAYS", "30")),
        help="When state is empty, import files/logs modified within this many days.",
    )
    parser.add_argument("--all-history", action="store_true", help="Ignore the backfill window.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and update nothing remotely.")
    parser.add_argument("--verbose", action="store_true", help="Print payloads in dry-run mode.")
    args = parser.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(days=max(args.backfill_days, 0))
    cutoff_ts = cutoff.timestamp()
    state = load_state()

    totals = {}
    try:
        if args.source in ("all", "codex"):
            totals["codex"] = import_codex(state, cutoff_ts, args.all_history, args.dry_run, args.verbose)
        if args.source in ("all", "pi"):
            totals["pi"] = import_pi(state, cutoff_ts, args.all_history, args.dry_run, args.verbose)
        if args.source in ("all", "droid"):
            totals["droid"] = import_droid(state, cutoff_ts, args.all_history, args.dry_run, args.verbose)
    except Exception as exc:
        print(f"harness importer failed: {exc}", file=sys.stderr)
        return 1

    if not args.dry_run:
        save_state(state)

    print("imported " + ", ".join(f"{key}={value}" for key, value in totals.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
