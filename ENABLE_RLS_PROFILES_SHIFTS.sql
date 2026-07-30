-- SECURITY FIX (2026-07-30): profiles and shift_assignments had Row Level
-- Security DISABLED entirely - confirmed live via:
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r';
-- This means anyone holding the anon key (public, ships in every page load)
-- could read/write every employee's email, role, provision/hourly rate,
-- AND every shift/clock-in record, with no restriction at all. Root cause:
-- this repo's tables are all created via raw SQL run manually in the SQL
-- editor, and Supabase only auto-enables RLS for tables created through the
-- Table Editor UI.
--
-- All server-side reads/writes in this app (app/management/actions.ts,
-- app/layout.tsx, app/chatter/page.tsx, etc.) go through
-- utils/supabase/server.ts, which uses the ANON key + the user's own
-- session cookies - NOT a service-role key. That means enabling RLS with
-- no policies at all would silently break every one of those queries
-- (RLS defaults to deny-all). The policies below are written to exactly
-- match the access every existing query in this codebase already needs:
--   - a user can read/write their OWN profiles/shift_assignments row
--   - "admin-tier" (the hardcoded Hauptadmin, OR any profile with
--     role admin/content-manager - matches lib/roles.ts isAdminTierRole)
--     can read/write everything, needed for Management, the admin
--     dashboard's shift overview, WeeklyCalender, Abrechnung, etc.
--   - a brand-new self-registered user can INSERT their own first profile
--     row (see app/login/page.tsx) even before they have a role yet.

-- SECURITY DEFINER so this can be called FROM INSIDE a profiles policy
-- without infinite recursion (a normal query against profiles from a
-- profiles policy would itself be subject to RLS again).
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

create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid() = user_id or is_admin_tier(auth.uid()));

create policy "profiles_insert_own_or_admin" on profiles
  for insert with check (auth.uid() = user_id or is_admin_tier(auth.uid()));

create policy "profiles_update_own_or_admin" on profiles
  for update using (auth.uid() = user_id or is_admin_tier(auth.uid()))
  with check (auth.uid() = user_id or is_admin_tier(auth.uid()));

create policy "profiles_delete_admin" on profiles
  for delete using (is_admin_tier(auth.uid()));

-- ============================================================
-- shift_assignments
-- ============================================================
alter table shift_assignments enable row level security;

create policy "shift_select_own_or_admin" on shift_assignments
  for select using (chatter_id = auth.uid() or is_admin_tier(auth.uid()));

create policy "shift_insert_own_or_admin" on shift_assignments
  for insert with check (chatter_id = auth.uid() or is_admin_tier(auth.uid()));

create policy "shift_update_own_or_admin" on shift_assignments
  for update using (chatter_id = auth.uid() or is_admin_tier(auth.uid()))
  with check (chatter_id = auth.uid() or is_admin_tier(auth.uid()));

create policy "shift_delete_admin" on shift_assignments
  for delete using (is_admin_tier(auth.uid()));

-- ============================================================
-- ROLLBACK (only if something breaks after running the above):
-- alter table profiles disable row level security;
-- alter table shift_assignments disable row level security;
-- ============================================================
