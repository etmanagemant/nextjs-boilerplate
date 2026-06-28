# 🚀 Content-Plan Setup Checkliste

Dieses Dokument hilft dir, die neue Content-Plan-Komponente schnell zum Laufen zu bringen.

---

## ✅ Schritt-für-Schritt Anleitung

### Phase 1: Datenbank vorbereiten

- [ ] Öffne die Supabase Console: https://supabase.com/dashboard/project/{YOUR_PROJECT_ID}/sql/new
- [ ] Kopiere den gesamten SQL-Code aus `CONTENT_PLAN_SETUP.sql`
- [ ] Füge ihn in die SQL Editor ein
- [ ] Klicke "Run" und warte auf erfolgreiche Ausführung
- [ ] Du solltest diese Tabellen sehen:
  - [ ] `content_communities` (mit 3 Test-Einträgen)
  - [ ] `content_plan_posts` (leer, für deine Posts)

### Phase 2: Storage Bucket einrichten

- [ ] Gehe zu: https://supabase.com/dashboard/project/{YOUR_PROJECT_ID}/storage/buckets
- [ ] Klicke "New Bucket"
- [ ] Trage diese Einstellungen ein:
  - Name: `reddit_content`
  - Public: **JA** (mit Haken!)
  - File size limit: `10 MB` (oder mehr)
- [ ] Klicke "Create Bucket"
- [ ] Der neue Bucket sollte jetzt in der Liste sichtbar sein

### Phase 3: Content-Plan Seite testen

- [ ] Starte deine App: `npm run dev`
- [ ] Melde dich als Admin an
- [ ] Du solltest den neuen "📅 Content-Plan" Button im Header sehen
- [ ] Klicke auf den Button → Du gelangst zur `/content-plan` Seite
- [ ] Die Seite zeigt die Model-Auswahl

### Phase 4: Bilder hochladen (optional für Tests)

- [ ] Gehe zu Storage → `reddit_content` Bucket
- [ ] Klicke "Upload"
- [ ] Wähle 2-3 Test-Bilder aus
- [ ] Merke dir die exakten Dateinamen (z.B. `photo-1.jpg`)

### Phase 5: Test-Post erstellen (optional)

1. Öffne die Supabase Console → SQL Editor
2. Führe diesen SQL aus (ersetze `{MODEL_ID}` mit einer echten Model-ID):

```sql
-- Erst alle Models anschauen:
SELECT id, name FROM models;

-- Dann einen Test-Post erstellen:
INSERT INTO content_plan_posts (
  model_id,
  photo_path,
  post_date,
  content_type,
  title_idea,
  published,
  sort_order
) VALUES (
  '{MODEL_ID_HIER}',
  'photo-1.jpg',
  '2025-02-15',
  'photo',
  'Test Title Ideas',
  false,
  1
);
```

3. Die Seite neuladen → Das neue Foto sollte sichtbar sein!

---

## 🎯 Features schnell testen

### Model-Wechsel
- [ ] Klicke auf verschiedene Model-Buttons oben
- [ ] Die Posts ändern sich entsprechend

### Communities verwalten
- [ ] Scrolle zur "📌 Community-Manager" Sektion
- [ ] Gib einen neuen Reddit-Namen ein (z.B. `r/photography`)
- [ ] Klicke "Hinzufügen"
- [ ] Die neue Community sollte in der Liste erscheinen

### Post bearbeiten
- [ ] Hover über ein Foto
- [ ] Klicke "✏️ Bearbeiten"
- [ ] Änderungen vornehmen:
  - [ ] Datum setzen
  - [ ] Content-Typ auswählen
  - [ ] Titel eingeben
  - [ ] Communities auswählen (Checkboxen)
  - [ ] "Veröffentlicht" Checkbox setzen (optional)
- [ ] Klicke "✓ Speichern"
- [ ] Die Änderungen sollten sofort sichtbar sein

### Drag-and-Drop testen
- [ ] Höre auf die Seite mit mehreren Posts
- [ ] Nimm ein Foto und ziehe es zu einer anderen Position
- [ ] Beim Loslassen wird die Reihenfolge aktualisiert
- [ ] Die Reihenfolge bleibt nach Neu-Laden erhalten

### Post löschen
- [ ] Hover über ein Foto
- [ ] Klicke "✏️ Bearbeiten" (oder "🗑️ Löschen")
- [ ] Klicke "🗑️ Löschen"
- [ ] Bestätige die Bestätigung
- [ ] Der Post ist weg

---

## 🔧 Umgebungsvariablen überprüfen

Stelle sicher, dass diese Variablen in deiner `.env.local` gesetzt sind:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Ohne diese funktioniert die Bilder-Anzeige nicht!

---

## ⚠️ Häufige Probleme

### Problem: Bilder werden nicht angezeigt
**Lösung:**
- Überprüfe, ob der Bucket `reddit_content` öffentlich ist
- Überprüfe, ob der Dateiname in der DB genau mit dem im Storage übereinstimmt
- Öffne die Browser-Console (F12) und schau auf Netzwerk-Fehler

### Problem: Model-Dropdown ist leer
**Lösung:**
- Überprüfe, ob Models im Management hinzugefügt wurden
- Führe SQL aus: `SELECT * FROM models;` um zu prüfen

### Problem: Drag-and-Drop funktioniert nicht
**Lösung:**
- Verwende einen modernen Browser (Chrome, Firefox, Safari)
- Aktiviere JavaScript
- Schau in der Browser-Console auf Fehler

### Problem: Communities ändern sich nicht
**Lösung:**
- Überprüfe, ob die DB-Operationen erfolgreich waren (Console schauen)
- Überprüfe, ob die `content_communities` Tabelle existiert

---

## 📞 Support & Debug

Falls es Probleme gibt:

1. **Browser-Console öffnen** (F12 → Console)
   - Schau nach roten Fehler-Meldungen
   
2. **Supabase Logs überprüfen**
   - https://supabase.com/dashboard/project/{PROJECT_ID}/logs/
   
3. **Network-Tab überprüfen** (F12 → Network)
   - Klicke auf die POST-Requests zu Supabase
   - Schau auf die Response

4. **Direkter DB-Check**
   - Gehe zu Supabase Console → Table Editor
   - Schau, ob deine Daten dort ankommen

---

## ✨ Häufig verwendete Befehle

```bash
# App starten
npm run dev

# Build testen
npm run build

# TypeScript überprüfen
npx tsc --noEmit

# ESLint überprüfen
npm run lint
```

---

## 📋 Nach dem Setup

- [ ] Alle Features durchgetestet
- [ ] Bilder richtig angezeigt
- [ ] Drag-and-Drop funktioniert
- [ ] Communities lassen sich verwalten
- [ ] Header zeigt den neuen Button
- [ ] Bestehende Seiten funktionieren noch

---

**Status**: Ready to go! 🚀

Viel Erfolg mit deinem neuen Content-Plan!
