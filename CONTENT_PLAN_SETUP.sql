-- ========================================
-- CONTENT PLAN SETUP SQL
-- ========================================
-- 
-- Diese SQL-Statements erstellen die notwendigen Tabellen für die 
-- Content-Plan-Komponente. Bitte führe sie in der Supabase Console aus:
-- https://supabase.com/dashboard/project/{YOUR_PROJECT_ID}/sql/new
--
-- ========================================

-- 1. CONTENT COMMUNITIES TABLE
-- Speichert alle verfügbaren Communities/Subreddits
CREATE TABLE IF NOT EXISTS content_communities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. CONTENT PLAN POSTS TABLE
-- Speichert die einzelnen Posts mit allen Metadaten
CREATE TABLE IF NOT EXISTS content_plan_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  photo_path VARCHAR(255) NOT NULL, -- Pfad zum Bild im Supabase Storage (reddit_content Bucket)
  post_date DATE,
  content_type VARCHAR(50), -- 'photo', 'video', 'story', 'carousel'
  title_idea TEXT,
  published BOOLEAN DEFAULT FALSE,
  communities UUID[] DEFAULT ARRAY[]::UUID[], -- Array von Community-IDs
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. INDEXES für bessere Performance
CREATE INDEX idx_content_plan_posts_model_id ON content_plan_posts(model_id);
CREATE INDEX idx_content_plan_posts_sort_order ON content_plan_posts(sort_order);

-- 4. OPTIONAL: RLS (Row Level Security) für Sicherheit
-- Dies erlaubt nur Admins, Content-Plan-Daten zu bearbeiten
ALTER TABLE content_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_plan_posts ENABLE ROW LEVEL SECURITY;

-- 5. OPTIONAL: Storage Bucket (führe dies über die Supabase UI durch)
-- 
-- Gehe zu: https://supabase.com/dashboard/project/{qzveuqjjhdqcazhfccjp}/storage/buckets
-- 
-- Erstelle einen neuen Bucket mit diesen Einstellungen:
-- - Name: reddit_content
-- - Public: JA (damit die Bilder im Frontend angezeigt werden)
-- - File size limit: 10 MB (oder nach Bedarf)
-- 
-- RLS Policy für Storage Bucket (optional, für zusätzliche Sicherheit):
-- 
-- SELECT (auth.role() = 'authenticated')
-- INSERT (auth.role() = 'authenticated')
-- UPDATE (auth.role() = 'authenticated')
-- DELETE (auth.role() = 'authenticated')

-- ========================================
-- TESTEN: Hinzufügen von Test-Daten
-- ========================================

-- Beispiel Communities hinzufügen:
INSERT INTO content_communities (name) VALUES
  ('r/example1'),
  ('r/example2'),
  ('r/example3')
ON CONFLICT (name) DO NOTHING;

-- ========================================
-- FERTIG!
-- ========================================
-- 
-- Nach dem Ausführen dieser Statements sollte die App funktionieren.
-- Falls noch eine "models" Tabelle fehlt, verwende diesen SQL:
--
-- CREATE TABLE IF NOT EXISTS models (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   name VARCHAR(255) NOT NULL UNIQUE,
--   created_at TIMESTAMP DEFAULT NOW()
-- );
--
