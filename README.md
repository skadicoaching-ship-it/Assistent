# Social-Media-Assistent (Pinterest · Instagram · TikTok)

Liefert jeden Morgen bis **6:00 Uhr** fertigen Content zum Selbsthochladen.
Aktueller Fokus: **Rauhnächte-Journal (PDF)**, Zielgruppe Self-Care-Frau.

Recherchiert täglich Trends rund um Tarot, Kartenlegen & Rituale, plant
**5 Pinterest-Pins pro Tag – 7 Tage im Voraus** (Bild + Titel + Beschreibung +
Keywords + Alt-Text) und erstellt **1 Hochkant-Video pro Tag** für Reels und TikTok.

## Wo finde ich was?

```
content/<datum>/
  UEBERSICHT.md         ← hier starten: alle Pins, Texte, Caption, Sound-Tipp
  pins/pin-1…5.png      ← Pin-Bilder (1000×1500)
  videos/*.mp4          ← Reel/TikTok (1080×1920, ohne Ton)
  pinterest_bulk.csv    ← Massen-Upload für Pinterest
  plan.json             ← Rohdaten – hier trägst du deine Links ein
trends/<datum>.md       ← Trend-Recherche mit Quellen
config/brand.yaml       ← Marke, Zielgruppe, Boards, Uhrzeiten, Farben
```

## Dein Teil: Links eintragen

In `content/<datum>/plan.json` bei jedem Pin das Feld `"link": ""` füllen
(Tipp steht in `link_hint`). Pins ohne Link werden **nicht** automatisch gepostet.
Danach neu bauen: `python3 -m assistant.build <datum> --no-video`.

## Veröffentlichen – drei Wege

1. **Ohne API (sofort möglich):** Pins aus `UEBERSICHT.md` in Pinterest anlegen
   und dort einplanen, oder `pinterest_bulk.csv` über
   *Pinterest → Erstellen → Pins in großer Anzahl erstellen* hochladen
   (dafür muss `media_base_url` in `brand.yaml` gesetzt sein).
   Videos in Instagram/TikTok hochladen, Trend-Sound in der App wählen.
2. **Mit API (automatisch):** siehe unten.
3. **Planungstool** (Later, Buffer, Tailwind …): CSV bzw. Dateien importieren.

## API-Zugänge einrichten

| Plattform | Voraussetzung | Token |
|---|---|---|
| Pinterest | Business-Konto + App auf developers.pinterest.com (Scopes `boards:read`, `pins:write`) | `PINTEREST_ACCESS_TOKEN` |
| Instagram | Professional-Konto, mit Facebook-Seite verknüpft, Meta-App mit `instagram_content_publish` | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` |
| TikTok | Developer-App mit *Content Posting API* (`video.upload`) | `TIKTOK_ACCESS_TOKEN` |

TikTok-Videos landen als **Entwurf** in deiner TikTok-App – dort wählst du den
Trend-Sound und postest. (Direktes Posten erlaubt TikTok erst nach einem Audit.)

Tokens niemals in Dateien im Repo speichern.

## Befehle

```bash
python3 -m assistant.build 2026-11-21            # Tag bauen
python3 -m assistant.build --all                 # alle Tage bauen
python3 -m assistant.publish pinterest --boards  # Board-IDs anzeigen
python3 -m assistant.publish pinterest --due     # fällige Pins posten
python3 -m assistant.publish tiktok 2026-11-21   # Video als TikTok-Entwurf
python3 -m assistant.publish instagram 2026-11-21
```

Schriften: Cormorant Garamond & Montserrat (SIL Open Font License, siehe `assets/fonts`).
