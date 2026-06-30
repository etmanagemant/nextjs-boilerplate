-- Add columns for persistent private show tracking across page navigation
ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS active_private_shows JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS private_show_totals JSONB DEFAULT '{}';

-- Verify columns
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name='shift_assignments' 
AND column_name IN ('active_private_shows', 'private_show_totals');
