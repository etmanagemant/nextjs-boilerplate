-- KRITISCH, BITTE SOFORT AUSFUEHREN (2026-08-07): live bestaetigt per
-- direktem anon-key-Zugriff (kein Login noetig, der Key steht in jeder
-- ausgelieferten Seite) - folgende Tabellen waren komplett oeffentlich
-- lesbar:
--   - profiles: ALLE echten E-Mail-Adressen, IBAN/Crypto-Wallet-Felder
--     (aktuell leer, aber die neue Rechnungs-Funktion faengt gerade erst
--     an sie zu befuellen), Provisions-/Stundensaetze
--   - chatter_revenues: komplette Umsatzhistorie aller Chatter
--   - crm_onlyfans_sent_log: wer wann was an welchen Fan geschickt hat
--   - models: die persoenlichen Notizen UND die No-Go-Liste jedes Models
--     im Klartext (z.B. Alter, Wohnort - echte identifizierende Daten)
-- ENABLE_RLS_PROFILES_SHIFTS.sql wurde offenbar nie ausgefuehrt (profiles
-- war noch komplett offen) - diese Datei ist idempotent (DROP POLICY IF
-- EXISTS + CREATE), kann gefahrlos auch dann laufen, wenn Teile davon
-- schon existieren.

create or replace function is_admin_tier(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    uid = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'
    or exists (
      select 1 from profiles p
      where p.user_id = uid and p.role in ('admin', 'content-manager')
    );
$$;

-- ============================================================
-- profiles
-- ============================================================
alter table profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid() = user_id or is_admin_tier(auth.uid()));

drop policy if exists "profiles_insert_own_or_admin" on profiles;
create policy "profiles_insert_own_or_admin" on profiles
  for insert with check (auth.uid() = user_id or is_admin_tier(auth.uid()));

drop policy if exists "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin" on profiles
  for update using (auth.uid() = user_id or is_admin_tier(auth.uid()))
  with check (auth.uid() = user_id or is_admin_tier(auth.uid()));

drop policy if exists "profiles_delete_admin" on profiles;
create policy "profiles_delete_admin" on profiles
  for delete using (is_admin_tier(auth.uid()));

-- ============================================================
-- shift_assignments (erneut absichern, falls die alte Datei nur teilweise lief)
-- ============================================================
alter table shift_assignments enable row level security;

drop policy if exists "shift_select_own_or_admin" on shift_assignments;
create policy "shift_select_own_or_admin" on shift_assignments
  for select using (chatter_id = auth.uid() or is_admin_tier(auth.uid()));

drop policy if exists "shift_insert_own_or_admin" on shift_assignments;
create policy "shift_insert_own_or_admin" on shift_assignments
  for insert with check (chatter_id = auth.uid() or is_admin_tier(auth.uid()));

drop policy if exists "shift_update_own_or_admin" on shift_assignments;
create policy "shift_update_own_or_admin" on shift_assignments
  for update using (chatter_id = auth.uid() or is_admin_tier(auth.uid()))
  with check (chatter_id = auth.uid() or is_admin_tier(auth.uid()));

drop policy if exists "shift_delete_admin" on shift_assignments;
create policy "shift_delete_admin" on shift_assignments
  for delete using (is_admin_tier(auth.uid()));

-- ============================================================
-- chatter_revenues - jeder sieht nur die eigenen Zeilen (oder Admin
-- alle), Schreiben nur Admin (Dashboard's "Offene Einnahmen zuweisen")
-- oder der Service-Role-Key (VPS-Sync, umgeht RLS ohnehin).
-- ============================================================
alter table chatter_revenues enable row level security;

drop policy if exists "revenues_select_own_or_admin" on chatter_revenues;
create policy "revenues_select_own_or_admin" on chatter_revenues
  for select using (user_id = auth.uid() or is_admin_tier(auth.uid()));

drop policy if exists "revenues_update_admin" on chatter_revenues;
create policy "revenues_update_admin" on chatter_revenues
  for update using (is_admin_tier(auth.uid()))
  with check (is_admin_tier(auth.uid()));

-- ============================================================
-- crm_onlyfans_sent_log - "gesendet von wem" ist fuer jeden eingeloggten
-- Mitarbeiter sichtbar (steht im Chat selbst, nicht personenbezogen
-- geheim), nur eben nicht fuer anonyme Anfragen ohne Login.
-- ============================================================
alter table crm_onlyfans_sent_log enable row level security;

drop policy if exists "sentlog_select_authenticated" on crm_onlyfans_sent_log;
create policy "sentlog_select_authenticated" on crm_onlyfans_sent_log
  for select to authenticated using (true);

drop policy if exists "sentlog_insert_authenticated" on crm_onlyfans_sent_log;
create policy "sentlog_insert_authenticated" on crm_onlyfans_sent_log
  for insert to authenticated with check (true);

-- ============================================================
-- models - Notizen/No-Go-Liste fuer jeden eingeloggten Mitarbeiter
-- lesbar (genau wie das Fan-CRM-Panel es schon zeigt), Schreiben nur
-- Admin oder das Model selbst (owner_user_id).
-- ============================================================
alter table models enable row level security;

drop policy if exists "models_select_authenticated" on models;
create policy "models_select_authenticated" on models
  for select to authenticated using (true);

drop policy if exists "models_update_admin_or_owner" on models;
create policy "models_update_admin_or_owner" on models
  for update using (is_admin_tier(auth.uid()) or owner_user_id = auth.uid())
  with check (is_admin_tier(auth.uid()) or owner_user_id = auth.uid());

-- ============================================================
-- ROLLBACK (nur falls danach etwas kaputt geht):
-- alter table profiles disable row level security;
-- alter table shift_assignments disable row level security;
-- alter table chatter_revenues disable row level security;
-- alter table crm_onlyfans_sent_log disable row level security;
-- alter table models disable row level security;
-- ============================================================
