# CRM OnlyFans Integration - Setup Anleitung

## 🔴 Problem: OnlyFans lädt nicht im CRM-Inbox

Wenn OnlyFans in der 4-spaltig CRM-Inbox nicht lädt, sind das die häufigsten Ursachen:

### 1. ❌ Keine aktive Browserless Session für das Model

**Problem:** Der Server sucht nach einer aktiven Session in der Datenbank für dein Model, findet aber keine.

**Lösung:** Model in Management > CRM-Connect einrichten

1. Gehe zu `/management/crm-connect`
2. Suche nach deinem Model (z.B. TESTMODEL)
3. Klicke auf "🔗 Connect" oder "⚙️ Setup"
4. Authentifiziere dich mit OnlyFans (wenn Browserless danach fragt)
5. Warte bis die Session aktiv ist (grüner Status)

### 2. ❌ Session ist abgelaufen

**Problem:** Die Session war aktiv, aber ist jetzt nach >30 Minuten Inaktivität abgelaufen.

**Lösung:** Im CRM-Inbox oben im Header auf 🔄 Reload klicken

- **Screenshot Button** - Nur neuen Screenshot holen
- **Reload Button** - Seite neuladen und Session erfrischen
- **Bei Fehler** - Retry Knopf klicken

### 3. ❌ Model hat keine Verbindung zu OnlyFans

**Problem:** Model ist in `crm_model_sessions` aber ohne gültige Auth-Cookies.

**Lösung:** Model disconnect und neu connect

```bash
# Manuell in DB (als Admin)
DELETE FROM crm_model_sessions WHERE model_id = 'TESTMODEL' AND is_active = false;
```

Dann in Management > CRM-Connect neu einrichten.

---

## ✅ So überprüfst du den Status

### Debug API aufrufen:

```bash
# Alle aktiven Sessions
GET /api/crm/session-status

# Spezifisches Model
GET /api/crm/session-status?modelId=TESTMODEL
```

**Beispiel Response (Session aktiv):**
```json
{
  "status": "found",
  "modelId": "TESTMODEL",
  "session": {
    "is_active": true,
    "has_browserless_session": true,
    "has_auth_cookies": true,
    "created_at": "2025-01-15T10:30:00Z",
    "last_used": "2025-01-15T10:50:00Z"
  }
}
```

**Beispiel Response (Session NICHT aktiv):**
```json
{
  "status": "not_found",
  "modelId": "TESTMODEL",
  "message": "No session found for this model. Setup required in /management/crm-connect"
}
```

---

## 🛠️ CRM Features und wo sie sind

### NextShiftsWidget (Nächste 2 Schichten)
- **Hauptseite:** `/` - Oben auf der Landing Page
- **CRM-Inbox:** `/crm-inbox` - Oben als Header über den Chats
- **Zeigt:** Nächste 2 Shifts des eingeloggten Users
- **Button:** "Zu Stechuhr & einchecken" → `/chatter`

### Shift Management
- **Stechuhr:** `/chatter` - Clock-In/Out mit Timer
- **Inhalt:** Shift Management, Shift History, nächste Shifts
- **Data:** shift_assignments Tabelle mit started_at, ended_at

### Weekly Calendar
- **Ort:** `/content-plan` - Zeigt Shifts als Weekly Grid
- **Features:** Edit/Delete (nur Admin), Farbcoding nach Plattform
- **Data:** shifts Tabelle mit notes als JSON

### OnlyFans CRM
- **Ort:** `/crm-inbox` - 4-spaltig Layout
- **Spalten:** 
  1. Sidebar (Model Selector)
  2. Chat List
  3. Chat Thread
  4. OnlyFans Stream Viewer
- **Funktionen:** Left-Click Model→OnlyFans laden | Right-Click→Menu

---

## 📝 Model Setup Flow (Manager/Admin)

1. **Model anlegen** in `/management`
   - Name, Platform, Profile Link

2. **Session erstellen** in `/management/crm-connect`
   - Model auswählen
   - Browserless Auto-Login triggern
   - Session ID speichern in crm_model_sessions

3. **OnlyFans im CRM laden** in `/crm-inbox`
   - Model in Sidebar klicken (Left-Click)
   - OnlyFans canvas wird mit Live-Screenshot gefüllt
   - Chat/Cockpit zeigen Daten von diesem Model

---

## 🐛 Troubleshooting

| Problem | Lösung |
|---------|---------|
| OnlyFans canvas bleibt leer | `/api/crm/session-status?modelId=XXX` checken, ggf. Reload drücken |
| "No active session" Error | Model in `/management/crm-connect` neu einrichten |
| Session lädt, aber falsche Seite | Refresh Session (🔄 Reload Button) klicken |
| NextShiftsWidget zeigt keine Shifts | Shifts Daten in DB checken, User-Matching überprüfen |
| Browserless Fehler | API Key in .env.local prüfen, Budget checken (100/Monat) |

---

## 🔑 Environment Variables

```env
# BROWSERLESS_API_KEY=xxx
# SUPABASE_SERVICE_ROLE_KEY=xxx
```

Beide müssen gesetzt sein für CRM zu funktionieren!

---

## 📊 Database Schema

### crm_model_sessions
```sql
- id (uuid)
- model_id (text, unique)
- is_active (boolean)
- auth_cookies (jsonb, nullable)
  - auth_cookies.browserless_session_id (string)
  - auth_cookies.cookies (array)
- created_at (timestamp)
- last_used (timestamp)
```

### shifts
```sql
- id (serial)
- shift_date (date)
- notes (jsonb)
  - mitarbeiter (string)
  - von (HH:MM)
  - bis (HH:MM)
  - model (string)
  - nachricht (string)
```

---

## 🚀 Next Steps

1. ✅ Stelle sicher dein Model in `/management/crm-connect` eingerichtet ist
2. ✅ Prüfe `/api/crm/session-status?modelId=DEIN_MODEL` im Browser
3. ✅ Gehe zu `/crm-inbox` und klick auf dein Model
4. ✅ Wenn OnlyFans immer noch nicht lädt → Prüfe Browser Console (F12)
5. ✅ Erstelle Support-Ticket mit Screenshot der Error-Message
