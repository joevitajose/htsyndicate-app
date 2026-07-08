-- ════════════════════════════════════════════════════════════════════════
-- Item 0e — Close the anonymous leads hole.
-- CURRENT STATE (verified): a logged-OUT visitor can READ and INSERT leads
-- via the anon key that ships in the public browser bundle. This exposes every
-- lead's name/phone/payments to anyone.
--
-- FIX: any AUTHENTICATED user may read + write ALL leads (matches the app's
-- "everyone sees all leads" model). Anonymous role gets nothing.
-- This is NOT per-setter RLS — do not add per-user USING clauses here.
--
-- SAFE TO ENABLE because:
--   • All server routes (whop webhook, imports, send-push) use SUPABASE_SERVICE_KEY → bypass RLS.
--   • The browser only reads leads inside a logged-in session (App.jsx: `if(!user)return`).
--   • `TO authenticated` (role-scoped) — NOT the deprecated `auth.role()='authenticated'` footgun.
-- Run in: Supabase → SQL Editor, AFTER 0a–0d verified. Idempotent.
-- ════════════════════════════════════════════════════════════════════════

alter table public.leads enable row level security;

-- Remove any older permissive policies so this file is the single source of truth.
drop policy if exists "leads_auth"               on public.leads;
drop policy if exists "leads_all"                on public.leads;
drop policy if exists "leads_authenticated_all"  on public.leads;

-- Authenticated users: full access to every lead.
create policy "leads_authenticated_all"
  on public.leads
  for all
  to authenticated
  using (true)
  with check (true);

-- No policy for the anon role → anonymous read AND insert are now blocked.

-- Verify (should return the one policy above, roles = {authenticated}):
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname='public' and tablename='leads';
