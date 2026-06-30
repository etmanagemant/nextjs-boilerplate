-- ========================================
-- STRIPCHAT MODERATOR EXPANSION
-- ========================================
-- Fügt neue Spalten für Stripchat-Tracking zu shift_assignments hinzu

-- 1. Neue Spalten zur shift_assignments Tabelle
ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS stripchat_lifetime_start DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS stripchat_lifetime_end DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS privateshow_total_hours DECIMAL(10,2) DEFAULT 0;

-- 2. Sicherstellen dass chatter_revenues 'platform' Spalte existiert
ALTER TABLE chatter_revenues
ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'onlyfans';

-- 3. 🎭 NEUE FEATURE: Platform-Typ für Models (OnlyFans vs Stripchat)
ALTER TABLE models
ADD COLUMN IF NOT EXISTS platform_type VARCHAR(50) DEFAULT 'onlyfans';
-- Erlaubte Werte: 'onlyfans', 'stripchat', 'both'

-- 4. Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_shift_assignments_stripchat_start ON shift_assignments(stripchat_lifetime_start);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_privateshow ON shift_assignments(privateshow_total_hours);
CREATE INDEX IF NOT EXISTS idx_chatter_revenues_platform ON chatter_revenues(platform);
CREATE INDEX IF NOT EXISTS idx_models_platform_type ON models(platform_type);

-- 5. OPTIONAL: Role-Spalte in profiles aktivieren
-- Falls die role-Spalte noch nicht existiert:
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'chatter';

-- Erlaubte Werte für role: 'admin', 'chatter', 'moderator'

-- ========================================
-- FERTIG!
-- ========================================
