-- ============================================================================
-- CRITICAL SECURITY FIXES - run this whole file once in the Supabase SQL
-- editor, immediately. Found via a full security audit 2026-08-06.
--
-- Three separate holes, each independently exploitable RIGHT NOW by anyone
-- who can reach the relevant surface:
--
-- 1) Any logged-in CRM user (any chatter/moderator/model account) can make
--    themselves Admin with one browser-console command:
--      supabase.from('profiles').update({role:'admin'}).eq('user_id', <own id>)
--    because the existing "update your own profile row" RLS policy never
--    restricts WHICH columns can change - only that you own the row.
--
-- 2) Any logged-in CRM user can read every connected model's REAL OnlyFans
--    login session cookies straight out of the database:
--      supabase.from('crm_model_sessions').select('*')
--    - a policy named "Admins can view all CRM sessions" was actually
--    written as USING (true), which means "literally anyone", not admins.
--    Those cookies are enough to log into the real OnlyFans account
--    directly, bypassing the CRM/VPS/VNC entirely.
--
-- 3) Anyone on the public internet, not even logged in, can read/overwrite/
--    delete every Content Plan image (reddit_content storage bucket) - the
--    policies are named "Public Read/Upload/Delete/Update" and mean exactly
--    that, no TO authenticated restriction at all.
-- ============================================================================


-- ============================================================================
-- FIX 1: profiles self-role-escalation
-- ============================================================================
-- A trigger, not a policy change - keeps the existing RLS policies exactly
-- as they are (so nothing that currently works breaks), just hard-blocks
-- changing role/secondary_role unless the ACTOR is already admin-tier.
-- Uses the is_admin_tier() helper already created in
-- ENABLE_RLS_PROFILES_SHIFTS.sql.
create or replace function prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_tier(auth.uid()) then
    if new.role is distinct from old.role or new.secondary_role is distinct from old.secondary_role then
      raise exception 'Only an admin-tier account may change role or secondary_role';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on profiles;
create trigger trg_prevent_self_role_escalation
  before update on profiles
  for each row
  execute function prevent_self_role_escalation();


-- ============================================================================
-- FIX 2: crm_model_sessions - real OnlyFans session cookies were readable
-- by anyone logged in, not just admins
-- ============================================================================
alter table crm_model_sessions enable row level security;

drop policy if exists "Admins can view all CRM sessions" on crm_model_sessions;

create policy "crm_model_sessions_select_admin_only" on crm_model_sessions
for select
using (is_admin_tier(auth.uid()));

-- The existing "Admin users can access sessions" FOR ALL policy (from
-- CRM_MODEL_SESSIONS_ADD_CONTENT_MANAGER.sql) already correctly restricts
-- writes to admin-tier - left untouched, only the SELECT hole above needed
-- fixing.


-- ============================================================================
-- FIX 3: reddit_content storage bucket - was world-readable/writable/
-- deletable with no login at all
-- ============================================================================
drop policy if exists "Public Read" on storage.objects;
drop policy if exists "Public Upload" on storage.objects;
drop policy if exists "Public Delete" on storage.objects;
drop policy if exists "Public Update" on storage.objects;

create policy "reddit_content_select_authenticated" on storage.objects
for select
to authenticated
using (bucket_id = 'reddit_content');

create policy "reddit_content_insert_authenticated" on storage.objects
for insert
to authenticated
with check (bucket_id = 'reddit_content');

create policy "reddit_content_delete_authenticated" on storage.objects
for delete
to authenticated
using (bucket_id = 'reddit_content');

create policy "reddit_content_update_authenticated" on storage.objects
for update
to authenticated
using (bucket_id = 'reddit_content')
with check (bucket_id = 'reddit_content');


-- ============================================================================
-- VERIFY (run after the above, all three should show real restrictions):
-- select tablename, policyname, qual from pg_policies where tablename = 'profiles' and policyname like '%role%';
-- select tablename, policyname, qual from pg_policies where tablename = 'crm_model_sessions';
-- select policyname, qual from pg_policies where tablename = 'objects' and policyname like 'reddit_content%';
-- ============================================================================
