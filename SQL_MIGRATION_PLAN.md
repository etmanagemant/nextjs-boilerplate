## 🔴 KRITISCHE SQL-MIGRATIONEN (für Script Vault + Upload Vault + Message Sending)

### Priorität 1: FOUNDATION TABLES (MUSS ZUERST LAUFEN)
**Datei**: `CRM_INBOX_SETUP.sql`
**Inhalt**: 
- ✅ `crm_fan_messages` - Nachrichten zwischen Chatters & Fans
- ✅ `crm_fan_metadata` - Fan-Metadaten & Notizen
- ✅ `crm_vault_media` - ⭐ Uploaded Media für Upload Vault!
- ✅ RLS Policies für alle Tabellen
**Status**: ❓ UNBEKANNT - MUSS ÜBERPRÜFT WERDEN
**Dependencies**: KEINE

---

### Priorität 2: SCRIPT LIBRARY (muss nach Priorität 1 laufen)
**Datei**: `CRM_SESSIONS_SETUP.sql` ODER `CRM_SESSIONS_SETUP_STEPS.sql`
**Inhalt**:
- ✅ `crm_script_library` - Scripts mit Category, Global/Personal, Assignments
- ✅ `crm_model_sessions` - Model/OAuth Sessions
- ✅ RLS Policies für Scripts
**Status**: ❓ UNBEKANNT - MUSS ÜBERPRÜFT WERDEN
**Dependencies**: crm_fan_messages sollte existieren (Priorität 1)
**Note**: Es gibt 2 Versionen - STEPS ist Step-by-Step, die andere ist komplett

---

### Priorität 3: MESSAGE EXTENSION (muss nach Priorität 1 laufen)
**Datei**: `CRM_FAN_MESSAGES_EXTEND.sql`
**Inhalt**:
- ✅ `sent_to_platform` BOOLEAN - Track ob zu OnlyFans gesendet
- ✅ `external_message_id` TEXT - OnlyFans Message ID
- ✅ `updated_at` TIMESTAMP
- ✅ Indexes für Performance
**Status**: ❓ UNBEKANNT - MUSS ÜBERPRÜFT WERDEN
**Dependencies**: crm_fan_messages muss existieren (Priorität 1)

---

### Priorität 4: STORAGE SETUP
**Datei**: `STORAGE_POLICIES.sql`
**Inhalt**:
- ❓ Policies für 'reddit_content' Bucket (nicht 'crm-vault-media'!)
**Status**: ⚠️ WARNUNG - Policies sind für FALSCHEN Bucket!
**What we need**: Policies für 'crm-vault-media' Bucket statt 'reddit_content'

---

## 🟡 OPTIONAL DATEIEN (für komplette Setup, aber nicht kritisch)

| Datei | Zweck | Kritisch? |
|-------|--------|----------|
| ABANDONED_LEADS_SETUP.sql | Abandoned Leads Tracking | Nein |
| ADD_NOTES_COLUMN.sql | Extra Notes Column | Nein |
| ADD_PRIVATE_SHOW_COLUMNS.sql | Private Show Tracking | Nein |
| ADMIN_CHATTER_SEPARATION.sql | Admin Role Separation | Möglich |
| CHATTER_REVENUES_MIGRATION.sql | Revenue Tracking | Nein |
| CONTENT_PLAN_SETUP_*.sql | Content Planning (verschiedene Versionen) | Nein |
| FAN_MODEL_ASSOCIATION.sql | Fan-Model Links | Nein |
| MODERATOR_COMPLETE_MIGRATION.sql | Moderator System | Nein |
| MODERATOR_*_MIGRATION.sql | Moderator Platform Integration | Nein |
| ONLYFANS_SYNC_MIGRATION.sql | OnlyFans Sync | Nein |
| PROFILE_MIGRATION_FIX_AUTH_USERS.sql | Auth User Fixes | Möglich |
| REVENUE_FIX_SWEETJULES.sql | Revenue Bug Fix | Nein |
| SETUP_MODERATOR_SYSTEM.sql | Moderator System Complete | Nein |

---

## 🎯 RECOMMENDED EXECUTION ORDER

```
1. CRM_INBOX_SETUP.sql (Alle 3 Foundation Tables)
   ↓
2. CRM_SESSIONS_SETUP.sql (Script Library + Model Sessions)
   ↓
3. CRM_FAN_MESSAGES_EXTEND.sql (Add sent_to_platform columns)
   ↓
4. Create/Update STORAGE_POLICIES.sql (für 'crm-vault-media' Bucket)
```

---

## ✅ NEXT STEPS

1. Überprüfe ob CRM_INBOX_SETUP.sql bereits ausgeführt wurde
2. Überprüfe ob CRM_SESSIONS_SETUP.sql bereits ausgeführt wurde
3. Überprüfe ob CRM_FAN_MESSAGES_EXTEND.sql bereits ausgeführt wurde
4. Erstelle 'crm-vault-media' Storage Bucket in Supabase
5. Führe Storage Policies für 'crm-vault-media' aus
6. End-to-End Tests durchführen
