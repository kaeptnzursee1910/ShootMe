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

## Counter-Strike 1.6 mit eigenen Dateien (`/cs16/`)

Unter `…/ShootMe/cs16/` liegt ein Launcher, der Counter-Strike 1.6 mit der freien Engine
[Xash3D FWGS](https://github.com/FWGS/xash3d-fwgs) (WebAssembly-Port *webxash3d-fwgs* + *cs16-client*) im Browser startet – auch auf dem iPad.

- Das Repository enthält **keine** Spieldateien von Valve. Du wählst eine ZIP mit den Ordnern `valve/` und `cstrike/`
  aus deiner eigenen Installation (z. B. Steam). Die Dateien werden nur lokal im Browser entpackt.
- `valve/maps` und `valve/media` werden übersprungen (braucht CS nicht) – am besten gar nicht erst in die ZIP packen, das spart Speicher.
- iPad: WebGL 2 (ab iPadOS 15), am besten mit Tastatur + Maus/Trackpad. Große ZIPs können den Safari-Tab wegen Speichermangels abstürzen lassen.
- Engine und Client werden zur Laufzeit von jsDelivr geladen (`xash3d-fwgs@latest`, `cs16-client@latest`). Fehlermeldungen stehen unter „Technisches Protokoll“.

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
