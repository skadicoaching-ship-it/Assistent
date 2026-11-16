# Assistent – Kunden & Termine

Eine einfache Assistenz-App für Selbstständige (Praxis, Coaching, Behandlungen):
Kunden anlegen, Anwendungen dokumentieren, Fortschritte verfolgen, Termine nach Kategorien planen,
Zahlungen im Blick behalten und rechtzeitig nachfassen.

## Funktionen

- **Übersicht (Dashboard)**
  - Termine der nächsten 7 Tage – mit „✓ Erledigt“ (danach direkt Anwendung dokumentieren)
  - **Nachfassen**: Interessenten und Kunden mit fälliger/überfälliger Wiedervorlage
  - **Noch zu machen**: aktive Kunden mit offenen Anwendungen oder ohne geplanten Folgetermin
  - **Offene Zahlungen** mit „✓ Bezahlt“-Knopf
- **Kunden** mit Suche und Filtern: Nachfassen · Noch zu machen · Offene Zahlung · Interessent · Kunde aktiv · Pausiert · Abgeschlossen · Kein Interesse
- **Kundenkarte**
  - Kontaktdaten mit Anruf-, WhatsApp- und E-Mail-Knopf
  - Status direkt umschaltbar
  - Paket / Programm (z. B. 10er-Karte) mit Fortschrittsbalken „6 / 10 Anwendungen“
  - Verlaufskurve „Befinden 0–10“ über alle Anwendungen
  - Finanzen: gesamt, bezahlt, offen
  - Liste aller Anwendungen mit Notizen, Preis, Bezahlstatus
  - Termine (kommende und vergangene)
  - Kontaktverlauf & Wiedervorlage („Nachgefasst“ → Notiz + nächstes Datum)
- **Termine** in Monats- oder Listenansicht, farblich nach **Kategorien** getrennt
  (Erstgespräch, Anwendung, Nachfassen/Rückruf, Beratung, Online-Termin, Privat …) – Kategorien frei anpassbar, filterbar
- **Zahlungen**: offene und bezahlte Beträge, Einnahmen Monat/Jahr
- **Einstellungen**: Kategorien & Farben, Leistungen mit Preisen, Backup (JSON), Kundenliste als CSV (Excel)

## Starten

Es ist keine Installation nötig – reines HTML/CSS/JavaScript.

- **Lokal ausprobieren:** im Ordner `python3 -m http.server 8000` ausführen und `http://localhost:8000` öffnen
  (oder `index.html` direkt im Browser öffnen).
- **Online / am Handy nutzen:** z. B. mit **GitHub Pages** veröffentlichen
  (Repository → Settings → Pages → Branch auswählen). Danach im Handy-Browser öffnen und
  „Zum Home-Bildschirm hinzufügen“ – die App verhält sich dann wie eine normale App und funktioniert auch offline.

## Wichtig: Daten & Datenschutz

- Alle Daten werden **nur lokal im Browser des jeweiligen Geräts** gespeichert (localStorage) –
  nichts wird an einen Server geschickt. Das ist gut für den Datenschutz (DSGVO), bedeutet aber:
  - Daten werden **nicht automatisch** zwischen Handy und Computer synchronisiert.
  - Wer die Browserdaten löscht, löscht auch die Kundendaten.
- Deshalb regelmäßig unter **Einstellungen → Backup herunterladen** sichern.
  Über „Backup einspielen“ lassen sich die Daten auf einem anderen Gerät wiederherstellen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst der App |
| `css/style.css` | Design (hell/dunkel, Handy & Desktop) |
| `js/app.js` | Gesamte Logik |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-Fähigkeit & Installation auf dem Handy |
