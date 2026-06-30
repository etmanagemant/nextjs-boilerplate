-- 🔧 FEHLERFIX: Füge fehlende 'notes' Spalte hinzu
-- Diese Spalte speichert die ausgewählten Models als JSON

ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_notes ON shift_assignments(notes);

-- Verification - prüfe ob Spalte existiert
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name='shift_assignments' AND column_name='notes';
