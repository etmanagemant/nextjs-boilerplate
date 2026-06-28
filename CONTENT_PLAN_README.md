# 📅 Content-Plan Komponente - Setup & Feature Guide

## ✨ Übersicht

Die neue **Content-Plan**-Komponente digitalisiert deinen Excel-Content-Plan mit einem visuellen Explorer-Interface ähnlich wie Trello. Sie ist Admin-Only und bietet umfangreiche Content-Management-Funktionen.

---

## 🎯 Features

### 1. **Model-Wechsel** 
- Dropdown-Menü oben auf der Seite
- Alle Models aus der `models`-Tabelle werden automatisch geladen
- Nur der Content-Plan des ausgewählten Models wird angezeigt
- URL-Parameter: `?model={model_id}` für direkte Verknüpfung

### 2. **Visueller Explorer**
- Grid-Layout mit Bildern aus dem Supabase Storage Bucket `reddit_content`
- Automatische Anzeige aller hochgeladenen Fotos als Kacheln
- Echte Dateinamen (keine anonymen Namen)
- Hover-Effekte mit Bearbeitungs-Button

### 3. **Direkte Bearbeitung**
Jeder Post hat editierbare Felder:
- 📅 **Datum**: Datepicker
- 🎬 **Content-Typ**: Dropdown (photo/video/story/carousel)
- 📝 **Titel-Idee**: Text-Input
- ✅ **Veröffentlicht**: Checkbox für Publish-Status

### 4. **Multi-Select Communities**
- Dropdown mit allen Communities aus der `content_communities`-Tabelle
- **Mehrfachauswahl** möglich (Checkboxen für jede Community)
- Communities werden als Array (`communities[]`) in der DB gespeichert
- Live-Vorschau der ausgewählten Communities auf der Kachel

### 5. **Globaler Community-Manager**
Dedizierter Admin-Bereich auf der Seite:
- Textfeld zum Hinzufügen neuer Communities (Subreddits)
- Löschen von Communities per ✕-Button
- Neue Communities erscheinen sofort in allen Post-Dropdowns
- Sichere Duplikat-Verhinderung auf DB-Ebene

### 6. **Drag-and-Drop Reordering**
- **Native HTML5 Drag & Drop API** (keine externe Dependency)
- Post-Kacheln sind draggable
- Neue Reihenfolge wird per `sort_order`-Feld in der DB gespeichert
- Visuelle Feedback: Opacity-Änderung beim Drag
- Automatische Neu-Nummerierung beim Drop

---

## 🚀 Installation & Setup

### Schritt 1: Datenbank-Tabellen erstellen

Öffne die **Supabase SQL Editor**:
1. Gehe zu: https://supabase.com/dashboard/project/{PROJECT_ID}/sql/new
2. Kopiere den gesamten SQL-Code aus `CONTENT_PLAN_SETUP.sql`
3. Führe den SQL aus

Dies erstellt automatisch:
- `content_communities` Tabelle
- `content_plan_posts` Tabelle
- Indexes für Performance
- Test-Daten (3 Beispiel-Communities)

### Schritt 2: Storage Bucket einrichten

1. Gehe zu: https://supabase.com/dashboard/project/{PROJECT_ID}/storage/buckets
2. Klicke "New Bucket"
3. Konfiguriere:
   - **Name**: `reddit_content`
   - **Public**: JA (wichtig für Bilder-Anzeige!)
   - **File size limit**: 10 MB oder mehr nach Bedarf

### Schritt 3: Bilder hochladen

1. Im Supabase Dashboard, Storage → `reddit_content` Bucket
2. Klicke "Upload"
3. Wähle deine Fotos
4. Sie werden als PDF-Dateien mit realen Namen gespeichert

Beispiel-Struktur:
```
reddit_content/
  ├── marketing-photo-1.jpg
  ├── promotional-image.png
  └── campaign-content.jpg
```

### Schritt 4: Datenbank-Einträge manuell erstellen (optional)

Falls du Test-Posts erstellen möchtest, nutze die Supabase Console:

```sql
-- Beispiel: Einen Post hinzufügen
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
  'marketing-photo-1.jpg',
  '2025-02-01',
  'photo',
  'Amazing content title',
  false,
  1
);
```

---

## 📍 File Structure

```
app/
├── content-plan/
│   ├── page.tsx          # Server Component (Admin-Check, Seiten-Layout)
│   └── actions.ts        # Server Actions (DB-Operationen)
├── layout.tsx            # AKTUALISIERT mit Content-Plan Button
components/
└── layout/
    └── ContentPlanClient.tsx  # Client Component (Interaktivität)
CONTENT_PLAN_SETUP.sql   # Database Setup Script
CONTENT_PLAN_README.md   # Diese Datei
```

---

## 🔐 Authentifizierung & Admin-Check

Die Content-Plan-Seite ist **Admin-Only**:

