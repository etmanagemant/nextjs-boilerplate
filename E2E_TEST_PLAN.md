## 🧪 END-TO-END TEST PLAN

### Phase 1: DB-Schema Überprüfung
- [ ] Tabelle `crm_fan_messages` existiert
- [ ] Tabelle `crm_fan_metadata` existiert
- [ ] Tabelle `crm_vault_media` existiert
- [ ] Tabelle `crm_script_library` existiert
- [ ] Spalte `sent_to_platform` in crm_fan_messages existiert
- [ ] Spalte `external_message_id` in crm_fan_messages existiert
- [ ] RLS Policies sind aktiviert

### Phase 2: Supabase Storage Setup
- [ ] Bucket 'crm-vault-media' existiert in Supabase Storage
- [ ] RLS Policies für 'crm-vault-media' Bucket sind konfiguriert
- [ ] Chatter kann Dateien zum Bucket hochladen

### Phase 3: Script Vault Tests
**Precondition**: Admin muss eingeloggt sein

Test 1: Global Script erstellen
```
1. Navigiere zu /script-vault
2. Klick "New Script"
3. Fülle aus:
   - Title: "Test Global Script"
   - Content: "Hello {{fan_name}}, test message!"
   - Category: "greeting"
   - Global: ☑ (checked)
4. Klick "Save"
✅ Expected: Script wird in DB gespeichert und zeigt in der Liste
```

Test 2: Personal Script erstellen
```
1. In Script Vault: "New Script"
2. Fülle aus:
   - Title: "Test Personal Script"
   - Content: "Personal script content"
   - Category: "offer"
   - Global: ☐ (unchecked)
3. Klick "Save"
✅ Expected: Script wird nur für diesen Chatter angezeigt
```

Test 3: Script editieren
```
1. In Script Vault: Klick auf existierendes Script
2. Ändere Title zu "Updated Script Title"
3. Klick "Save"
✅ Expected: Änderung wird in DB aktualisiert
```

Test 4: Script löschen
```
1. In Script Vault: Klick "Delete" auf existierendes Script
2. Bestätige Löschen
✅ Expected: Script wird aus DB und UI entfernt
```

### Phase 4: Upload Vault Tests
**Precondition**: Chatter muss eingeloggt sein

Test 1: Datei hochladen
```
1. Navigiere zu /upload-vault
2. Drag-and-drop oder wähle: test.jpg (< 10MB)
3. Warte auf Upload-Bestätigung
✅ Expected: 
   - Datei zeigt in der Media-Liste
   - Datei ist in Supabase Storage gespeichert
   - DB-Eintrag in crm_vault_media existiert
```

Test 2: Video hochladen
```
1. Upload-Vault: Upload test.mp4
✅ Expected:
   - Video mit Play-Icon angezeigt
   - Type "video" in Datenbank
```

Test 3: Datei filtern
```
1. Upload-Vault: Klick "Images" Filter
✅ Expected: Nur Images angezeigt, nicht Videos
```

Test 4: Link kopieren
```
1. Upload-Vault: Hover über Media-Item
2. Klick "Copy Link"
✅ Expected: Link ist in Clipboard (Benachrichtigung angezeigt)
```

Test 5: Datei löschen
```
1. Upload-Vault: Hover über Media-Item
2. Klick "Delete"
3. Bestätige Löschen
✅ Expected:
   - Datei entfernt aus UI
   - Datei gelöscht von Supabase Storage
   - DB-Eintrag gelöscht
```

### Phase 5: Message Sending Tests
**Precondition**: Model muss mit OnlyFans verbunden sein (crm_model_sessions mit auth_cookies)

Test 1: Nachricht lokal speichern
```
1. Navigiere zu /crm-inbox
2. Wähle Fan aus
3. Typ Nachricht: "Test message from CRM"
4. Klick "Send"
✅ Expected:
   - Nachricht zeigt sofort im Chat (optimistic UI)
   - Eintrag in crm_fan_messages mit sender="chatter"
   - sent_to_platform = false (initial)
```

Test 2: Nachricht zu OnlyFans senden
```
1. Nach 2-3 Sekunden sollte API im Background aufgerufen werden
✅ Expected:
   - sent_to_platform wird auf true gesetzt
   - external_message_id wird gefüllt (wenn erfolg)
   - Nachricht erscheint im OnlyFans-Chat (prüfe manuell bei OnlyFans)
```

Test 3: Fehlerbehandlung
```
1. Model ohne auth_cookies verbinden
2. Versuche Nachricht zu senden
✅ Expected:
   - Fehlerbehandlung greift
   - sent_to_platform bleibt false
   - Nachricht ist lokal noch sichtbar
```

### Phase 6: Integration Tests
Test 1: Script in Message benutzen
```
1. CRM Inbox öffnen
2. Wähle Global Script "Test Global Script" aus
3. Script-Text wird in Message-Input eingefügt
4. Klick "Send"
✅ Expected:
   - Script-Text wird als Nachricht gesendet
   - Nachricht speichert mit Script-Verweis
```

Test 2: Upload Vault in Message
```
1. CRM Inbox öffnen
2. Klick "Attach" → Upload Vault
3. Wähle Media-File aus
4. Message mit Attachment wird gesendet
✅ Expected:
   - attached_media_id wird in crm_fan_messages gespeichert
```

---

## 📋 CHECKLIST VOR TESTS

- [ ] Alle 3 KRITISCHEN SQL-Dateien wurden ausgeführt
- [ ] 'crm-vault-media' Bucket existiert in Supabase Storage
- [ ] .env.local hat Supabase-Keys konfiguriert
- [ ] App läuft lokal: `npm run dev`
- [ ] Admin/Chatter Accounts existieren in Auth
- [ ] Test Model existiert und hat auth_cookies
- [ ] Test Fan existiert in crm_fan_metadata

---

## 🚀 HOW TO RUN TESTS

1. **Lokal starten**:
   ```bash
   cd nextjs-boilerplate
   npm run dev
   ```

2. **Admin Test durchführen**:
   - Login als Admin
   - Navigiere zu /script-vault
   - Führe Script Vault Tests 1-4 durch

3. **Chatter Test durchführen**:
   - Login als Chatter
   - Navigiere zu /upload-vault
   - Führe Upload Vault Tests 1-5 durch
   - Navigiere zu /crm-inbox
   - Führe Message Sending Tests 1-3 durch

4. **OnlyFans Verification**:
   - Manuell bei OnlyFans überprüfen dass Nachricht angekommen ist

5. **Integration Tests**:
   - Führe Phase 6 Tests durch
