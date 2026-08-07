-- HOTFIX 4 (2026-08-07): gleicher Fehler wie bei profiles, diesmal bei
-- shift_assignments - drei alte Policies aus einem frueheren Anlauf
-- laufen neben den neuen sauberen weiter, alle drei nur "eigene Zeile",
-- ohne Admin-Bypass:
--   shift_assignments_select_own, shift_assignments_update_own_started,
--   shift_assignments_insert_own
-- Erklaert "STECHUHR: 0.00h" - Admin sollte ALLE Schichten summiert sehen,
-- diese alten Policies liessen (je nach RESTRICTIVE/PERMISSIVE) nur die
-- eigenen durch. chatter_revenues, crm_onlyfans_sent_log und models sind
-- sauber (nur die neuen Policies vorhanden), keine Aenderung noetig dort.
drop policy if exists "shift_assignments_select_own" on shift_assignments;
drop policy if exists "shift_assignments_update_own_started" on shift_assignments;
drop policy if exists "shift_assignments_insert_own" on shift_assignments;
