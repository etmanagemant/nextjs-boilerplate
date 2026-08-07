-- Fortsetzung der Datensalat-Suche (2026-08-07): drei weitere Tabellen
-- live per anon-key oeffentlich lesbar bestaetigt - shifts (Schichtplan
-- mit echten Mitarbeiternamen/Zeiten), content_plan_posts (Foto-Pfade,
-- Titel), content_communities (Subreddit-Liste). Diese drei hatten noch
-- nie einen RLS-Versuch (anders als profiles/shift_assignments von
-- vorhin), daher niedrigeres Risiko alter Konflikt-Policies - trotzdem
-- vorsichtshalber DROP POLICY IF EXISTS zuerst.
--
-- Bewusst einfach gehalten (authenticated-only statt feingranularer
-- Rollen-Pruefung): die eigentliche Rollen-/Berechtigungslogik (wer darf
-- Content-Plan ueberhaupt sehen) laeuft schon in der App selbst
-- (hasFeatureAccess), RLS soll hier nur echte Anonymitaet verhindern,
-- nicht die App-Logik duplizieren - genau das hat heute schon einmal
-- Aerger gemacht (zu viele ueberlappende Policies).

-- ============================================================
-- shifts (Schichtplan/Kalender - ANDERE Tabelle als shift_assignments,
-- das ist der tatsaechliche Ein-/Ausstempel-Log)
-- ============================================================
alter table shifts enable row level security;

drop policy if exists "shifts_select_authenticated" on shifts;
create policy "shifts_select_authenticated" on shifts
  for select to authenticated using (true);

drop policy if exists "shifts_insert_admin" on shifts;
create policy "shifts_insert_admin" on shifts
  for insert to authenticated with check (is_admin_tier(auth.uid()));

-- UPDATE bewusst fuer jeden eingeloggten Mitarbeiter offen, nicht nur
-- Admin - Massmessage-Feature (app/massmessage/actions.ts) schreibt in
-- dasselbe shifts.notes-JSON-Feld, auch fuer normale Chatter.
drop policy if exists "shifts_update_authenticated" on shifts;
create policy "shifts_update_authenticated" on shifts
  for update to authenticated using (true) with check (true);

drop policy if exists "shifts_delete_admin" on shifts;
create policy "shifts_delete_admin" on shifts
  for delete to authenticated using (is_admin_tier(auth.uid()));

-- ============================================================
-- content_plan_posts + content_communities
-- ============================================================
alter table content_plan_posts enable row level security;

drop policy if exists "content_posts_all_authenticated" on content_plan_posts;
create policy "content_posts_all_authenticated" on content_plan_posts
  for all to authenticated using (true) with check (true);

alter table content_communities enable row level security;

drop policy if exists "content_communities_all_authenticated" on content_communities;
create policy "content_communities_all_authenticated" on content_communities
  for all to authenticated using (true) with check (true);

-- ============================================================
-- ROLLBACK (nur falls danach etwas kaputt geht):
-- alter table shifts disable row level security;
-- alter table content_plan_posts disable row level security;
-- alter table content_communities disable row level security;
-- ============================================================
