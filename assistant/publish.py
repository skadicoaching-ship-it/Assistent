"""Veröffentlichung über die offiziellen APIs.

    python -m assistant.publish pinterest --due            # fällige Pins posten
    python -m assistant.publish pinterest --boards         # Boards + IDs anzeigen
    python -m assistant.publish instagram 2026-11-21       # Reel des Tages posten
    python -m assistant.publish tiktok 2026-11-21          # Video als Entwurf in die TikTok-App schicken
    … jeweils mit --dry-run zum Testen

Zugangsdaten (Umgebungsvariablen – NIE ins Repo schreiben):
    PINTEREST_ACCESS_TOKEN
    INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID
    TIKTOK_ACCESS_TOKEN
In der Claude-Cloud können die Tokens auch als "Network Secret" hinterlegt
werden; dann fügt der Proxy sie automatisch ein und die Variable bleibt leer.

Pins OHNE Link werden nie gepostet – du entscheidest, wohin jeder Pin führt.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from .build import CONTENT, load_plan, pin_description
from .design import config

PIN_API = "https://api.pinterest.com/v5"
GRAPH = "https://graph.facebook.com/v21.0"
TIKTOK = "https://open.tiktokapis.com/v2"


def _headers(var: str) -> dict:
    tok = os.environ.get(var)
    return {"Authorization": f"Bearer {tok}"} if tok else {}


def _log_path(day: str) -> Path:
    return CONTENT / day / "posted.json"


def _log(day: str) -> dict:
    p = _log_path(day)
    return json.loads(p.read_text()) if p.exists() else {}


def _save_log(day: str, data: dict) -> None:
    _log_path(day).write_text(json.dumps(data, indent=2, ensure_ascii=False))


def _media_url(day: str, rel: str) -> str:
    base = (config()["pinterest"].get("media_base_url") or "").rstrip("/")
    if not base:
        sys.exit("media_base_url fehlt in config/brand.yaml (Instagram braucht eine öffentliche Video-URL).")
    return f"{base}/content/{day}/{rel}"


# ── Pinterest ──────────────────────────────────────────────
def pinterest_boards() -> dict[str, str]:
    r = requests.get(f"{PIN_API}/boards", headers=_headers("PINTEREST_ACCESS_TOKEN"), params={"page_size": 250}, timeout=30)
    r.raise_for_status()
    return {b["name"]: b["id"] for b in r.json()["items"]}


def pinterest_due(dry: bool) -> None:
    tz = ZoneInfo(config()["pinterest"]["timezone"])
    now = datetime.now(tz)
    boards = None
    for plan_file in sorted(CONTENT.glob("*/plan.json")):
        day = plan_file.parent.name
        plan, log = load_plan(day), _log(day)
        for i, pin in enumerate(plan["pins"], 1):
            key = f"pin-{i}"
            when = datetime.fromisoformat(f"{day}T{pin.get('time', '00:00')}:00").replace(tzinfo=tz)
            if key in log or when > now:
                continue
            if not pin.get("link"):
                print(f"⚠ {day} {key}: kein Link eingetragen – übersprungen")
                continue
            board_name = pin.get("board") or config()["pinterest"]["boards"].get(pin.get("pillar"), "")
            if dry:
                print(f"[dry-run] {day} {key} → {board_name}: {pin['title']}")
                continue
            boards = boards or pinterest_boards()
            if board_name not in boards:
                print(f"⚠ Board '{board_name}' nicht gefunden – bitte in brand.yaml anpassen")
                continue
            img = CONTENT / day / "pins" / f"pin-{i}.png"
            body = {
                "board_id": boards[board_name],
                "title": pin["title"][:100],
                "description": pin_description(pin),
                "link": pin["link"],
                "alt_text": pin.get("alt_text", "")[:500],
                "media_source": {"source_type": "image_base64", "content_type": "image/png",
                                 "data": base64.b64encode(img.read_bytes()).decode()},
            }
            r = requests.post(f"{PIN_API}/pins", headers=_headers("PINTEREST_ACCESS_TOKEN"), json=body, timeout=60)
            if r.ok:
                log[key] = {"pin_id": r.json().get("id"), "at": now.isoformat()}
                _save_log(day, log)
                print(f"✓ {day} {key} gepostet")
            else:
                print(f"✗ {day} {key}: {r.status_code} {r.text[:300]}")


# ── Instagram (Reels über die Graph API) ───────────────────
def instagram(day: str, dry: bool) -> None:
    uid = os.environ.get("INSTAGRAM_USER_ID")
    h = _headers("INSTAGRAM_ACCESS_TOKEN")
    plan, log = load_plan(day), _log(day)
    for v in plan.get("videos", []):
        key = f"ig-{v['id']}"
        if key in log:
            continue
        caption = f"{v['caption']}\n\n{' '.join(v.get('hashtags', []))}"
        url = _media_url(day, f"videos/{v['id']}.mp4")
        if dry:
            print(f"[dry-run] Instagram Reel {v['id']} ← {url}")
            continue
        r = requests.post(f"{GRAPH}/{uid}/media", headers=h,
                          data={"media_type": "REELS", "video_url": url, "caption": caption, "share_to_feed": "true"}, timeout=60)
        r.raise_for_status()
        cid = r.json()["id"]
        for _ in range(40):
            s = requests.get(f"{GRAPH}/{cid}", headers=h, params={"fields": "status_code"}, timeout=30).json()
            if s.get("status_code") == "FINISHED":
                break
            if s.get("status_code") == "ERROR":
                sys.exit(f"Instagram-Verarbeitung fehlgeschlagen: {s}")
            time.sleep(15)
        r = requests.post(f"{GRAPH}/{uid}/media_publish", headers=h, data={"creation_id": cid}, timeout=60)
        r.raise_for_status()
        log[key] = {"media_id": r.json()["id"]}
        _save_log(day, log)
        print(f"✓ Reel {v['id']} veröffentlicht")


# ── TikTok (als Entwurf in die App → dort Trend-Sound wählen) ─
def tiktok(day: str, dry: bool) -> None:
    h = _headers("TIKTOK_ACCESS_TOKEN") | {"Content-Type": "application/json; charset=UTF-8"}
    plan, log = load_plan(day), _log(day)
    for v in plan.get("videos", []):
        key = f"tt-{v['id']}"
        if key in log:
            continue
        f = CONTENT / day / "videos" / f"{v['id']}.mp4"
        size = f.stat().st_size
        if dry:
            print(f"[dry-run] TikTok-Entwurf {v['id']} ({size // 1024} KB)")
            continue
        body = {"source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}}
        r = requests.post(f"{TIKTOK}/post/publish/inbox/video/init/", headers=h, json=body, timeout=60)
        r.raise_for_status()
        data = r.json()["data"]
        up = requests.put(data["upload_url"], data=f.read_bytes(), timeout=300, headers={
            "Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size - 1}/{size}"})
        up.raise_for_status()
        log[key] = {"publish_id": data["publish_id"]}
        _save_log(day, log)
        print(f"✓ TikTok-Entwurf {v['id']} gesendet – in der TikTok-App unter Benachrichtigungen öffnen, Sound wählen, posten")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("platform", choices=["pinterest", "instagram", "tiktok"])
    ap.add_argument("day", nargs="?")
    ap.add_argument("--due", action="store_true")
    ap.add_argument("--boards", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.platform == "pinterest":
        if a.boards:
            for name, bid in pinterest_boards().items():
                print(f"{bid}  {name}")
        else:
            pinterest_due(a.dry_run)
    elif a.platform == "instagram":
        instagram(a.day, a.dry_run)
    else:
        tiktok(a.day, a.dry_run)


if __name__ == "__main__":
    main()
