"""Erzeugt ein Pinterest-Pin-Bild (1000x1500, 2:3)."""
from __future__ import annotations

import zlib
from pathlib import Path

from PIL import Image, ImageDraw

from .design import (draw_motif, config, draw_centered, draw_stars, fit_text, font, gradient, hex_rgb, moon, ornament, stars, theme,
                     card_back)

W, H = 1000, 1500


def render_pin(pin: dict, out: Path) -> Path:
    th = theme(pin.get("theme"))
    seed = zlib.crc32(pin["id"].encode())
    img = gradient((W, H), *th["bg"])
    draw_stars(img, stars((W, H), seed, 120), th["accent"], t=seed % 10)
    d = ImageDraw.Draw(img, "RGBA")
    acc, txt = th["accent"], th["text"]
    ar, ag, ab = hex_rgb(acc)

    # Rahmen
    d.rectangle((40, 40, W - 40, H - 40), outline=(ar, ag, ab, 200), width=2)
    d.rectangle((52, 52, W - 52, H - 52), outline=(ar, ag, ab, 90), width=1)

    # Kategorie-Label
    label = (pin.get("label") or "").upper()
    if label:
        f = font("sans", 26, "SemiBold")
        spaced = "  ".join(label.split())
        lw = f.getlength(spaced)
        d.text(((W - lw) / 2, 120), spaced, font=f, fill=acc)
    if pin.get("motif") not in ("owl", "moon", "gemini"):
        moon(d, W / 2, 215, 30, acc, th["bg"][0])

    # Motiv-Element: Karten oder Ornament
    motif_top = 290
    motif = pin.get("motif", "cards")
    if motif in ("owl", "moon", "gemini"):
        img = img.convert("RGBA")
        draw_motif(img, motif, W / 2, motif_top + 150, 300, acc, th["bg"][0])
        d = ImageDraw.Draw(img, "RGBA")
        text_top = motif_top + 340
    elif motif == "cards":
        cw, ch = 170, 285
        back = card_back(cw, ch, acc, th["bg"][0])
        for i, (dx, rot) in enumerate([(-170, 10), (0, 0), (170, -10)]):
            c = back.rotate(rot, expand=True, resample=Image.BICUBIC)
            img.paste(c, (int(W / 2 + dx - c.width / 2), motif_top + (0 if i == 1 else 25)), c)
        text_top = motif_top + ch + 90
    else:
        ornament(d, W // 2, motif_top + 30, 360, acc)
        text_top = motif_top + 110

    by = H - 250  # Oberkante CTA-Band
    sub_reserve = 150 if pin.get("subline") else 0
    # Headline
    head_h = min(430, by - text_top - 85 - sub_reserve - 30)
    f, lines, lh = fit_text(pin["headline"], "serif", "SemiBold", W - 200, head_h, 112, 50, 1.05)
    y = draw_centered(d, lines, f, lh, W // 2, text_top, txt)
    ornament(d, W // 2, y + 40, 300, acc)

    # Unterzeile
    if pin.get("subline"):
        f2, l2, lh2 = fit_text(pin["subline"], "sans", "Regular", W - 240, by - 40 - (y + 85), 40, 24, 1.35)
        draw_centered(d, l2, f2, lh2, W // 2, y + 85, txt)

    # CTA-Band
    cta = pin.get("cta") or "Mehr im Blog"
    f3 = font("sans", 30, "Bold")
    cw = f3.getlength(cta.upper()) + 90
    d.rounded_rectangle(((W - cw) / 2, by, (W + cw) / 2, by + 74), 37, fill=acc)
    bg_dark = th["bg"][0]
    d.text(((W - f3.getlength(cta.upper())) / 2, by + 20), cta.upper(), font=f3, fill=bg_dark)

    # Brand
    brand = config()["brand"]
    sig = brand.get("blog_url") or brand.get("handle") or brand.get("name")
    sig = sig.replace("https://", "").replace("http://", "").rstrip("/")
    f4 = font("serif", 34, "Medium")
    d.text(((W - f4.getlength(sig)) / 2, H - 125), sig, font=f4, fill=(ar, ag, ab, 230))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out
