-- ========================================
-- CONTENT PLAN SETUP - OHNE ALTEN DATA ZU LÖSCHEN
-- ========================================
-- Nutze "Run without RLS"!
-- ========================================

-- 1️⃣ Nur neue Tabellen erstellen (alte nicht löschen!)
CREATE TABLE IF NOT EXISTS content_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- 2️⃣ GRANT ACCESS
GRANT ALL ON content_communities TO PUBLIC;
GRANT ALL ON content_plan_posts TO PUBLIC;
GRANT ALL ON content_communities TO authenticated;
GRANT ALL ON content_plan_posts TO authenticated;

-- 3️⃣ Communities hinzufügen (falls noch nicht da)
INSERT INTO content_communities (name) VALUES
  ('r/reddit1'),
  ('r/reddit2'),
  ('r/reddit3')
ON CONFLICT DO NOTHING;

-- FERTIG! Deine alten Models bleiben erhalten! ✅
