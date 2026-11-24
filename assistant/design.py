"""Gemeinsame Design-Bausteine für Pins und Videos (Pillow)."""
from __future__ import annotations

import math
import random
from functools import lru_cache
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"


@lru_cache
def config() -> dict:
    return yaml.safe_load((ROOT / "config" / "brand.yaml").read_text(encoding="utf-8"))


def theme(name: str | None) -> dict:
    themes = config()["design"]["themes"]
    return themes.get(name or "nacht", themes["nacht"])


@lru_cache(maxsize=64)
def font(kind: str, size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    file = {"serif": "CormorantGaramond.ttf", "sans": "Montserrat.ttf"}[kind]
    f = ImageFont.truetype(str(FONTS / file), size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    w, h = size
    a, b = hex_rgb(top), hex_rgb(bottom)
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        col.putpixel((0, y), tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    img = col.resize((w, h))
    # weiches Leuchten in der Mitte
    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse((-w * 0.2, h * 0.15, w * 1.2, h * 0.75), fill=60)
    glow = glow.filter(ImageFilter.GaussianBlur(w // 5))
    light = Image.new("RGB", (w, h), hex_rgb(bottom))
    light = Image.blend(light, Image.new("RGB", (w, h), (255, 255, 255)), 0.25)
    return Image.composite(light, img, glow)


def stars(size: tuple[int, int], seed: int, n: int = 140) -> list[tuple[float, float, float, float]]:
    rnd = random.Random(seed)
    w, h = size
    return [(rnd.random() * w, rnd.random() * h, rnd.uniform(0.6, 2.6), rnd.random() * math.tau) for _ in range(n)]


def draw_stars(img: Image.Image, field, color: str, t: float = 0.0) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    r, g, b = hex_rgb(color)
    for x, y, s, phase in field:
        a = int(110 + 120 * (0.5 + 0.5 * math.sin(phase + t * 2.2)))
        d.ellipse((x - s, y - s, x + s, y + s), fill=(r, g, b, a))
        if s > 2.2:
            d.line((x - s * 3, y, x + s * 3, y), fill=(r, g, b, a // 2))
            d.line((x, y - s * 3, x, y + s * 3), fill=(r, g, b, a // 2))


def moon(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color: str, bg: str) -> None:
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    o = r * 0.38
    d.ellipse((cx - r + o, cy - r - o * 0.3, cx + r + o, cy + r - o * 0.3), fill=bg)


def wrap(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        words, cur = para.split(), ""
        for w in words:
            test = f"{cur} {w}".strip()
            if f.getlength(test) <= max_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def fit_text(text: str, kind: str, weight: str, max_w: int, max_h: int, start: int, minimum: int = 28, spacing: float = 1.1):
    """Größte Schriftgröße finden, bei der der Text in die Box passt."""
    size = start
    while size >= minimum:
        f = font(kind, size, weight)
        lines = wrap(text, f, max_w)
        lh = int(size * spacing)
        if lh * len(lines) <= max_h and all(f.getlength(l) <= max_w for l in lines):
            return f, lines, lh
        size -= 2
    f = font(kind, minimum, weight)
    return f, wrap(text, f, max_w), int(minimum * spacing)


def draw_centered(d: ImageDraw.ImageDraw, lines, f, lh: int, cx: int, y: int, fill) -> int:
    for line in lines:
        w = f.getlength(line)
        d.text((cx - w / 2, y), line, font=f, fill=fill)
        y += lh
    return y


def ornament(d: ImageDraw.ImageDraw, cx: int, y: int, width: int, color: str) -> None:
    d.line((cx - width // 2, y, cx - 14, y), fill=color, width=2)
    d.line((cx + 14, y, cx + width // 2, y), fill=color, width=2)
    d.polygon([(cx, y - 8), (cx + 8, y), (cx, y + 8), (cx - 8, y)], outline=color, width=2)


def card_back(w: int, h: int, accent: str, base: str) -> Image.Image:
    """Eigenes Kartenrücken-Design (keine fremden Deck-Motive)."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rad = w // 12
    d.rounded_rectangle((0, 0, w - 1, h - 1), rad, fill=base, outline=accent, width=max(3, w // 70))
    m = w // 12
    d.rounded_rectangle((m, m, w - m, h - m), rad // 2, outline=accent, width=2)
    cx, cy = w / 2, h / 2
    r = w * 0.22
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=accent, width=3)
    for k in range(8):
        a = k * math.pi / 4
        d.line((cx + math.cos(a) * r * 0.4, cy + math.sin(a) * r * 0.4, cx + math.cos(a) * r * 1.5, cy + math.sin(a) * r * 1.5), fill=accent, width=2)
    moon(d, cx, cy - h * 0.32, w * 0.07, accent, base)
    moon(d, cx, cy + h * 0.32, w * 0.07, accent, base)
    return img


# ── Motive: Eule, Vollmond, Zwillinge (eigene Linienzeichnungen) ─────────
def _ss_layer(size: int, scale: int = 3):
    layer = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    return layer, ImageDraw.Draw(layer), scale


def _finish(img: Image.Image, layer: Image.Image, cx: float, cy: float, size: int) -> None:
    small = layer.resize((size, size), Image.LANCZOS)
    img.alpha_composite(small, (int(cx - size / 2), int(cy - size / 2)))


def draw_owl(img: Image.Image, cx: float, cy: float, size: int, accent: str, bg: str) -> None:
    layer, d, k = _ss_layer(size)
    S = size * k
    c = S / 2
    col = hex_rgb(accent) + (255,)
    w = max(2, int(S * 0.012))
    # Ast
    d.line((S * 0.08, S * 0.9, S * 0.92, S * 0.9), fill=col, width=w)
    for x in (0.2, 0.78):
        d.line((S * x, S * 0.9, S * (x + 0.07), S * 0.84), fill=col, width=w)
    # Körper
    body = (c - S * 0.3, S * 0.12, c + S * 0.3, S * 0.88)
    d.ellipse(body, fill=hex_rgb(bg) + (255,), outline=col, width=w)
    # Ohrbüschel
    for sx in (-1, 1):
        pts = [(c + sx * S * 0.24, S * 0.22), (c + sx * S * 0.27, S * 0.07), (c + sx * S * 0.2, S * 0.12),
               (c + sx * S * 0.12, S * 0.15)]
        d.polygon(pts, fill=hex_rgb(bg) + (255,))
        d.line(pts, fill=col, width=w, joint="curve")
        d.line((c + sx * S * 0.215, S * 0.15, c + sx * S * 0.245, S * 0.1), fill=col, width=max(1, w // 2))
    # Gesichtsschleier
    for sx in (-1, 1):
        ex, ey = c + sx * S * 0.13, S * 0.34
        for r, ww in ((0.13, w), (0.095, max(1, w // 2)), (0.055, 0)):
            rr = S * r
            if ww:
                d.ellipse((ex - rr, ey - rr, ex + rr, ey + rr), outline=col, width=ww)
            else:
                d.ellipse((ex - rr, ey - rr, ex + rr, ey + rr), fill=col)
        pr = S * 0.026
        d.ellipse((ex - pr, ey - pr, ex + pr, ey + pr), fill=hex_rgb(bg) + (255,))
        hl = S * 0.01
        d.ellipse((ex + pr * 0.3, ey - pr * 1.1, ex + pr * 0.3 + hl * 2, ey - pr * 1.1 + hl * 2), fill=(255, 255, 255, 230))
    # Schnabel
    d.polygon([(c - S * 0.03, S * 0.42), (c + S * 0.03, S * 0.42), (c, S * 0.5)], fill=col)
    # Flügel
    d.arc((c - S * 0.27, S * 0.44, c - S * 0.07, S * 0.84), 95, 265, fill=col, width=w)
    d.arc((c + S * 0.07, S * 0.44, c + S * 0.27, S * 0.84), -85, 85, fill=col, width=w)
    # Brustfedern
    for row in range(4):
        y = S * (0.56 + row * 0.065)
        n = 3 if row % 2 == 0 else 2
        for i in range(n):
            x = c + (i - (n - 1) / 2) * S * 0.09
            d.arc((x - S * 0.035, y - S * 0.03, x + S * 0.035, y + S * 0.03), 20, 160, fill=col, width=max(1, w // 2 + 1))
    # Krallen
    for sx in (-1, 1):
        x = c + sx * S * 0.08
        for dx in (-0.025, 0, 0.025):
            d.line((x, S * 0.86, x + S * dx, S * 0.9), fill=col, width=w)
    _finish(img, layer, cx, cy, size)


def draw_full_moon(img: Image.Image, cx: float, cy: float, size: int, accent: str, bg: str, fog: bool = True) -> None:
    r_, g_, b_ = hex_rgb(accent)
    glow = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((size * 0.55, size * 0.55, size * 1.45, size * 1.45), fill=(r_, g_, b_, 110))
    glow = glow.filter(ImageFilter.GaussianBlur(size // 7))
    img.alpha_composite(glow, (int(cx - size), int(cy - size)))
    layer, d, k = _ss_layer(size)
    S = size * k
    m = S * 0.12
    d.ellipse((m, m, S - m, S - m), fill=(min(255, r_ + 30), min(255, g_ + 30), min(255, b_ + 40), 255))
    cr = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cr)
    for fx, fy, fr in ((0.4, 0.38, 0.1), (0.6, 0.32, 0.06), (0.56, 0.56, 0.12), (0.33, 0.6, 0.07), (0.7, 0.47, 0.05)):
        cd.ellipse((S * (fx - fr), S * (fy - fr), S * (fx + fr), S * (fy + fr)), fill=(max(0, r_ - 70), max(0, g_ - 70), max(0, b_ - 50), 55))
    layer.alpha_composite(cr.filter(ImageFilter.GaussianBlur(S // 60)))
    d.ellipse((m * 0.55, m * 0.55, S - m * 0.55, S - m * 0.55), outline=(r_, g_, b_, 160), width=max(2, int(S * 0.006)))
    if fog:
        fogl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fogl)
        for x0, x1, y, h, a in ((0.0, 0.8, 0.68, 0.05, 120), (0.25, 1.0, 0.78, 0.045, 105), (0.1, 0.7, 0.86, 0.04, 90)):
            fd.ellipse((S * x0, S * (y - h), S * x1, S * (y + h)), fill=(245, 238, 220, a))
        fogl = fogl.filter(ImageFilter.GaussianBlur(S // 40))
        layer.alpha_composite(fogl)
    _finish(img, layer, cx, cy, size)


def draw_gemini(img: Image.Image, cx: float, cy: float, size: int, accent: str, bg: str) -> None:
    layer, d, k = _ss_layer(size)
    S = size * k
    col = hex_rgb(accent) + (255,)
    w = int(S * 0.045)
    d.ellipse((S * 0.04, S * 0.04, S * 0.96, S * 0.96), outline=col, width=max(2, int(S * 0.008)))
    d.ellipse((S * 0.09, S * 0.09, S * 0.91, S * 0.91), outline=hex_rgb(accent) + (110,), width=max(1, int(S * 0.004)))
    d.arc((S * 0.22, S * 0.06, S * 0.78, S * 0.34), 25, 155, fill=col, width=w)      # oberer Bogen
    d.arc((S * 0.22, S * 0.66, S * 0.78, S * 0.94), 205, 335, fill=col, width=w)     # unterer Bogen
    for x in (0.39, 0.61):
        d.line((S * x, S * 0.31, S * x, S * 0.69), fill=col, width=w)
    for a in range(8):
        ang = a * math.pi / 4 + math.pi / 8
        x, y = S / 2 + math.cos(ang) * S * 0.455, S / 2 + math.sin(ang) * S * 0.455
        rr = S * 0.012
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=col)
    _finish(img, layer, cx, cy, size)


def draw_motif(img: Image.Image, kind: str, cx: float, cy: float, size: int, accent: str, bg: str) -> bool:
    fn = {"owl": draw_owl, "moon": draw_full_moon, "gemini": draw_gemini}.get(kind)
    if not fn:
        return False
    fn(img, cx, cy, size, accent, bg)
    return True
