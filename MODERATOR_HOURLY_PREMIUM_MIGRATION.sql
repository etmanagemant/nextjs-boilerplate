-- 🎯 MODERATOR-ERWEITERUNG: Stundenhonorar + Prämien-System

-- ✅ 1. Füge hourly_rate zu profiles hinzu (für Moderator-Stundenhonorar)
-- In PostgreSQL/Supabase: Verwende ALTER TABLE mit IF NOT EXISTS (seit PostgreSQL 14+)
-- Falls nicht verfügbar, führe einfach aus (Fehler wird ignoriert wenn Spalte existiert)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2) DEFAULT 0;

-- ✅ 2. Aktualisiere shift_assignments für besseres Private-Show Tracking
-- privateshow_total_hours existiert schon, aber wir brauchen privateshow_count für Prämienberechnung
ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS privateshow_count INTEGER DEFAULT 0;

-- ✅ 3. Erstelle Index für bessere Performance
CREATE INDEX IF NOT EXISTS idx_profiles_hourly_rate ON profiles(hourly_rate);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_privateshow_count ON shift_assignments(privateshow_count);

-- ✅ Verifikation
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name IN ('hourly_rate');
