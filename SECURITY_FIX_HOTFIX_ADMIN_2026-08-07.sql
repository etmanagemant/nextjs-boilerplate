-- HOTFIX (2026-08-07, sofort danach): nach dem RLS-Fix eben waren fuer den
-- echten Admin ploetzlich alle Mitarbeiter weg. is_admin_tier() hat sich
-- bisher NUR auf die hart einprogrammierte User-ID verlassen - das war nie
-- unter echter RLS-Durchsetzung getestet (RLS war ja vorher komplett aus),
-- und im restlichen Code wird der Admin ueberall zusaetzlich ueber BEIDE
-- E-Mail-Varianten erkannt (etmanagement@gmail.com UND der Tippfehler
-- etmanagemant@gmail.com), nicht nur ueber die ID. Diese Funktion jetzt
-- genauso robust: ID ODER E-Mail (per auth.users) ODER admin/content-
-- manager-Rolle - kann die Erkennung nur ERWEITERN, nie einschraenken,
-- also gefahrlos direkt drueber zu spielen.
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
      select 1 from auth.users u
      where u.id = uid and u.email in ('etmanagement@gmail.com', 'etmanagemant@gmail.com')
    )
    or exists (
      select 1 from profiles p
      where p.user_id = uid and p.role in ('admin', 'content-manager')
    );
$$;
