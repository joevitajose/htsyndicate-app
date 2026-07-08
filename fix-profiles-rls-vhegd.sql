-- ════════════════════════════════════════════════════════════════════════
-- profiles RLS for vhegd.
-- Goal: any AUTHENTICATED user can READ all profiles (Team panel + assignee
-- dropdowns need this). Writes are restricted to your OWN row — EXCEPT admins,
-- who must be able to update/remove ANY profile, or the Team-panel role-change
-- (promote setter→closer→admin) and Remove-member actions break.
--
-- NOTE / deviation from "own-row write only": the whole onboarding model is
-- "everyone signs up as setter, an ADMIN promotes them." That promotion is a
-- write to ANOTHER user's row, so admins need write access to all rows. The
-- service-key bootstrap works regardless, but ongoing UI promotion needs this.
--
-- Run in the vhegd SQL editor. Idempotent. Requires 0b0 to have run first.
-- ════════════════════════════════════════════════════════════════════════

-- Helper: is the caller an admin? SECURITY DEFINER so it reads profiles WITHOUT
-- RLS — a plain subquery on profiles inside a profiles policy would recurse.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;

-- Clear any prior policies (various historical names) so this file is authoritative.
drop policy if exists "profiles_select"                    on public.profiles;
drop policy if exists "profiles_select_all_authenticated"  on public.profiles;
drop policy if exists "profiles_insert"                    on public.profiles;
drop policy if exists "profiles_insert_own"                on public.profiles;
drop policy if exists "profiles_update"                    on public.profiles;
drop policy if exists "profiles_update_own"                on public.profiles;
drop policy if exists "profiles_update_own_or_admin"       on public.profiles;
drop policy if exists "profiles_delete_admin"              on public.profiles;

-- Read: every authenticated user sees all profiles.
create policy "profiles_select_all_authenticated"
  on public.profiles for select to authenticated using (true);

-- Insert: only your own row (signup self-create; the 0c trigger is SECURITY
-- DEFINER so it bypasses this anyway).
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Update: your own row, OR any row if you're an admin (Team-panel promotion).
create policy "profiles_update_own_or_admin"
  on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Delete: admins only (Team-panel Remove member).
create policy "profiles_delete_admin"
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- Verify:
--   select policyname, cmd, roles from pg_policies
--   where schemaname='public' and tablename='profiles' order by policyname;
