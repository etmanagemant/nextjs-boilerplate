# ETMANAGEMENT CRM — Handoff-Notizen für die nächste Session

Diese Datei existiert, damit eine neue Claude-Code-Session in diesem
Arbeitsverzeichnis schnell wieder auf den aktuellen Stand kommt, ohne dass der
User (nicht-technisch, spricht nur Deutsch mit mir) alles nochmal erklären
muss. Nicht committen, ist reine Arbeitsnotiz - kann gelöscht/überschrieben
werden, sobald sie überholt ist.

## Was das hier ist

CRM für eine OnlyFans/Stripchat-Agentur (ETMANAGEMENT). Next.js 16 + Supabase,
deployed via Vercel (git push = auto-deploy). Ein separater Vultr-VPS
(`80.240.30.188`, **2 vCPU / 2GB RAM** - nicht 1 vCPU/1GB, das wurde in diesem
Chat mehrfach falsch behauptet und vom User korrigiert) läuft `app/vps-
server.js`, ein Node/Express-Prozess der über Puppeteer echte Chrome-Fenster
pro Model steuert (Xvfb + x11vnc + websockify), damit Chatter/Admin OnlyFans
live über VNC im Browser bedienen können, ohne dass OnlyFans eine "Bot"-API
sieht - es ist einfach ein echter, ferngesteuerter Chrome.

## User-Kontext (wichtig für den Umgangston)

- **Nur Deutsch antworten, komplett, keine gemischten englischen Phrasen.**
  Wurde in diesem Chat zweimal korrigiert, beide Male bei technischem
  Zeitdruck - Sprache jeder Antwort vor dem Senden bewusst prüfen.
  (Memory: `feedback_german_only.md`)
- Nicht-technisch, aber sehr aufmerksam und schnell frustriert bei
  wiederholten Fehlern oder Behauptungen ohne Beleg. Erwartet, dass Behauptungen
  live verifiziert werden (Logs, `journalctl`, tatsächliche Tests), nicht nur
  Code gelesen und angenommen wird, dass es funktioniert.
- Betreibt das Ganze operativ selbst mit echten, zahlenden Kunden (Models mit
  echtem Umsatz) - Vorsicht bei allem was live auf einem echten OnlyFans-
  Account passiert (Bann-Risiko ernst nehmen, keine unnötigen Live-Tests auf
  verbundenen Accounts).
- Will das CRM langfristig auch an andere Agenturen verkaufen (SaaS-Vision,
  siehe Memory `project_saas_vision.md`) - Architektur nach Möglichkeit
  multi-tenant-freundlich halten, aber nicht über-engineeren.

## Deploy-Workflow (etabliert, immer so machen)

**Next.js-App-Code** (alles außer `app/vps-server.js`): normaler
`git add && git commit && git push` → Vercel deployed automatisch.

**`app/vps-server.js`** (läuft NICHT über Vercel, sondern direkt auf dem VPS):
```bash
scp -i ~/.ssh/vultr_key app/vps-server.js root@80.240.30.188:/root/puppeteer-server/server.js
ssh -i ~/.ssh/vultr_key root@80.240.30.188 "/root/.nvm/versions/node/v20.20.2/bin/node -c /root/puppeteer-server/server.js && echo OK && systemctl restart crm-vps.service && sleep 3 && systemctl is-active crm-vps.service"
```
Danach IMMER prüfen: `journalctl -u crm-vps.service --since '1 minute ago' --no-pager | grep -E 'Killing|timed out'` (sollte leer sein - sauberer Shutdown) und `/status?modelId=...` für alle verbundenen Models checken (Secret in `.env.local` unter `VPS_SHARED_SECRET`, URL unter `VPS_API_URL`).

**Restarts sind nicht mehr riskant** (siehe unten, Shutdown-Timeout-Fix) - aber
jeder Neustart killt kurzzeitig alle Live-Sessions, die dann automatisch
wiederhergestellt werden sollten. Danach kurz alle Models per `/status`
checken.

**Debug-Routen** (`/debug-eval`, `/debug-goto`, etc.) sind hinter
`DEBUG_ROUTES_ENABLED` versteckt (systemd-Unit-Datei auf dem VPS). Nur bei
echtem Bedarf aktivieren, IMMER direkt danach wieder deaktivieren
(`sed -i '/Environment=DEBUG_ROUTES_ENABLED=true/d' ...` + reload + restart).
**User hat explizit gebeten, möglichst KEINE Live-Navigation mehr auf echten
verbundenen Model-Accounts zu machen** (Verdacht: schnelle, bot-artige
Direktnavigation auf falsche/geratene URLs hat evtl. OnlyFans' eigene
Anti-Bot-Erkennung ausgelöst und eine echte Session invalidiert - nicht 100%
bewiesen, aber Grund genug für Vorsicht). Lieber über Server-Logs/`/health`
verifizieren als live reinklicken.

