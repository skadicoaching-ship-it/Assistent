"""Erzeugt Hochkant-Videos (1080x1920, 9:16) für Reels & TikTok.

Formate:
  pick_a_card   – "Wähle eine Karte": 3 verdeckte Karten, Pause-Aufforderung, Auflösung je Stapel
  ritual_steps  – Ritual Schritt für Schritt
  card_meaning  – Kartenbedeutung / Lern-Slides

Das Video ist bewusst ohne Ton: Den aktuell trendenden Sound wählst du beim
Hochladen direkt in Instagram/TikTok (das erhöht die Reichweite deutlich und
ist rechtlich sauber – Trend-Sounds dürfen nicht in die Datei gebrannt werden).
"""
from __future__ import annotations

import math
import subprocess
import zlib
from pathlib import Path

from PIL import Image, ImageDraw

from .design import (draw_motif, card_back, config, draw_centered, draw_stars, fit_text, font, gradient, hex_rgb, moon, ornament,
                     stars, theme)

W, H, FPS = 1080, 1920, 30


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def _text_block(img, text, kind, weight, box_w, box_h, start, y, color, alpha=1.0, spacing=1.1, minimum=36):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f, lines, lh = fit_text(text, kind, weight, box_w, box_h, start, minimum, spacing)
    r, g, b = hex_rgb(color)
    end = draw_centered(d, lines, f, lh, W // 2, y, (r, g, b, int(255 * alpha)))
    img.alpha_composite(layer)
    return end


def _card_front(w, h, name, th):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    acc = th["accent"]
    light = "#fbf6ec"
    d.rounded_rectangle((0, 0, w - 1, h - 1), w // 12, fill=light, outline=acc, width=6)
    d.rounded_rectangle((18, 18, w - 18, h - 18), w // 20, outline=acc, width=2)
    moon(d, w / 2, h * 0.3, w * 0.13, acc, light)
    f, lines, lh = fit_text(name, "serif", "Bold", w - 60, h * 0.35, 64, 28, 1.05)
    draw_centered(d, lines, f, lh, w // 2, int(h * 0.55), th["bg"][0])
    return img


def _paste_card(frame, card, cx, cy, scale_x=1.0, rot=0.0):
    sx = max(1, int(card.width * abs(scale_x)))
    c = card.resize((sx, card.height), Image.LANCZOS)
    if rot:
        c = c.rotate(rot, expand=True, resample=Image.BICUBIC)
    frame.alpha_composite(c, (int(cx - c.width / 2), int(cy - c.height / 2)))


class Builder:
    def __init__(self, spec: dict):
        self.spec = spec
        self.th = theme(spec.get("theme"))
        seed = zlib.crc32(spec["id"].encode())
        self.bg = gradient((W, H), *self.th["bg"]).convert("RGBA")
        self.field = stars((W, H), seed, 180)
        self.scenes: list[tuple[float, callable]] = []
        brand = config()["brand"]
        self.handle = brand.get("handle") or brand.get("name")
        self.motif = spec.get("motif")
        self.motifs = spec.get("slide_motifs") or []
        self._slide_i = 0

    def slide_motif(self):
        return self.motifs[self._cur % len(self.motifs)] if self.motifs else self.motif

    def base(self, t):
        img = self.bg.copy()
        draw_stars(img, self.field, self.th["accent"], t)
        d = ImageDraw.Draw(img)
        f = font("sans", 30, "Medium")
        d.text(((W - f.getlength(self.handle)) / 2, H - 150), self.handle, font=f, fill=self.th["accent"])
        return img

    def add(self, dur, fn):
        self.scenes.append((dur, fn))

    # ── Szenen ────────────────────────────────────────────
    def hook(self, text, dur=2.8):
        def fn(img, t, T):
            a = ease(t / 0.5)
            if self.motif:
                sz = int(420 * (0.85 + 0.15 * a))
                draw_motif(img, self.motif, W / 2, 520, sz, self.th["accent"], self.th["bg"][0])
                _text_block(img, text, "serif", "Bold", W - 160, 600, 112, 820 - int(30 * a), self.th["text"], a, 1.05)
            else:
                moon(ImageDraw.Draw(img), W / 2, 520, 60 * a + 1, self.th["accent"], self.th["bg"][0])
                _text_block(img, text, "serif", "Bold", W - 160, 700, 118, 680 - int(30 * a), self.th["text"], a, 1.05)
        self.add(dur, fn)

    def slide(self, title, body, step=None, dur=None):
        dur = dur or max(3.2, min(6.5, 1.6 + len(body) / 22))
        idx = self._slide_i
        self._slide_i += 1

        def fn(img, t, T):
            a = ease(t / 0.45)
            if self.motif:
                self._cur = idx
                draw_motif(img, self.slide_motif(), W / 2, 470, 200, self.th["accent"], self.th["bg"][0])
            d = ImageDraw.Draw(img)
            if step:
                f = font("sans", 34, "SemiBold")
                s = f"SCHRITT {step}"
                d.text(((W - f.getlength(s)) / 2, 690), s, font=f, fill=self.th["accent"])
            y = _text_block(img, title, "serif", "Bold", W - 160, 420, 96, 760, self.th["text"], a, 1.05)
            ornament(d, W // 2, y + 40, 340, self.th["accent"])
            b = ease((t - 0.35) / 0.5)
            _text_block(img, body, "sans", "Regular", W - 200, 650, 48, y + 95, self.th["text"], b, 1.4, 32)
        self.add(dur, fn)

    def pick(self, n=3, dur=5.0):
        back = card_back(270, 450, self.th["accent"], self.th["bg"][0])

        def fn(img, t, T):
            d = ImageDraw.Draw(img)
            _text_block(img, "Wähle eine Karte", "serif", "Bold", W - 140, 200, 104, 330, self.th["text"], 1.0)
            for i in range(n):
                cx = W / 2 + (i - (n - 1) / 2) * 320
                bob = math.sin(t * 2.5 + i) * 12
                appear = ease((t - i * 0.25) / 0.5)
                _paste_card(img, back, cx, 1000 + bob + (1 - appear) * 400)
                f = font("serif", 90, "Bold")
                num = str(i + 1)
                d.text((cx - f.getlength(num) / 2, 1270), num, font=f, fill=self.th["accent"])
            left = max(0, math.ceil(T - t))
            f = font("sans", 40, "SemiBold")
            msg =f"Pausiere jetzt  ·  {left}"
            d.text(((W - f.getlength(msg)) / 2, 1460), msg, font=f, fill=self.th["text"])
        self.add(dur, fn)

    def reveal(self, pile, name, message, dur=None):
        dur = dur or max(4.5, min(8.0, 2.6 + len(message) / 24))
        back = card_back(330, 550, self.th["accent"], self.th["bg"][0])
        front = _card_front(330, 550, name, self.th)

        def fn(img, t, T):
            f = font("sans", 40, "SemiBold")
            s = f"KARTE {pile}"
            ImageDraw.Draw(img).text(((W - f.getlength(s)) / 2, 230), s, font=f, fill=self.th["accent"])
            p = ease(t / 0.9)
            sx = math.cos(p * math.pi)
            _paste_card(img, back if sx > 0 else front, W / 2, 640, sx)
            a = ease((t - 0.9) / 0.5)
            _text_block(img, message, "sans", "Regular", W - 190, 560, 50, 990, self.th["text"], a, 1.4, 32)
        self.add(dur, fn)

    def cta(self, text, dur=3.2):
        def fn(img, t, T):
            a = ease(t / 0.5)
            if self.motif:
                draw_motif(img, self.motif, W / 2, 470, 260, self.th["accent"], self.th["bg"][0])
            y = _text_block(img, text, "serif", "Bold", W - 180, 600, 92, 700, self.th["text"], a, 1.08)
            d = ImageDraw.Draw(img)
            ornament(d, W // 2, y + 50, 380, self.th["accent"])
            f = font("sans", 38, "SemiBold")
            s = "Link in Bio"
            d.text(((W - f.getlength(s)) / 2, y + 100), s, font=f, fill=self.th["accent"])
        self.add(dur, fn)

    # ── Render ────────────────────────────────────────────
    def render(self, out: Path) -> Path:
        out.parent.mkdir(parents=True, exist_ok=True)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
               "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        clock = 0.0
        for dur, fn in self.scenes:
            frames = int(dur * FPS)
            for k in range(frames):
                t = k / FPS
                img = self.base(clock + t)
                fn(img, t, dur)
                # sanftes Ein-/Ausblenden zwischen Szenen
                fade = min(1.0, t / 0.25, (dur - t) / 0.25)
                if fade < 1:
                    img = Image.blend(self.base(clock + t), img, max(0.0, fade))
                proc.stdin.write(img.convert("RGB").tobytes())
            clock += dur
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError("ffmpeg fehlgeschlagen")
        return out


def render_video(spec: dict, out: Path) -> Path:
    b = Builder(spec)
    b.hook(spec["hook"])
    fmt = spec.get("format", "pick_a_card")
    if fmt == "pick_a_card":
        b.pick(len(spec["cards"]))
        for c in spec["cards"]:
            b.reveal(c["pile"], c["name"], c["message"])
    else:
        for i, s in enumerate(spec["slides"], 1):
            b.slide(s["title"], s["text"], step=i if fmt == "ritual_steps" else None)
    b.cta(spec.get("cta", "Mehr findest du in meinem Blog"))
    return b.render(out)
