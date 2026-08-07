-- Letzte Runde der Datensalat-Suche (2026-08-07). Vorher geprueft: keine
-- alten Policies auf diesen 5 Tabellen (pg_policies leer) - anders als
-- profiles/shift_assignments von vorhin also kein Konflikt-Risiko.
--
-- crm_chat_logs, crm_fan_nicknames, crm_mass_messages sind TOTE Tabellen -
-- kein einziger aktiver Code-Pfad benutzt sie noch (crm_fan_nicknames
-- wurde durch OnlyFans' eigenes Rename-Feature ersetzt, crm_chat_logs/
-- crm_mass_messages stammen aus einem nie fertig gebauten alten Konzept,
-- siehe REVENUE_INTERCEPTOR_DOCS.md). Komplett zusperren (nur Admin),
-- niemand braucht aktuell Zugriff.

alter table crm_chat_logs enable row level security;
create policy "chat_logs_admin_only" on crm_chat_logs
  for all to authenticated using (is_admin_tier(auth.uid())) with check (is_admin_tier(auth.uid()));

alter table crm_fan_nicknames enable row level security;
create policy "fan_nicknames_admin_only" on crm_fan_nicknames
  for all to authenticated using (is_admin_tier(auth.uid())) with check (is_admin_tier(auth.uid()));

alter table crm_mass_messages enable row level security;
create policy "mass_messages_admin_only" on crm_mass_messages
  for all to authenticated using (is_admin_tier(auth.uid())) with check (is_admin_tier(auth.uid()));

-- ============================================================
-- funnel_submissions - Bewerbungs-Formular schreibt per anon-Key rein
-- (app/api/funnel-submissions/route.ts, per eigenem Secret-Header schon
-- app-seitig abgesichert, bevor die DB ueberhaupt angefragt wird) - dieser
-- Weg muss offen bleiben. LESEN der Bewerber-Daten (Name/Telefon/E-Mail)
-- nur Admin.
-- ============================================================
alter table funnel_submissions enable row level security;

create policy "funnel_submissions_insert_anon" on funnel_submissions
  for insert to anon, authenticated with check (true);

create policy "funnel_submissions_admin_manage" on funnel_submissions
  for select to authenticated using (is_admin_tier(auth.uid()));

create policy "funnel_submissions_admin_update" on funnel_submissions
  for update to authenticated using (is_admin_tier(auth.uid())) with check (is_admin_tier(auth.uid()));

create policy "funnel_submissions_admin_delete" on funnel_submissions
  for delete to authenticated using (is_admin_tier(auth.uid()));

-- ============================================================
-- abandoned_leads - dasselbe externe Formular-System (ausserhalb dieses
-- Repos) schreibt bei Formular-Abbruch direkt per anon-Key rein, OHNE
-- eigenen Secret-Header (ABANDONED_LEADS_SETUP.sql hatte RLS bewusst
-- ausgeschaltet + vollen anon-Zugriff gewaehrt, genau deshalb war's
-- offen). INSERT muss offen bleiben, sonst verliert das externe System
-- seine Schreibrechte - LESEN der Bewerber-PII (Name/Telefon/E-Mail/
-- Geburtstag) aber nur Admin, aktuell liest ohnehin nur das Dashboard.
-- ============================================================
alter table abandoned_leads enable row level security;

create policy "abandoned_leads_insert_anon" on abandoned_leads
  for insert to anon, authenticated with check (true);

create policy "abandoned_leads_admin_manage" on abandoned_leads
  for select to authenticated using (is_admin_tier(auth.uid()));

create policy "abandoned_leads_admin_update" on abandoned_leads
  for update to authenticated using (is_admin_tier(auth.uid())) with check (is_admin_tier(auth.uid()));

create policy "abandoned_leads_admin_delete" on abandoned_leads
  for delete to authenticated using (is_admin_tier(auth.uid()));

-- ============================================================
-- ROLLBACK (nur falls danach etwas kaputt geht):
-- alter table crm_chat_logs disable row level security;
-- alter table crm_fan_nicknames disable row level security;
-- alter table crm_mass_messages disable row level security;
-- alter table funnel_submissions disable row level security;
-- alter table abandoned_leads disable row level security;
-- ============================================================
