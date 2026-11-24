"""Baut aus content/<datum>/plan.json alle Dateien für den Tag.

    python -m assistant.build 2026-11-21          # ein Tag
    python -m assistant.build --all               # alle Pläne ohne fertige Dateien
    python -m assistant.build 2026-11-21 --no-video

Ergebnis pro Tag (content/<datum>/):
    pins/pin-1.png … pin-5.png      Pin-Bilder 1000x1500
    videos/<id>.mp4                 Reel/TikTok 1080x1920
    pinterest_bulk.csv              Pinterest-Massenupload (Link-Spalte füllst du)
    UEBERSICHT.md                   Alles auf einen Blick zum Copy & Paste
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .design import ROOT, config
from .render_pin import render_pin
from .render_video import render_video

CONTENT = ROOT / "content"
CSV_HEADER = ["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"]


def load_plan(day: str) -> dict:
    return json.loads((CONTENT / day / "plan.json").read_text(encoding="utf-8"))


def pin_description(pin: dict) -> str:
    cfg = config()["compliance"]
    desc = pin["description"].strip()
    if pin.get("link_type") == "amazon" and cfg["affiliate_hinweis"] not in desc:
        desc = f"{desc}\n\n{cfg['affiliate_hinweis']}"
    return desc[:500]


def publish_utc(day: str, hhmm: str) -> str:
    tz = ZoneInfo(config()["pinterest"]["timezone"])
    local = datetime.fromisoformat(f"{day}T{hhmm}:00").replace(tzinfo=tz)
    return local.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%S")


def build_day(day: str, video: bool = True) -> Path:
    plan = load_plan(day)
    folder = CONTENT / day
    pcfg = config()["pinterest"]
    media_base = (pcfg.get("media_base_url") or "").rstrip("/")
    rows = []
    for i, pin in enumerate(plan["pins"], 1):
        pin.setdefault("id", f"{day}-pin-{i}")
        pin.setdefault("time", pcfg["post_times"][(i - 1) % len(pcfg["post_times"])])
        pin.setdefault("board", pcfg["boards"].get(pin.get("pillar"), ""))
        img = render_pin(pin, folder / "pins" / f"pin-{i}.png")
        rows.append([
            pin["title"][:100],
            f"{media_base}/content/{day}/pins/{img.name}" if media_base else "",
            pin["board"],
            "",
            pin_description(pin),
            pin.get("link", ""),
            publish_utc(day, pin["time"]),
            ", ".join(pin.get("keywords", [])),
        ])
    with open(folder / "pinterest_bulk.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(CSV_HEADER)
        w.writerows(rows)

    if video:
        for v in plan.get("videos", []):
            target = folder / "videos" / f"{v['id']}.mp4"
            if not target.exists():
                render_video(v, target)

    write_overview(day, plan, folder)
    return folder


def write_overview(day: str, plan: dict, folder: Path) -> None:
    disc = config()["compliance"]["disclaimer"]
    out = [f"# Content-Plan {day}", ""]
    if plan.get("trend_notes"):
        out += ["## Trend-Grundlage", "", *[f"- {n}" for n in plan["trend_notes"]], ""]
    out += ["## Pinterest – 5 Pins", "",
            "Trage deinen Link in `plan.json` (Feld `link`) **oder** direkt in `pinterest_bulk.csv` ein.", ""]
    for i, p in enumerate(plan["pins"], 1):
        out += [
            f"### Pin {i} · {p['time']} Uhr · Board: {p['board']}",
            f"![Pin {i}](pins/pin-{i}.png)",
            "",
            f"**Titel:** {p['title']}",
            "",
            f"**Beschreibung:**\n\n{pin_description(p)}",
            "",
            f"**Alt-Text:** {p.get('alt_text', '')}",
            "",
            f"**Link-Ziel:** {p.get('link_type', 'blog')} → `{p.get('link') or 'LINK EINFÜGEN'}`"
            + (f" (Idee: {p['link_hint']})" if p.get("link_hint") else ""),
            "",
        ]
    for v in plan.get("videos", []):
        out += [
            f"## Video: {v['id']} ({v.get('format')})",
            f"Datei: `videos/{v['id']}.mp4`",
            "",
            f"**Caption (Insta & TikTok):**\n\n{v['caption']}\n\n{' '.join(v.get('hashtags', []))}",
            "",
            f"**Sound:** {v.get('sound_tip', 'Aktuellen Trend-Sound in der App wählen, Lautstärke ~10 %')}",
            "",
            f"**Erster Kommentar (anpinnen):** {v.get('pinned_comment', '')}",
            "",
        ]
    out += ["---", f"_{disc}_", ""]
    (folder / "UEBERSICHT.md").write_text("\n".join(out), encoding="utf-8")


KAMPAGNEN = CONTENT / "kampagnen"


def load_campaign(name: str) -> dict:
    return json.loads((KAMPAGNEN / name / "plan.json").read_text(encoding="utf-8"))


def campaign_pins_for(day: str) -> list[tuple[str, int, dict]]:
    """Alle Kampagnen-Pins, die an diesem Tag erscheinen sollen."""
    found = []
    for f in sorted(KAMPAGNEN.glob("*/plan.json")):
        camp = json.loads(f.read_text(encoding="utf-8"))
        for i, p in enumerate(camp["pins"], 1):
            if p.get("date") == day:
                found.append((f.parent.name, i, p))
    return found


def build_campaign(name: str) -> Path:
    camp = load_campaign(name)
    folder = KAMPAGNEN / name
    pcfg = config()["pinterest"]
    media_base = (pcfg.get("media_base_url") or "").rstrip("/")
    rows, md = [], [f"# Kampagne: {camp.get('title', name)}", "", camp.get("intro", ""), ""]
    for i, pin in enumerate(camp["pins"], 1):
        pin.setdefault("id", f"{name}-{i}")
        pin.setdefault("time", camp.get("time", "20:15"))
        pin.setdefault("board", pcfg["boards"].get(pin.get("pillar"), ""))
        fname = f"{i:02d}-{pin['date']}.png"
        render_pin(pin, folder / "pins" / fname)
        rows.append([pin["title"][:100], f"{media_base}/content/kampagnen/{name}/pins/{fname}" if media_base else "",
                     pin["board"], "", pin_description(pin), pin.get("link", ""), publish_utc(pin["date"], pin["time"]),
                     ", ".join(pin.get("keywords", []))])
        md += [f"## {i}. {pin['date']} · {pin['time']} Uhr · {pin.get('art', '')}", f"![Pin {i}](pins/{fname})", "",
               f"**Titel:** {pin['title']}", "", f"**Beschreibung:**\n\n{pin_description(pin)}", "",
               f"**Board:** {pin['board']}  ", f"**Alt-Text:** {pin.get('alt_text', '')}  ",
               f"**Link:** {pin.get('link_hint', '')}", ""]
    with open(folder / "pinterest_bulk.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(CSV_HEADER)
        w.writerows(rows)
    (folder / "UEBERSICHT.md").write_text("\n".join(md + ["---", f"_{config()['compliance']['disclaimer']}_", ""]),
                                          encoding="utf-8")
    return folder


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("day", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--kampagne", help="Name des Ordners unter content/kampagnen/")
    a = ap.parse_args()
    if a.kampagne:
        print("→", build_campaign(a.kampagne).relative_to(ROOT))
        return
    days = sorted(p.parent.name for p in CONTENT.glob("*/plan.json")) if a.all else [a.day]
    for day in days:
        print("→", build_day(day, video=not a.no_video).relative_to(ROOT))


if __name__ == "__main__":
    main()
