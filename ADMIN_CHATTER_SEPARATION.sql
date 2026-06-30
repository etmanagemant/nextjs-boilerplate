-- ========================================
-- ADMIN-CHATTER SEPARATION
-- ========================================
-- Problem: Wenn Admin selbst Chatter ist, werden seine Revenues 
-- mit unzugeordneten Tips vermischt
-- Lösung: Neue Spalte um zu markieren, ob Revenue zugeordnet ist
--
-- ========================================

-- 1️⃣ Neue Spalte zur Markierung von zugeordneten vs. unzugeordneten Revenues
ALTER TABLE chatter_revenues
ADD COLUMN IF NOT EXISTS assigned_to_chatter BOOLEAN DEFAULT TRUE;

-- Index für schnellere Abfragen
CREATE INDEX IF NOT EXISTS idx_chatter_revenues_assigned ON chatter_revenues(assigned_to_chatter);

-- 2️⃣ INITIAL: Alle vorhandenen Revenues mit zugeordnetem Chatter = TRUE
-- (Diese waren bereits verdient/zugeordnet)
UPDATE chatter_revenues 
SET assigned_to_chatter = TRUE 
WHERE assigned_to_chatter IS NULL;

-- 3️⃣ OPTIONAL: Markiere spezifische Tips als "unzugeordnet" 
-- Nur Admin-ID mit NULL model_id sollten unzugeordnet sein:
-- UPDATE chatter_revenues 
-- SET assigned_to_chatter = FALSE
-- WHERE user_id = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'
--   AND model_id IS NULL
--   AND assigned_to_chatter = TRUE;

-- ✅ VERIFIKATION
SELECT 
  user_id,
  model_id,
  assigned_to_chatter,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM chatter_revenues
GROUP BY user_id, model_id, assigned_to_chatter
ORDER BY assigned_to_chatter, user_id;