## Was in dieser Session (2026-07-29) gefixt wurde

1. **App-weiter Freeze-Bug**: Infinite-Loop in `ModelTabsContext.tsx` (zwei
   Context statt einem kombinierten). Gefixt.
2. **Dual-Stechuhr-Bug**: OnlyFans- und Stripchat-Stechuhr teilten sich eine
   Tabelle ohne Plattform-Spalte. Neue `platform`-Spalte + Migration.
3. **Model-Tabs-Redesign** + Klick-Blocker-Regression (pointer-events-Bug),
   beides gefixt.
4. **Direkter Browser→VPS-Upload** (Task #90): ersetzt den alten
   Vercel-Umweg mit 4.5MB-Chunks. Neues HMAC-Token-System
   (`lib/vpsUploadToken.ts`), neue VPS-Route `/public-upload-to-vault-fan`,
   Client umgeschrieben (`lib/uploadVaultBatch.ts`). **ACHTUNG: User meldet
   gerade eben (Task #94) "Netzwerkfehler" beim Testen, keine Nachricht raus
   - noch nicht untersucht, wahrscheinlich ein Bug in diesem neuen Pfad.**
5. **VNC-Tastatur-Bug** (€/$ + Groß-/Kleinschreibung kaputt): Windows' Fake-
   Ctrl+Alt-AltGr-Emulation verliert manchmal ihr 50ms-Zeitfenster und
   hinterlässt eine hängende Modifikator-Taste. Fix in
   `public/novnc/core/input/keyboard.js`: Modifikatoren werden nach kurzer
   Tipp-Pause automatisch losgelassen, nicht nur bei Fensterwechsel.
6. **VPS-Shutdown-Timeout-Bug (wichtig!)**: `TimeoutStopSec=5` in der
   systemd-Unit UND ein interner 5s-Timeout im Code waren zu kurz, um 3
   gleichzeitige Live-Sessions sauber zu schließen - systemd hat den Prozess
   per SIGKILL mitten im Aufräumen abgewürgt, was Model-Sessions zufällig
   korrumpiert hat. Beide Timeouts auf 20-25s angehoben. **Live per
   `journalctl` bestätigt: seitdem sauberer Shutdown, kein SIGKILL mehr.**
7. **Fan-Spend-Sync** (automatisch + historisch statt nur live mitschneiden):
   neue periodische VPS-Routine (alle 4h), scraped OnlyFans' eigene
   "Gesamt"-Spalte auf `/my/collections/user-lists/subscribers/activity` pro
   Fan und synct sie in `crm_fan_metadata.lifetime_value`. Ersetzt/ergänzt den
   alten Live-PPV-Detector, der nur griff wenn der Chat gerade offen war und
   Tips nie erfasst hat. **Noch nicht live verifiziert (erster Lauf nach 4h),
   Selektor ist best-effort** - Server-Logs (`[FAN-SPEND-SYNC]`) prüfen.
8. **Connect-Ansicht zeigte falsches Model**: alle Model-Haupt-Sessions
   teilen sich einen X11-Display (`:1`) - mit mehreren gleichzeitig
   verbundenen Models zeigte die "Connect"-Ansicht irgendein zufällig
   obenauf liegendes Fenster, nicht zwingend das angeforderte Model. Sofort-
   Fix: `page.bringToFront()` bei jedem `/connect`-Aufruf. **Sauberer,
   dauerhafter Fix (eigenes Display pro Model wie bei den Chatter-Slots
   schon vorhanden) ist noch offen - Task #92, laut User von Anfang an so
   gewollt, keine "später"-Sache.**
9. **Kernbug hinter "Model braucht ständig neuen Reconnect"**:
   `crm_model_sessions.is_active` wurde nur beim expliziten Klick auf
   "Creator verbinden" auf `true` gesetzt. Wenn eine Session eigentlich schon
   in Ordnung war und jemand das Verbinden-Fenster einfach nur geschlossen
   hat, blieb `is_active` für immer `false` - und genau das entscheidet, ob
   ein Model nach einem Neustart automatisch wiederhergestellt wird. Fix in
   `BrowserLoginStreamComponent.tsx`: speichert jetzt automatisch, sobald ein
   gültiger Login erkannt wird, kein Klick mehr nötig.

## Bekannte offene Punkte (siehe auch Task-Liste unten)

- **Task #94 (Vault-Upload-Netzwerkfehler)**: konkreter, reproduzierbarer
  Fehler, sollte zuerst angegangen werden. Verdächtige Stellen:
  `lib/uploadVaultBatch.ts` (Token-Anfrage, direkter XHR-POST),
  `/api/crm/upload-token/route.ts`, VPS-Route `/public-upload-to-vault-fan`
  in `app/vps-server.js` (Token-Verifikation, Stream-zu-Disk-Logik).
- **Task #92 (eigenes Display pro Model)**: aktuell nur mit
  `bringToFront()` notdürftig gefixt. Sauberer Fix bräuchte ein eigenes
  Xvfb+x11vnc+websockify-Trio pro Model-Hauptsession (analog zu
  `CHATTER_SLOTS`, die das schon richtig machen).
- **Task #93 (Emoji-Darstellung)**: vermutlich Dark-Mode-CSS-Filter, der auch
  auf Emoji-Glyphen wirkt statt nur auf UI-Farben. Noch nicht untersucht.
- **Task #95 / #87 (Performance)**: User empfindet die OnlyFans-Ansicht als
  spürbar langsamer als OnlyFans direkt. Noch kein fokussierter Audit
  gemacht - sollte als eigener Durchgang passieren: wo lässt sich beim
  VPS (2 vCPU/2GB!) sinnvoll sparen (z.B. Bildschirmauflösung, wie viele
  Chrome-Fenster gleichzeitig), wo NICHT (Bildqualität/Reaktionsgeschwindigkeit
  beim eigentlichen Chatten).
- **Task #91 (Verbindungsabbrüche)**: zwei echte Ursachen gefunden und
  gefixt (Shutdown-Timeout, is_active-Speicher-Lücke). Braucht noch ein paar
  Tage normalen Betrieb, um zu bestätigen dass das Muster wirklich weg ist.
- **Content-Manager sah synchronisierte Ansicht mit Admin**: wahrscheinlich
  Internet-Explorer-Kompatibilitätsproblem (IE unterstützt die moderne
  VNC-Technik kaum), kein bestätigter Code-Bug. User testet mit modernem
  Browser erneut.

## Aktuelle Todo-Liste (Stand 2026-07-29)

Offene (nicht abgeschlossene) Aufgaben:
- #62 ⏸ Skalierung prüfen: VPS-Ressourcen für 4+ aktive Models
- #67 ⏸ OnlyFans Statistik-Dashboard für Models bauen
- #68 ⏸ * Stripchat direkt in Model-Rolle integrieren (braucht mehr Absprache)
- #72 Alle bestehenden Rollen-Beschränkungen ins Rechte-Kontrollzentrum aufnehmen
- #80 Mehrfach-Rollen: eine Person als Chatter UND Moderator gleichzeitig
- #83 ⏸ Webapp/Server-Sicherheit härten (Firewall etc.)
- #84 ⏸ CRM als Produkt an andere Agenturen verkaufen (SaaS-Plan)
- #85 Dashboard: Zeitformat + Admin-Only Schicht-Übersicht (letzte 10)
- #86 Ausgaben-Ring: goldener Rahmen erscheint nicht + "$0" statt "0"
- #87 Performance-Audit: Ladezeiten und allgemeine Reaktionsfreudigkeit
- #89 ⏸ Selbst-Diagnose + Auto-Fehlerbehebung fürs CRM
- #91 [in_progress] OnlyFans-Verbindung: Trennung alle 1-2 Tage untersuchen (zwei Ursachen gefixt, Bestätigung über Zeit nötig)
- #92 Connect-Ansicht: dediziertes Display pro Model statt geteiltem ':1'
- #93 Emoji-Darstellung im Fan-Chat sieht kaputt aus
- #94 Vault-Upload zeigt Netzwerkfehler, keine Nachricht raus (Testlauf) — **zuerst angehen**
- #95 OnlyFans-Ansicht fühlt sich träge an, VNC verdoppelt gefühlt Ladezeiten

(Alle anderen Nummern 1-90 sind abgeschlossen.)

## Empfehlung für den nächsten Chat

1. Zuerst Task #94 (Vault-Upload-Netzwerkfehler) - konkret, reproduzierbar,
   blockiert echte Arbeit.
2. Dann #87/#95 als fokussierten Performance-Durchgang.
3. #92 (eigenes Display pro Model) als nächste größere Architektur-Aufgabe,
   besonders bevor weitere Models/Mitarbeiter dazukommen.
