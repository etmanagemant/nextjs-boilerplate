## 🚀 FINAL ACTION PLAN - SQL MIGRATIONS + E2E TESTS

### SCHRITT 1: SQL-Migrationen vorbereiten

Du musst diese Dateien in **Supabase SQL Editor** (Dashboard → SQL Editor) ausführen:

#### 1️⃣ Foundation Tables (MUSS ZUERST LAUFEN)
**Datei**: `/CRM_INBOX_SETUP.sql` (6283 Bytes)

Inhalt: Erstellt crm_fan_messages, crm_fan_metadata, crm_vault_media + RLS Policies

**Status**: ❓ ÜBERPRÜFUNG NÖTIG
**Wie überprüfen**:
```sql
-- Kopiere in Supabase SQL Editor und führe aus:
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_fan_messages');
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_vault_media');
```

---

#### 2️⃣ Script Library (NACH Schritt 1)
**Datei**: `/CRM_SESSIONS_SETUP.sql` (5643 Bytes)

Inhalt: Erstellt crm_script_library, crm_model_sessions, crm_chatter_emojis + RLS

**Status**: ❓ ÜBERPRÜFUNG NÖTIG
**Wie überprüfen**:
```sql
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_script_library');
```

---

#### 3️⃣ Message Extensions (NACH Schritt 1)
**Datei**: `/CRM_FAN_MESSAGES_EXTEND.sql` (1356 Bytes)

Inhalt: Fügt sent_to_platform, external_message_id zu crm_fan_messages hinzu

**Status**: ❓ ÜBERPRÜFUNG NÖTIG
**Wie überprüfen**:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'crm_fan_messages' AND column_name = 'sent_to_platform';
```

---

#### 4️⃣ Storage Policies (NACH Schritt 1)
**Datei**: `/CRM_VAULT_STORAGE_POLICIES.sql` (NEU ERSTELLT)

Inhalt: RLS Policies für 'crm-vault-media' Bucket

**Vorbedingung**: Bucket 'crm-vault-media' muss in Supabase Storage existieren

**Wie erstellen**: 
- Gehe zu Supabase Dashboard → Storage
- Klick "New bucket"
- Name: `crm-vault-media`
- Private: ☑ (checked)

---

### SCHRITT 2: Execution-Befehl

```
1. Öffne Supabase Dashboard
2. Gehe zu SQL Editor
3. Kopiere GANZEN Inhalt von CRM_INBOX_SETUP.sql
4. Klick RUN (die Datei hat mehrere Schritte, alle sollten funktionieren)
5. Falls erfolgreich: Mache dasselbe mit CRM_SESSIONS_SETUP.sql
6. Falls erfolgreich: Mache dasselbe mit CRM_FAN_MESSAGES_EXTEND.sql
7. Falls erfolgreich: Mache dasselbe mit CRM_VAULT_STORAGE_POLICIES.sql
```

---

### SCHRITT 3: Fehlerbehandlung

**Wenn du einen Fehler bekommst wie:**
- "relation already exists" → Die Tabelle existiert bereits ✅ (Gut!)
- "permission denied" → RLS-Problem, frag den Supabase-Admin
- "column already exists" → Column existiert bereits ✅ (Gut!)

---

### SCHRITT 4: End-to-End Tests

Nachdem alle SQL-Dateien ausgeführt wurden:

```bash
# Terminal 1: App starten
cd nextjs-boilerplate
npm run dev

# App sollte auf http://localhost:3000 laufen
```

**Test Sequence** (siehe `E2E_TEST_PLAN.md` für Details):

1. ✅ Login als Admin
2. ✅ Test Script Vault (Create/Edit/Delete)
3. ✅ Logout & Login als Chatter
4. ✅ Test Upload Vault (Upload/Filter/Delete)
5. ✅ Test Message Sending (Send Message, Check sent_to_platform)

---

## 📊 DEPENDENCIES GRAPH

```
CRM_INBOX_SETUP.sql (Grundlage)
    ↓
    ├→ CRM_SESSIONS_SETUP.sql (Script Library)
    ├→ CRM_FAN_MESSAGES_EXTEND.sql (Message Tracking)
    └→ CRM_VAULT_STORAGE_POLICIES.sql (Storage Permissions)
    
Nach allen 4:
    ↓
    ├→ Script Vault arbeitet ✅
    ├→ Upload Vault arbeitet ✅
    └→ Message Sending arbeitet ✅
```

---

## ⚠️ CHECKLIST VOR START

- [ ] Supabase Projekt ist aktiv
- [ ] Du hast Zugang zu SQL Editor
- [ ] Du weißt deine Supabase Projekt-URL
- [ ] .env.local hat Supabase Keys
- [ ] Node.js & npm sind installiert

---

## 🎯 QUICK REFERENCE

| Datei | Zweck | Größe | Zeit |
|-------|--------|--------|------|
| CRM_INBOX_SETUP.sql | 3 Main Tables | 6.3KB | 1-2 Min |
| CRM_SESSIONS_SETUP.sql | Script + Sessions | 5.6KB | 1-2 Min |
| CRM_FAN_MESSAGES_EXTEND.sql | Messaging Columns | 1.4KB | <1 Min |
| CRM_VAULT_STORAGE_POLICIES.sql | Storage RLS | NEU | <1 Min |

**Total Zeit für alle 4**: ~5-10 Minuten

---

## 📝 NOTIZEN

- Alle SQL-Dateien sind **idempotent** (können mehrmals ausgeführt werden ohne Fehler)
- RLS Policies werden automatisch aktiviert in CRM_INBOX_SETUP.sql
- Nach jedem SQL-Run solltest du die Datenbank-Verbindung in der App kurz refresh
