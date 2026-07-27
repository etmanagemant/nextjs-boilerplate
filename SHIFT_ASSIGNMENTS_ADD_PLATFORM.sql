-- shift_assignments has always held two unrelated kinds of row in the same
-- table with no way to tell them apart: a plain OnlyFans clock-in (model_id
-- null/singular, notes usually empty) from app/chatter/page.tsx, and a
-- Stripchat shift (notes JSON with a models array) from
-- ModeratorStriptchatShift.tsx. Both sides' "is there an active shift"
-- queries just grab any unclosed row for that chatter_id, with nothing
-- scoping them to their own kind - starting one Stechuhr made the OTHER
-- one immediately show as active too, confirmed live 2026-07-27.
ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS platform TEXT;

-- One-time backfill for existing rows, inferred from notes' shape (the
-- only signal available before this column existed).
UPDATE shift_assignments
SET platform = CASE
  WHEN notes IS NOT NULL AND notes LIKE '{%' AND notes LIKE '%"models"%' THEN 'stripchat'
  ELSE 'onlyfans'
END
WHERE platform IS NULL;
