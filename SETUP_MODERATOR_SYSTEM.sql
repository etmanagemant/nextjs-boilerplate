-- 🎯 KOMPLETTE MODERATOR-SYSTEM MIGRATION - READY TO COPY PASTE
-- Führe alle Queries in deiner Supabase Console aus (SQL Editor)
-- Die Reihenfolge ist wichtig!

-- ============================================
-- ✅ SCHRITT 1: PROFILES TABELLE
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'chatter';

CREATE INDEX IF NOT EXISTS idx_profiles_hourly_rate ON profiles(hourly_rate);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================
-- ✅ SCHRITT 2: SHIFT_ASSIGNMENTS TABELLE
-- ============================================

ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS privateshow_count INTEGER DEFAULT 0;

ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS privateshow_total_hours DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS stripchat_lifetime_start DECIMAL(15, 2) DEFAULT 0;

ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS stripchat_lifetime_end DECIMAL(15, 2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_privateshow_count ON shift_assignments(privateshow_count);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_privateshow_hours ON shift_assignments(privateshow_total_hours);

-- ============================================
-- ✅ SCHRITT 3: MODELS TABELLE
-- ============================================

ALTER TABLE models
ADD COLUMN IF NOT EXISTS platform_type VARCHAR(50) DEFAULT 'onlyfans';

CREATE INDEX IF NOT EXISTS idx_models_platform_type ON models(platform_type);

-- ============================================
-- ✅ SCHRITT 4: CHATTER_REVENUES TABELLE
-- ============================================

ALTER TABLE chatter_revenues
ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'onlyfans';

CREATE INDEX IF NOT EXISTS idx_chatter_revenues_platform ON chatter_revenues(platform);

-- ============================================
-- ✅ VERIFIKATION - Alle Spalten überprüfen
-- ============================================

SELECT 
  table_name,
  column_name,
  data_type 
FROM information_schema.columns 
WHERE table_name IN ('profiles', 'shift_assignments', 'models', 'chatter_revenues')
AND column_name IN (
  'hourly_rate', 'role', 
  'privateshow_count', 'privateshow_total_hours', 
  'stripchat_lifetime_start', 'stripchat_lifetime_end',
  'platform_type', 'platform'
)
ORDER BY table_name, ordinal_position;

-- ============================================
-- 📋 WHAT WAS ADDED (REFERENZ)
-- ============================================
--
-- PROFILES:
--   ✅ hourly_rate (DECIMAL) - Stundenhonorar für Moderatoren (EUR/h)
--   ✅ role (VARCHAR) - chatter / moderator / admin
--
-- SHIFT_ASSIGNMENTS:
--   ✅ privateshow_count (INTEGER) - Anzahl Private Shows (nur >= 5 Min)
--   ✅ privateshow_total_hours (DECIMAL) - Gesamtdauer Private Shows
--   ✅ stripchat_lifetime_start (DECIMAL) - Stripchat Earning Start
--   ✅ stripchat_lifetime_end (DECIMAL) - Stripchat Earning End
--
-- MODELS:
--   ✅ platform_type (VARCHAR) - 'onlyfans', 'stripchat', or 'both'
--
-- CHATTER_REVENUES:
--   ✅ platform (VARCHAR) - 'onlyfans' or 'stripchat'
--
-- ============================================
-- 🎁 PRÄMIEN-SYSTEM (In der App implementiert)
-- ============================================
--
-- Private Shows müssen >= 5 Minuten sein um zu zählen!
--
-- 15 Shows = 30€ Extra
-- 20 Shows = 50€ Extra
-- 25 Shows = 70€ Extra
--
-- Berechnung für Moderatoren:
--   Gesamtauszahlung = (Arbeitsstunden × Stundenhonorar) + Prämie
--
-- ============================================
-- 🎬 BEISPIEL: Stundenhonorar für Moderator setzen
-- ============================================
--
-- UPDATE profiles 
-- SET hourly_rate = 18.50 
-- WHERE user_id = 'USER_ID_HERE' AND role = 'moderator';
--
-- UPDATE models
-- SET platform_type = 'stripchat'
-- WHERE name = 'Model Name Here';