```typescript
// Akzeptierte Admin-Wege:
1. user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" (Hardcoded ID)
2. user.email === "etmanagement@gmail.com"
3. profiles.role === "admin" (in der DB)
```

Nicht-Admins werden automatisch zu `/` umgeleitet.

---

## 🎨 Design & Styling

Die Komponente nutzt das bestehende Design-System:
- **Gold-Palette**: `#D4AF37`, `#AA7C11`, `#F3E5AB`
- **Dark Mode**: `#050505`, `#0A0A0A`
- **Tailwind CSS** für Styling
- **Responsive Grid**: 1 Spalte (Mobile) → 4 Spalten (Desktop)

Alle Styles folgen dem bestehenden Management/Buchhaltung Pattern.

---

## 🔗 Header-Integration

Der "📅 Content-Plan" Button wurde zum globalen Header hinzugefügt:

```typescript
// app/layout.tsx - nur für Admins sichtbar
{role === "admin" && (
  <a href="/content-plan" className="...">📅 Content-Plan</a>
)}
```

---

## 🛠️ API & Server Actions

Alle Operationen sind **Server-Side** implementiert (TypeScript, Supabase SDK):

### Models
```typescript
getModels()  // Lädt alle Models
```

### Communities
```typescript
getContentCommunities()              // Lädt alle Communities
addContentCommunity(formData)       // Neue Community hinzufügen
deleteContentCommunity(id)          // Community löschen
```

### Content Posts
```typescript
getContentPlanPosts(modelId)                    // Lädt Posts für Model
updateContentPlanPost(postId, updates)         // Editiert einen Post
updateContentPlanSort(sortUpdates)             // Speichert Drag-and-Drop Reihenfolge
deleteContentPlanPost(postId)                  // Löscht einen Post
createContentPlanPost(formData)                // Erstellt neuen Post
```

---

## 📊 Datenbank-Schema

### `models` (bereits vorhanden)
```sql
id UUID PRIMARY KEY
name VARCHAR(255)
created_at TIMESTAMP
```

### `content_communities` (neu)
```sql
id UUID PRIMARY KEY
name VARCHAR(255) UNIQUE
created_at TIMESTAMP
```

### `content_plan_posts` (neu)
```sql
id UUID PRIMARY KEY
model_id UUID REFERENCES models(id)
photo_path VARCHAR(255)           -- Path im Storage
post_date DATE
content_type VARCHAR(50)          -- photo|video|story|carousel
title_idea TEXT
published BOOLEAN DEFAULT FALSE
communities UUID[] DEFAULT ARRAY[]::UUID[]
sort_order INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## 🎯 Verwendungsbeispiel

1. **Admin öffnet Content-Plan**: `/content-plan`
2. **Model auswählen**: Klick auf einen Model-Button oben
3. **Communities verwalten**: Im "Community-Manager" neue Subreddits hinzufügen
4. **Post bearbeiten**: Hover über ein Foto → "✏️ Bearbeiten" klicken
5. **Communities wählen**: Checkboxen für Communities setzen
6. **Speichern**: "✓ Speichern" Button
7. **Reihenfolge ändern**: Post-Kachel ziehen & droppen
8. **Post löschen**: "🗑️ Löschen" Button

---

## ⚠️ Wichtige Hinweise

- ✅ **Bestehende Funktionen**: 100% erhalten, nichts verändert
- ✅ **Keine neuen Dependencies**: Nur native React + HTML5 Drag & Drop
- ✅ **TypeScript**: Vollständig typsicher
- ✅ **Server Actions**: Sichere Datenbank-Operationen
- ⚠️ **Storage Bucket**: Muss öffentlich sein für Bilder-Anzeige!
- ⚠️ **Communities Array**: Gespeichert als UUID[], nicht Strings!

---

## 🐛 Troubleshooting

### Bilder werden nicht angezeigt
- ✓ Storage Bucket `reddit_content` existiert?
- ✓ Bucket ist auf "Public" gesetzt?
- ✓ Bilder wurden hochgeladen?
- ✓ Pfad in DB stimmt mit Storage-Pfad überein?

### Models erscheinen nicht
- ✓ Models in der `models` Tabelle?
- ✓ SQL-Script vollständig ausgeführt?

### Drag-and-Drop funktioniert nicht
- ✓ JavaScript aktiviert?
- ✓ Browser unterstützt HTML5 Drag & Drop?

### Communities-Changes speichern sich nicht
- ✓ Ist der Nutzer Admin?
- ✓ Fehler in der Browser-Console?

---

## 📝 Weitere Entwicklung

Mögliche zukünftige Features:
- 📷 Bilder direkt in der App hochladen
- 📅 Calendar-View statt Grid-View
- 📊 Analytics & Posting-Planung
- 🔄 Automation & Scheduled Posts
- 💬 Comments & Feedback im Post

---

**Version**: 1.0.0  
**Letzte Aktualisierung**: 2025-01-28  
**Autor**: GitHub Copilot
