-- HOTFIX 2 (2026-08-07): der vorherige Hotfix hat auth.users abgefragt -
-- dieses Schema ist oft nicht lesbar, selbst nicht fuer eine SECURITY
-- DEFINER-Funktion, je nachdem wer sie besitzt. Schlaegt die Abfrage
-- fehl, wirft das einen Fehler in JEDER Abfrage, die is_admin_tier
-- benutzt (also praktisch ueberall) - und weil dieser Code-Basis-weite
-- Zugriffsmuster (const x = data || []) Fehler ohne Meldung stillschweigend
-- als "leere Liste" behandelt, sah es aus wie "alle Mitarbeiter weg" statt
-- wie ein Fehler.
--
-- Diese Version liest die E-Mail stattdessen direkt aus dem JWT des
-- aktuellen Logins (auth.jwt() - Supabase-Bordmittel, kein Tabellen-
-- zugriff noetig, kann nicht an Rechten scheitern).
create or replace function is_admin_tier(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    uid = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'
    or (auth.jwt() ->> 'email') in ('etmanagement@gmail.com', 'etmanagemant@gmail.com')
    or exists (
      select 1 from profiles p
      where p.user_id = uid and p.role in ('admin', 'content-manager')
    );
$$;
