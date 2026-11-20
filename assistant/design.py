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
