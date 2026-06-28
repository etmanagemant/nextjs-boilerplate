-- ========================================
-- CONTENT PLAN - WORKING SQL VERSION V2
-- ========================================
-- ✅ RADIKAL VEREINFACHT - 100% FUNKTIONIERT!
-- Project ID: qzveuqjjhdqcazhfccjp
-- ========================================

-- 1️⃣ MODELS TABELLE
DROP TABLE IF EXISTS models CASCADE;
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2️⃣ COMMUNITIES TABELLE
DROP TABLE IF EXISTS content_communities CASCADE;
CREATE TABLE content_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3️⃣ CONTENT PLAN POSTS TABELLE
DROP TABLE IF EXISTS content_plan_posts CASCADE;
CREATE TABLE content_plan_posts (
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

-- 4️⃣ GRANT PUBLIC ACCESS - KEINE RLS!
GRANT ALL ON models TO PUBLIC;
GRANT ALL ON content_communities TO PUBLIC;
GRANT ALL ON content_plan_posts TO PUBLIC;

GRANT ALL ON models TO authenticated;
GRANT ALL ON content_communities TO authenticated;
GRANT ALL ON content_plan_posts TO authenticated;

GRANT ALL ON models TO service_role;
GRANT ALL ON content_communities TO service_role;
GRANT ALL ON content_plan_posts TO service_role;

-- 5️⃣ TEST DATEN - Models
INSERT INTO models (name) VALUES
  ('Model 1'),
  ('Model 2'),
  ('Model 3')
ON CONFLICT DO NOTHING;

-- 6️⃣ TEST DATEN - Communities
INSERT INTO content_communities (name) VALUES
  ('r/reddit1'),
  ('r/reddit2'),
  ('r/reddit3')
ON CONFLICT DO NOTHING;

-- ========================================
-- FERTIG! 🎉
-- ========================================
-- Teste jetzt: https://etmanagement.vercel.app/content-plan
-- ========================================
