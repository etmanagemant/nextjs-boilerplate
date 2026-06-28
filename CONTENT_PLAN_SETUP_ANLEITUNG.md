# 🚀 Content-Plan Datenbank Setup - Step by Step

**Deine Project ID:** `qzveuqjjhdqcazhfccjp`

---

## ⚡ QUICK START (5 Minuten)

### Schritt 1️⃣: SQL ausführen

1. Öffne diesen Link: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/sql/new
2. **KOPIERE den kompletten SQL Code** aus `CONTENT_PLAN_SETUP_WORKING.sql`
3. Füge ihn in die SQL Editor ein
4. Klick den **grünen RUN Button** oben rechts
5. Warte bis "Success" kommt

### Schritt 2️⃣: Storage Bucket erstellen

1. Gehe zu: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/storage/buckets
2. Klick **"New Bucket"** oben
3. Gib diesen Namen ein: `reddit_content`
4. **WICHTIG:** Setz den Haken bei **"Public"** ✅
5. Klick **"Create Bucket"**

### Schritt 3️⃣: Fertig! 🎉

Jetzt kannst du die **Content-Plan Seite** öffnen und:
- ✅ Bilder hochladen
- ✅ Communities verwalten
- ✅ Posts bearbeiten
- ✅ Drag-and-Drop funktioniert

---

## ❓ Was wurde erstellt?

| Tabelle | Beschreibung |
|---------|-------------|
| `content_communities` | Speichert deine Communities/Subreddits (r/test1, r/test2, etc.) |
| `content_plan_posts` | Speichert deine Posts mit Bildern, Daten, Titeln, etc. |
| **Storage Bucket** | `reddit_content` - Speichert deine Bilder |

---

## 🐛 Falls was nicht funktioniert

### Problem: "Can't find CONTENT_PLAN_SETUP_WORKING.sql"
**Lösung:** 
- Öffne VS Code
- Navigiere zu: `c:\Users\smoke\Documents\GitHub\nextjs-boilerplate`
- Öffne die Datei `CONTENT_PLAN_SETUP_WORKING.sql`
- Kopiere den Code von dort

### Problem: SQL gibt Fehler aus
**Lösung:**
- Stell sicher, dass du den **kompletten Code** kopiert hast
- Lösche den Code aus dem Editor
- Füge ihn neu ein
- Klick RUN nochmal

### Problem: Bucket erstellen funktioniert nicht
**Lösung:**
- Gehe zu https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/storage/buckets
- Prüfe ob `reddit_content` Bucket schon existiert
- Wenn ja: Prüfe dass "Public" Haken gesetzt ist

---

## ✅ Verification Checklist

Nach dem Setup prüfe folgendes:

- [ ] Datenbank-Tabelle `content_communities` existiert
- [ ] Datenbank-Tabelle `content_plan_posts` existiert  
- [ ] Storage Bucket `reddit_content` existiert
- [ ] Storage Bucket ist auf "Public" gesetzt
- [ ] Du kanst die Content-Plan Seite öffnen
- [ ] Der "Bilder hochladen" Bereich funktioniert

---

## 🔗 Wichtige Links

- Dein Supabase Dashboard: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp
- SQL Editor: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/sql
- Storage: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/storage/buckets

---

**Viel Erfolg! 🚀**
Wenn noch was nicht funktioniert, sag mir Bescheid!
