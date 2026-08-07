-- HOTFIX 3 (2026-08-07) - endlich der echte Grund: pg_policies zeigt zwei
-- ALTE, vergessene Policies auf profiles aus einem frueheren Anlauf, die
-- neben meinen neuen weiterlaufen:
--   "profiles: admin manage" (ALL) - fragt rekursiv profiles VON INNEN
--     einer profiles-Policy ab, ohne SECURITY DEFINER-Bypass wie meine
--     is_admin_tier()-Funktion - self-referential, unzuverlaessig.
--   "profiles: select own" (SELECT) - erlaubt nur die eigene Zeile.
-- Postgres UND-verknuepft RESTRICTIVE Policies mit allen anderen, statt
-- sie nur zu ODER-verknuepfen wie normale (PERMISSIVE) Policies - falls
-- eine davon als RESTRICTIVE angelegt wurde, haette sie meine neue Admin-
-- Regel komplett ausgehebelt, selbst wenn is_admin_tier() korrekt true
-- liefert. Diese beiden alten Policies raus, nur die sauberen von eben
-- bleiben.
drop policy if exists "profiles: admin manage" on profiles;
drop policy if exists "profiles: select own" on profiles;
