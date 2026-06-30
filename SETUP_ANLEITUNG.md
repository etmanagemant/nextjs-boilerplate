# 🚀 MODERATOR-SYSTEM - KOMPLETTE SETUP-ANLEITUNG

## 📋 CHECKLIST - SCHRITT FÜR SCHRITT

### 1️⃣ **SQL-Migration ausführen** (5 Min)
```
Gehe zu deiner Supabase Console:
1. Öffne: https://supabase.com/dashboard
2. Wähle dein Projekt (nextjs-boilerplate)
3. Gehe zu: SQL Editor (linke Seite)
4. Öffne die Datei: SETUP_MODERATOR_SYSTEM.sql (im Repository)
5. Kopiere ALLE Queries rein
6. Klick "Run" um alles auszuführen

⚠️ WICHTIG: Wenn Fehler kommen mit "Column already exists" → Ignorieren! 
Das bedeutet die Spalte existiert bereits.
```

### 2️⃣ **Build & Deploy** (2 Min)
```bash
cd "c:\Users\smoke\Documents\GitHub\nextjs-boilerplate"
npm run build   # Sollte erfolgreich kompilieren ✅
npm run start   # Optional: Lokal testen
```

### 3️⃣ **Moderator-Setup in der App** (3 Min)

#### A) Neuen Moderator erstellen:
1. Gehe zu **Login** → Registriere einen neuen Benutzer
2. Gehe zu **Management Panel**
3. Suche den neuen Benutzer in der Liste
4. Ändere seine **Rolle** zu "🎭 Moderator (Stripchat)"
5. Setze sein **Stundenhonorar** (z.B. 18.50 EUR/h)
6. Klick ✓ zum Speichern

#### B) Models auf Stripchat einstellen:
1. Im Management Panel, unten bei Models
2. Wähle deine Stripchat-Models
3. Setze Platform auf: "🎭 Stripchat"

### 4️⃣ **Moderator arbeitet jetzt** (Automatisch!)

#### Stechuhr (chatter/page.tsx)
- Login als Moderator
- Sieht: **🎭 Stripchat Stechuhr** (nicht normale Stechuhr)
- Nur **Stripchat-Models** im Dropdown sichtbar
- Private Shows starten/beenden

#### Dashboard (dashboard/page.tsx)
- Login als Moderator
- Sieht: **Prämien-Fortschritt** mit Farben!
  - 🟢 Grün wenn 15+ Shows
  - 🔵 Blau wenn 20+ Shows
  - 🟣 Lila wenn 25+ Shows (🏆 MEGA-BONUS!)

#### Abrechnung (abrechnung/page.tsx)
- Zeigt: **Stundenhonorar** + **Prämie-Berechnung**
- Beispiel: (40 Stunden × 18€) + 50€ Prämie = 770€

---

## 🎭 **MODERATOR-FEATURES - WAS IST IMPLEMENTIERT**

### Private Show Tracking
✅ Starten/Stoppen mit Timer
✅ Nur Shows >= 5 Minuten zählen für Prämie
✅ Automatische Dauer-Erfassung
✅ Prämien-Counter wird erhöht

### Stundenhonorar
✅ EUR/h statt % Provision
✅ Einstellbar im Management Panel
✅ Automatische Berechnung in Abrechnung

### Prämien-System
✅ 15 Shows = 30€ Extra
✅ 20 Shows = 50€ Extra
✅ 25 Shows = 70€ Extra
✅ Farbige Progress-Anzeige im Dashboard

### Dashboard Visualisierung
✅ Stripchat Brutto/Netto KPIs
✅ Private Show Stunden
✅ Prämien-Fortschritt mit Farbcodierung
✅ Motivierendes Design

---

## ⚠️ WICHTIG - KALENDER-FILTERUNG

**Chatters und Moderatoren sehen verschiedene Schichten!**

- 🎬 **Chatters** sehen nur: OnlyFans-Schichten (Gold-Rahmen)
- 🎭 **Moderators** sehen nur: Stripchat-Schichten (Grau-Rahmen)
- 👑 **Admins** sehen: ALLES (beide Farben)

Die Filterung funktioniert AUTOMATISCH basierend auf:
- user.role in der Datenbank
- Model.platform_type (onlyfans / stripchat / both)

---

## 🔍 TESTING-CHECKLIST

Nach dem Setup, überprüfe das Folgende:

### Test 1: Moderator anmelden
```
✅ Login als Moderator
✅ Sieht "🎭 Stripchat Stechuhr" (nicht normale Stechuhr)
✅ Dropdown zeigt nur Stripchat-Models
```

### Test 2: Private Show tracken
```
✅ Klick "Private Show starten"
✅ Timer läuft
✅ Nach 5+ Min: Klick "Beenden"
✅ Feedback: "✅ Privat-Show gezählt!"
✅ Counter erhöht sich um 1
```

### Test 3: Dashboard Prämien
```
✅ Dashboard zeigt 3 farbige Progress-Boxen
✅ Anzahl Shows wird angezeigt (z.B. "8/15")
✅ Progress-Bars füllen sich
✅ Farben ändern wenn Ziele erreicht
```

### Test 4: Abrechnung
```
✅ Zeigt "💰 Stundenhonorar" statt Provision
✅ Zeigt "🎁 Prämie" wenn Ziel erreicht
✅ Berechnung korrekt: (Stunden × Honorar) + Prämie
```

---

## 🚨 TROUBLESHOOTING

### Problem: "Spalte existiert bereits"
→ **Lösung**: Ignorieren! Das ist ok - die Spalte war schon da.

### Problem: Moderator sieht keine Models
→ **Überprüfe**:
1. Model wurde auf platform_type = 'stripchat' gesetzt?
2. Moderator ist angemeldet?
3. Wurde gerefresht? (F5)

### Problem: Prämien-Progress zeigt 0
→ **Überprüfe**:
1. Private Shows wurden >= 5 Min gestartet/beendet?
2. Shift wurde beendet (damit Daten gespeichert werden)?
3. Dashboard wurde refreshed?

### Problem: Stundenhonorar wird nicht angezeigt
→ **Überprüfe**:
1. Moderator-Rolle wurde gesetzt?
2. hourly_rate Spalte existiert in profiles?
3. Wert wurde eingegeben (nicht 0)?

---

## 📞 SUPPORT

Wenn etwas nicht funktioniert:
1. **Build-Fehler?** → `npm run build` nochmal ausführen
2. **Datenbank-Fehler?** → SQL-Queries in Supabase überprüfen
3. **UI-Problem?** → Browser-Cache löschen (Ctrl+Shift+Del)

---

## ✅ STATUS NACH SETUP

```
🎭 Moderator System: READY TO GO
├─ ✅ 5-Minuten-Regel
├─ ✅ Private Show Counter
├─ ✅ Prämien-System (15/20/25 Shows)
├─ ✅ Stundenhonorar
├─ ✅ Kalender-Filterung
├─ ✅ Dashboard mit Farben
├─ ✅ Abrechnung-Berechnung
└─ ✅ Model-Filterung (Stripchat nur)

🚀 Production-Ready!
```
