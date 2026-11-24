"""Erzeugt ein Pinterest-Pin-Bild (1000x1500, 2:3).

Layouts:
  Standard   – Motiv, große Headline, Unterzeile, Button
  Liste      – Pin mit `items`: Info-Pin zum Speichern (Schritte, Fakten, Checkliste)
               Ein Eintrag "Überschrift|Text" wird zweizeilig mit fetter Überschrift gesetzt.
  `save: true` setzt ein "Merken"-Lesezeichen oben rechts.
"""
from __future__ import annotations

import zlib
from pathlib import Path

from PIL import Image, ImageDraw

from .design import (MOTIFS, card_back, config, draw_centered, draw_motif, draw_stars, fit_text, font, gradient,
                     hex_rgb, moon, ornament, stars, theme, wrap)

W, H = 1000, 1500


def _signature() -> str:
    brand = config()["brand"]
    sig = brand.get("blog_url") or brand.get("signatur") or brand.get("handle") or brand.get("name")
    return sig.replace("https://", "").replace("http://", "").rstrip("/")


def _ribbon(d: ImageDraw.ImageDraw, acc: str, bg: str) -> None:
    x0, x1, y0, y1 = W - 175, W - 95, 40, 190
    d.polygon([(x0, y0), (x1, y0), (x1, y1), ((x0 + x1) / 2, y1 - 30), (x0, y1)], fill=acc)
    cx, cy, r = (x0 + x1) / 2, y0 + 62, 18
    d.polygon([(cx, cy - r), (cx + r * 0.28, cy - r * 0.28), (cx + r, cy), (cx + r * 0.28, cy + r * 0.28),
               (cx, cy + r), (cx - r * 0.28, cy + r * 0.28), (cx - r, cy), (cx - r * 0.28, cy - r * 0.28)], fill=bg)
    f = font("sans", 15, "Bold")
    t = "MERKEN"
    d.text((cx - f.getlength(t) / 2, cy + 32), t, font=f, fill=bg)


def _layout_items(items: list[str], max_w: int, max_h: int):
    """Größte Schrift finden, bei der alle Listenpunkte in die Box passen."""
    for size in range(38, 21, -1):
        fb, fr = font("sans", size, "SemiBold"), font("sans", size, "Regular")
        lh, gap = int(size * 1.32), int(size * 0.75)
        blocks, total = [], 0
        for it in items:
            head, _, body = it.partition("|")
            hl = wrap(head.strip(), fb if body else fr, max_w)
            bl = wrap(body.strip(), fr, max_w) if body else []
            blocks.append((hl, bl, bool(body)))
            total += (len(hl) + len(bl)) * lh + gap
        if total - gap <= max_h:
            return blocks, fb, fr, lh, gap, total - gap
    return blocks, fb, fr, lh, gap, total - gap


