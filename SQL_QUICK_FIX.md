## 🚀 QUICK FIX - STEP-BY-STEP SQL EXECUTION (FUNKTIONIERT GARANTIERT)

### Problem:
Die normalen SQL-Dateien haben RLS Policies die fehlschlagen können. Lösung: **SAFE Versionen verwenden!**

---

### ✅ NEUE REIHENFOLGE (NUR SAFE Versionen benutzen):

#### SCHRITT 1: CRM_INBOX_SETUP_SAFE.sql (zuerst!)
```
1. Öffne Supabase Dashboard
2. Gehe zu SQL Editor
3. Kopiere KOMPLETTEN Inhalt von: CRM_INBOX_SETUP_SAFE.sql
4. Klick RUN
5. ✅ Sollte NO ERROR sein
```

#### SCHRITT 2: CRM_SESSIONS_SETUP_SAFE.sql
```
1. Neue SQL Query öffnen (oder gleiche leeren)
2. Kopiere: CRM_SESSIONS_SETUP_SAFE.sql
3. Klick RUN
4. ✅ Sollte NO ERROR sein
```

#### SCHRITT 3: CRM_FAN_MESSAGES_EXTEND.sql
```
1. Kopiere: CRM_FAN_MESSAGES_EXTEND.sql
2. Klick RUN
3. ✅ Sollte funktionieren (adds columns zu crm_fan_messages)
```

#### SCHRITT 4: CRM_VAULT_MEDIA_EXTEND.sql
```
1. Kopiere: CRM_VAULT_MEDIA_EXTEND.sql
2. Klick RUN
3. ✅ Sollte funktionieren (adds storage_path column)
```

#### SCHRITT 5: CRM_VAULT_STORAGE_POLICIES.sql
```
1. Kopiere: CRM_VAULT_STORAGE_POLICIES.sql
2. Klick RUN
3. ✅ Sollte funktionieren (adds storage RLS)
```

---

## ⚠️ WICHTIG

**NICHT benutzen:**
- ❌ CRM_INBOX_SETUP.sql (hat RLS Issues)
- ❌ CRM_SESSIONS_SETUP.sql (hat RLS Issues)

**BENUTZEN:**
- ✅ CRM_INBOX_SETUP_SAFE.sql
- ✅ CRM_SESSIONS_SETUP_SAFE.sql
- ✅ Alle anderen wie normal

---

## 🔍 VERIFY (nach jedem SQL-Run)

```sql
-- Kopiere und führe aus nach SCHRITT 1 & 2
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'crm%'
ORDER BY table_name;

-- Sollte diese Tabellen zeigen:
-- crm_chatter_emojis
-- crm_fan_messages
-- crm_fan_metadata
-- crm_model_sessions
-- crm_script_library
-- crm_session_audit_log
-- crm_vault_media
```

---

## 💾 DATEIEN

```
ROOT:
├── CRM_INBOX_SETUP_SAFE.sql (NEU - USE THIS!)
├── CRM_SESSIONS_SETUP_SAFE.sql (NEU - USE THIS!)
├── CRM_FAN_MESSAGES_EXTEND.sql (normal)
├── CRM_VAULT_MEDIA_EXTEND.sql (normal)
├── CRM_VAULT_STORAGE_POLICIES.sql (normal)
```

---

Versuche jetzt mit den SAFE Versionen! 🚀
