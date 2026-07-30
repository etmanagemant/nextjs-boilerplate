-- FIX (2026-07-30): ENABLE_RLS_PROFILES_SHIFTS.sql's is_admin_tier() only
-- checked the hardcoded user_id, not the email fallback the rest of the app
-- uses (etmanagement@gmail.com / etmanagemant@gmail.com) - and the
-- auth.uid() = user_id comparisons may be failing on a uuid/text type
-- mismatch. Both are made defensive here (::text casts + email check).

create or replace function is_admin_tier(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    uid::text = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'
    or coalesce(auth.jwt() ->> 'email', '') in ('etmanagement@gmail.com', 'etmanagemant@gmail.com')
    or exists (
      select 1 from profiles p
      where p.user_id::text = uid::text and p.role in ('admin', 'content-manager')
    );
$$;

-- profiles: redefine own-row checks with a text cast (safe regardless of
-- whether user_id is actually uuid or text in the real schema)
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid()::text = user_id::text or is_admin_tier(auth.uid()));

drop policy if exists "profiles_insert_own_or_admin" on profiles;
create policy "profiles_insert_own_or_admin" on profiles
  for insert with check (auth.uid()::text = user_id::text or is_admin_tier(auth.uid()));

drop policy if exists "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin" on profiles
  for update using (auth.uid()::text = user_id::text or is_admin_tier(auth.uid()))
  with check (auth.uid()::text = user_id::text or is_admin_tier(auth.uid()));

-- shift_assignments: same text-cast safety on chatter_id
drop policy if exists "shift_select_own_or_admin" on shift_assignments;
create policy "shift_select_own_or_admin" on shift_assignments
  for select using (auth.uid()::text = chatter_id::text or is_admin_tier(auth.uid()));

drop policy if exists "shift_insert_own_or_admin" on shift_assignments;
create policy "shift_insert_own_or_admin" on shift_assignments
  for insert with check (auth.uid()::text = chatter_id::text or is_admin_tier(auth.uid()));

drop policy if exists "shift_update_own_or_admin" on shift_assignments;
create policy "shift_update_own_or_admin" on shift_assignments
  for update using (auth.uid()::text = chatter_id::text or is_admin_tier(auth.uid()))
  with check (auth.uid()::text = chatter_id::text or is_admin_tier(auth.uid()));

-- Quick sanity check after running the above - should return your own row
-- AND (if you're admin-tier) show is_admin as true:
-- select user_id, email, role, is_admin_tier(auth.uid()) as is_admin from profiles where user_id = auth.uid();