def render_pin(pin: dict, out: Path) -> Path:
    th = theme(pin.get("theme"))
    seed = zlib.crc32(pin["id"].encode())
    acc, txt, bg0 = th["accent"], th["text"], th["bg"][0]
    ar, ag, ab = hex_rgb(acc)
    tr, tg, tb = hex_rgb(txt)
    img = gradient((W, H), *th["bg"])
    light = sum(hex_rgb(bg0)) > 380
    draw_stars(img, stars((W, H), seed, 70 if light else 120), acc, t=seed % 10)
    d = ImageDraw.Draw(img, "RGBA")
    items = pin.get("items") or []
    motif = pin.get("motif", "cards")

    # Rahmen
    d.rectangle((40, 40, W - 40, H - 40), outline=(ar, ag, ab, 200), width=2)
    d.rectangle((52, 52, W - 52, H - 52), outline=(ar, ag, ab, 90), width=1)
    if pin.get("save"):
        _ribbon(d, acc, bg0)

    # Kategorie-Label
    label = (pin.get("label") or "").upper()
    if label:
        f = font("sans", 26, "SemiBold")
        spaced = "  ".join(label.split())
        d.text(((W - f.getlength(spaced)) / 2, 120), spaced, font=f, fill=acc)

    by = H - 250  # Oberkante Button
    motif_top = 175 if items else 290
    if motif not in MOTIFS and not items:
        moon(d, W / 2, 215, 30, acc, bg0)

    # Motiv
    if motif in MOTIFS:
        size = (220 if len(items) <= 5 else 140) if items else 300
        rgba = img.convert("RGBA")
        draw_motif(rgba, motif, W / 2, motif_top + size / 2, size, acc, bg0)
        img = rgba.convert("RGB")
        d = ImageDraw.Draw(img, "RGBA")
        text_top = motif_top + size + 35
    elif motif == "cards" and not items:
        cw, ch = 170, 285
        back = card_back(cw, ch, acc, bg0)
        for i, (dx, rot) in enumerate([(-170, 10), (0, 0), (170, -10)]):
            c = back.rotate(rot, expand=True, resample=Image.BICUBIC)
            img.paste(c, (int(W / 2 + dx - c.width / 2), motif_top + (0 if i == 1 else 25)), c)
        text_top = motif_top + ch + 90
    else:
        ornament(d, W // 2, motif_top + 30, 360, acc)
        text_top = motif_top + 90

    if items:
        # Listen-Pin: Headline kompakt, darunter Info-Box
        f, lines, lh = fit_text(pin["headline"], "serif", "Bold", W - 190, 250 if len(items) <= 6 else 170, 86, 46, 1.04)
        y = draw_centered(d, lines, f, lh, W // 2, text_top, txt)
        if pin.get("subline"):
            fs, ls, lhs = fit_text(pin["subline"], "sans", "Medium", W - 220, 90, 30, 22, 1.3)
            y = draw_centered(d, ls, fs, lhs, W // 2, y + 14, acc)
        box_top, box_bot = y + 36, by - 36
        pad_x, pad_y = (70, 34) if len(items) <= 6 else (56, 26)
        numbered = pin.get("numbered", False)
        marker_w = 52
        max_w = W - 2 * (60 + pad_x) - marker_w
        blocks, fb, fr, ilh, gap, total = _layout_items(items, max_w, box_bot - box_top - 2 * pad_y)
        pin["_item_font"] = fb.size
        box_h = total + 2 * pad_y
        top = box_top + max(0, (box_bot - box_top - box_h) // 2)
        d.rounded_rectangle((60, top, W - 60, top + box_h), 26, fill=(tr, tg, tb, 16 if light else 22),
                            outline=(ar, ag, ab, 120), width=2)
        yy = top + pad_y
        x_text = 60 + pad_x + marker_w
        for n, (hl, bl, has_body) in enumerate(blocks, 1):
            if numbered:
                fn = font("serif", int(ilh * 1.05), "Bold")
                d.text((60 + pad_x, yy - ilh * 0.18), f"{n}", font=fn, fill=acc)
            else:
                cy, r = yy + ilh * 0.5, max(6, ilh // 6)
                cx = 60 + pad_x + 14
                d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=acc)
            for line in hl:
                d.text((x_text, yy), line, font=fb if has_body else fr, fill=txt)
                yy += ilh
            for line in bl:
                d.text((x_text, yy), line, font=fr, fill=(tr, tg, tb, 210))
                yy += ilh
            yy += gap
    else:
        sub_reserve = 150 if pin.get("subline") else 0
        head_h = min(430, by - text_top - 85 - sub_reserve - 30)
        f, lines, lh = fit_text(pin["headline"], "serif", "SemiBold", W - 200, head_h, 112, 50, 1.05)
        y = draw_centered(d, lines, f, lh, W // 2, text_top, txt)
        ornament(d, W // 2, y + 40, 300, acc)
        if pin.get("subline"):
            f2, l2, lh2 = fit_text(pin["subline"], "sans", "Regular", W - 240, by - 40 - (y + 85), 40, 24, 1.35)
            draw_centered(d, l2, f2, lh2, W // 2, y + 85, txt)

    # Button
    cta = pin.get("cta") or "Mehr im Blog"
    f3 = font("sans", 30, "Bold")
    cw = f3.getlength(cta.upper()) + 90
    d.rounded_rectangle(((W - cw) / 2, by, (W + cw) / 2, by + 74), 37, fill=acc)
    d.text(((W - f3.getlength(cta.upper())) / 2, by + 20), cta.upper(), font=f3, fill=bg0)

    # Signatur
    sig = _signature()
    f4 = font("serif", 34, "Medium")
    d.text(((W - f4.getlength(sig)) / 2, H - 125), sig, font=f4, fill=(ar, ag, ab, 230))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out
