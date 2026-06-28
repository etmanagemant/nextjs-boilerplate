-- ========================================
-- STORAGE POLICIES - reddit_content Bucket
-- ========================================
-- Kopiere alles hier rein und klick RUN!
-- ========================================

-- 1️⃣ STORAGE POLICIES
-- Policy für LESEN
CREATE POLICY "Public Read" ON storage.objects
FOR SELECT
USING (bucket_id = 'reddit_content');

-- Policy für UPLOAD
CREATE POLICY "Public Upload" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'reddit_content');

-- Policy für DELETE
CREATE POLICY "Public Delete" ON storage.objects
FOR DELETE
USING (bucket_id = 'reddit_content');

-- Policy für UPDATE
CREATE POLICY "Public Update" ON storage.objects
FOR UPDATE
USING (bucket_id = 'reddit_content')
WITH CHECK (bucket_id = 'reddit_content');

-- ========================================
-- 2️⃣ TEST DATEN - Posts mit Bildern
-- ========================================

-- Hole die Model ID von Model 1 (für die Test-Posts)
WITH model_data AS (
  SELECT id FROM models WHERE name = 'Model 1' LIMIT 1
)

INSERT INTO content_plan_posts (
  model_id,
  photo_path,
  post_date,
  content_type,
  title_idea,
  published,
  communities,
  sort_order
)
SELECT
  m.id,
  'test-image-1.jpg'::text,
  CURRENT_DATE + INTERVAL '1 day',
  'Image',
  'Cooles Reddit Bild #1',
  false,
  ARRAY['r/reddit1', 'r/reddit2']::text[],
  1
FROM model_data m

UNION ALL

SELECT
  m.id,
  'test-image-2.jpg'::text,
  CURRENT_DATE + INTERVAL '2 days',
  'Image',
  'Cooles Reddit Bild #2',
  false,
  ARRAY['r/reddit3']::text[],
  2
FROM model_data m

UNION ALL

SELECT
  m.id,
  'test-image-3.jpg'::text,
  CURRENT_DATE + INTERVAL '3 days',
  'Video',
  'Lustiges Video Post',
  true,
  ARRAY['r/reddit1']::text[],
  3
FROM model_data m

ON CONFLICT DO NOTHING;
