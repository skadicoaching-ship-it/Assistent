"""Erzeugt die Handy-Seite (Claude-Artifact) mit dem Content der nächsten Tage.

    python -m assistant.dashboard            # heute + 2 Tage → dashboard/index.html

Die Seite wird danach mit dem Artifact-Tool auf dieselbe URL veröffentlicht
(URL steht in config/brand.yaml unter dashboard.url).
"""
from __future__ import annotations

import argparse
import base64
import html
import io
import json
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from PIL import Image

from .build import CONTENT, KAMPAGNEN, campaign_pins_for, load_plan, pin_description
from .design import ROOT, config

WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def _jpeg_b64(path) -> str:
    img = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88, optimize=True, progressive=True)
    return base64.b64encode(buf.getvalue()).decode()


def collect(days: int) -> list[dict]:
    tz = ZoneInfo(config()["pinterest"]["timezone"])
    today = datetime.now(tz).date()
    pcfg = config()["pinterest"]
    out = []
    for k in range(days):
        d = today + timedelta(days=k)
        folder = CONTENT / d.isoformat()
        camp = campaign_pins(d.isoformat())
        if not (folder / "plan.json").exists() and not camp:
            continue
        plan = load_plan(d.isoformat()) if (folder / "plan.json").exists() else {"pins": [], "videos": []}
        pins = []
        for i, p in enumerate(plan["pins"], 1):
            img = folder / "pins" / f"pin-{i}.png"
            if not img.exists():
                continue
            pins.append({
                "n": i,
                "time": p.get("time") or pcfg["post_times"][(i - 1) % len(pcfg["post_times"])],
                "board": p.get("board") or pcfg["boards"].get(p.get("pillar"), ""),
                "label": p.get("label", ""), "focus": p.get("link_hint", "").lower().startswith("rauhnächte-journal"),
                "title": p["title"], "description": pin_description(p), "alt": p.get("alt_text", ""),
                "hint": p.get("link_hint", ""), "linkType": p.get("link_type", "blog"),
                "file": f"pin-{d.isoformat()}-{i}.jpg", "img": _jpeg_b64(img),
            })
        pins += camp
        videos = []
        for v in plan.get("videos", []):
            f = folder / "videos" / f"{v['id']}.mp4"
            if f.exists():
                videos.append({
                    "id": v["id"], "format": v.get("format", ""), "hook": v.get("hook", ""),
                    "caption": f"{v['caption']}\n\n{' '.join(v.get('hashtags', []))}",
                    "sound": v.get("sound_tip", ""), "comment": v.get("pinned_comment", ""),
                    "file": f"{v['id']}.mp4", "mp4": base64.b64encode(f.read_bytes()).decode(),
                })
        label = "Heute" if k == 0 else "Morgen" if k == 1 else f"{WD[d.weekday()]} {d.day:02d}.{d.month:02d}."
        out.append({"date": d.isoformat(), "label": label,
                    "long": f"{WD[d.weekday()]}, {d.day:02d}.{d.month:02d}.{d.year}",
                    "pins": pins, "videos": videos})
    return out


def campaign_pins(day: str) -> list[dict]:
    out = []
    for name, i, p in campaign_pins_for(day):
        img = KAMPAGNEN / name / "pins" / f"{i:02d}-{day}.png"
        if img.exists():
            out.append({
                "n": 100 + i, "time": p.get("time", "20:15"), "board": p.get("board", ""),
                "label": f"Kampagne · {p.get('label', '')}", "focus": True,
                "title": p["title"], "description": pin_description(p), "alt": p.get("alt_text", ""),
                "hint": p.get("link_hint", ""), "linkType": p.get("link_type", "pdf"),
                "file": f"{name}-{i:02d}-{day}.jpg", "img": _jpeg_b64(img),
            })
    return out


TEMPLATE = (ROOT / "assistant" / "dashboard_template.html")


def render(days: int) -> str:
    data = collect(days)
    tz = ZoneInfo(config()["pinterest"]["timezone"])
    meta = {
        "generated": datetime.now(tz).strftime("%d.%m.%Y, %H:%M"),
        "focus": (config().get("fokus") or {}).get("produkt", ""),
        "disclaimer": config()["compliance"]["disclaimer"],
    }
    payload = json.dumps({"meta": meta, "days": data}, ensure_ascii=False).replace("</", "<\\/")
    return TEMPLATE.read_text(encoding="utf-8").replace("__DATA__", payload)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    a = ap.parse_args()
    out = ROOT / "dashboard" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(render(a.days), encoding="utf-8")
    print(f"→ {out.relative_to(ROOT)} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
