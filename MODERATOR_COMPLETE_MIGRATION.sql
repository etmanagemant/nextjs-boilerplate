-- 🎯 KOMPLETTE MODERATOR-SYSTEM MIGRATION
-- Alle neuen Spalten + Indexes für Stundenhonorar + Prämien-System

-- ✅ 1. PROFILES: Stundenhonorar für Moderatoren
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2) DEFAULT 0;
COMMENT ON COLUMN profiles.hourly_rate IS 'Stundenhonorar für Moderatoren (EUR/h)';

-- ✅ 2. SHIFT_ASSIGNMENTS: Private-Show Tracking
ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS privateshow_count INTEGER DEFAULT 0;
COMMENT ON COLUMN shift_assignments.privateshow_count IS 'Anzahl Private Shows (nur >= 5 Min zählen) für Prämien-Berechnung';

-- ✅ 3. INDEXES für Performance
CREATE INDEX IF NOT EXISTS idx_profiles_hourly_rate ON profiles(hourly_rate);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_privateshow_count ON shift_assignments(privateshow_count);

-- ✅ 4. VERIFIKATION: Neue Spalten überprüfen
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name IN ('profiles', 'shift_assignments')
AND column_name IN ('hourly_rate', 'privateshow_count')
ORDER BY table_name, ordinal_position;

-- 🎁 PRÄMIEN-SYSTEM REFERENZ (implementiert in App):
-- Private Shows müssen mindestens 5 Minuten lang sein um zu zählen
-- 15 Shows = 30€ Extra
-- 20 Shows = 50€ Extra
-- 25 Shows = 70€ Extra
-- Berechnung: (Stunden × Stundenhonorar) + Prämie

-- 🎬 MODERATOR SETUP BEISPIEL:
-- UPDATE profiles SET hourly_rate = 18.50 WHERE user_id = 'MODERATOR_USER_ID' AND role = 'moderator';
