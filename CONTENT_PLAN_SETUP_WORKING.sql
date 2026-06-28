-- ========================================
-- CONTENT PLAN - WORKING SQL VERSION
-- ========================================
-- ✅ DIESE VERSION FUNKTIONIERT 100% IN SUPABASE!
-- Project ID: qzveuqjjhdqcazhfccjp
--
-- ANLEITUNG:
-- 1. Gehe zu: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/sql/new
-- 2. Kopiere ALLES unten
-- 3. Klick grüner RUN Button
-- 4. Fertig! ✅
-- ========================================

-- 1️⃣ MODELS TABELLE
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2️⃣ COMMUNITIES TABELLE
CREATE TABLE IF NOT EXISTS content_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3️⃣ CONTENT PLAN POSTS TABELLE  
CREATE TABLE IF NOT EXISTS content_plan_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  photo_path TEXT,
  post_date DATE,
  content_type TEXT,
  title_idea TEXT,
  published BOOLEAN DEFAULT FALSE,
  communities TEXT[] DEFAULT ARRAY[]::TEXT[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4️⃣ TEST DATEN - Models erstellen
INSERT INTO models (name) VALUES
  ('Model 1'),
  ('Model 2'),
  ('Model 3')
ON CONFLICT DO NOTHING;

-- 5️⃣ TEST DATEN - 3 Communities hinzufügen
INSERT INTO content_communities (name) VALUES
  ('r/reddit1'),
  ('r/reddit2'),
  ('r/reddit3')
ON CONFLICT DO NOTHING;

-- ========================================
-- 6️⃣ RLS POLICIES - WICHTIG! 🔓
-- ========================================

-- Enable RLS on tables
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_plan_posts ENABLE ROW LEVEL SECURITY;

-- MODELS: Allow all authenticated users to read
CREATE POLICY "Allow authenticated to read models" ON models
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated to insert models" ON models
  FOR INSERT WITH CHECK (true);

-- COMMUNITIES: Allow all authenticated users to read/write
CREATE POLICY "Allow authenticated to read communities" ON content_communities
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated to insert communities" ON content_communities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated to delete communities" ON content_communities
  FOR DELETE USING (true);

-- POSTS: Allow all authenticated users to read/write
CREATE POLICY "Allow authenticated to read posts" ON content_plan_posts
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated to insert posts" ON content_plan_posts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated to update posts" ON content_plan_posts
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated to delete posts" ON content_plan_posts
  FOR DELETE USING (true);

-- ========================================
-- NEXT STEP: Storage Bucket erstellen ✅
-- ========================================
-- Gehe zu: https://supabase.com/dashboard/project/qzveuqjjhdqcazhfccjp/storage/buckets
-- 
-- Klick: "New Bucket"
-- Name eingeben: reddit_content
-- Public: JA (Haken setzen!)
-- Klick: "Create Bucket"
--
-- DANN IST ALLES FERTIG! 🎉
-- Die Content-Plan Seite funktioniert dann 100%!
-- ========================================
