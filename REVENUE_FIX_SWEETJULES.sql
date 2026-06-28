-- ========================================
-- UMSATZ FÜR "sweetjules" MODEL HINZUFÜGEN
-- ========================================

-- 1️⃣ Stelle sicher, dass "sweetjules" Model existiert
INSERT INTO models (name) VALUES ('sweetjules')
ON CONFLICT DO NOTHING;

-- 2️⃣ Hole die sweetjules Model ID
WITH sweetjules_id AS (
  SELECT id FROM models WHERE name = 'sweetjules' LIMIT 1
)

-- 3️⃣ Update alle chatter_revenues, die keine model_id haben ODER zu gelöschten Models gehören
UPDATE chatter_revenues
SET model_id = (SELECT id FROM sweetjules_id)
WHERE model_id IS NULL OR model_id NOT IN (SELECT id FROM models);

-- FERTIG! Der Umsatz ist jetzt bei "sweetjules" ✅
