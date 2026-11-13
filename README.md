# ShootMe

Ein schneller Arena-Shooter, der komplett im Browser läuft – mit **Online-Multiplayer per Peer-to-Peer (WebRTC)**.
Kein Server, kein Build-Schritt: nur `index.html` + `game.js`.

## Spielen

- **Solo gegen Bots** – 1–7 Bots, die die Karte ablaufen und auf Sicht schießen.
- **Online-Spiel hosten** – erzeugt einen 5-stelligen Raumcode und einen Einladungslink (`…/#CODE`). Der Host kann zusätzlich Bots ins Match holen.
- **Beitreten** – Code eingeben oder Einladungslink öffnen. Bis zu 8 Spieler pro Raum.

### Steuerung

| | PC | Handy/Tablet |
|---|---|---|
| Bewegen | WASD / Pfeiltasten | Joystick (linke Bildschirmhälfte) |
| Zielen | Maus | Wischen (rechte Bildschirmhälfte) |
| Schießen | Linke Maustaste (halten) | FEUER halten |
| Nachladen | R | ↻ |
| Punktestand | Tab | # |
| Menü / Pause | Esc | ☰ |

## Online stellen (GitHub Pages)

1. Repository → **Settings → Pages**
2. *Source*: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → **Save**
3. Nach ca. 1 Minute läuft das Spiel unter `https://kaeptnzursee1910.github.io/ShootMe/`

Lokal reicht ein einfacher Webserver, z. B. `python3 -m http.server` und dann `http://localhost:8000` öffnen.

## Wie der Multiplayer funktioniert

- Verbindungen laufen direkt zwischen den Browsern über WebRTC-DataChannels ([PeerJS](https://peerjs.com/)).
  Nur zum Kennenlernen (Signaling) wird der kostenlose öffentliche PeerJS-Server benutzt.
- Stern-Topologie: Alle Clients verbinden sich mit dem Host, der Host leitet Nachrichten weiter und steuert die Bots.
- Jeder Spieler ist für seine eigene Figur zuständig (Position 20×/s, Leben, Tod). Treffer meldet der Schütze an den Besitzer des Ziels.
- Hinweis: In manchen Netzen (strenge Firmen-/Mobilfunk-NATs) kann eine direkte WebRTC-Verbindung ohne TURN-Server scheitern.
  Dann hilft oft ein anderes WLAN oder ein eigener TURN-Server (in `game.js` beim `new Peer(...)` als `config.iceServers` eintragen).

## Technik

- Eigener Raycasting-Renderer (Canvas, ImageData) mit prozedural erzeugten Texturen, Boden-Casting, Dunst und Billboard-Sprites.
- Hitscan-Waffe mit Streuung, Rückstoß und Nachladen, synthetisierte Sounds (WebAudio).
- Bots mit BFS-Wegfindung, Sichtlinienprüfung und Reaktionszeit.
