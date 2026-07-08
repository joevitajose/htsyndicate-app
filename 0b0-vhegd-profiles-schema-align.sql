-- ════════════════════════════════════════════════════════════════════════
-- 0b0 — Align vhegd `profiles` with the app's expected schema.
-- RUN THIS FIRST — before the 0c trigger and before ANYONE signs up.
--
-- vhegd's profiles table currently has only: id, name, email, role, created_at.
-- The app writes subrole/dept/provider on every profile upsert, and the 0c
-- signup trigger inserts them too. A missing column makes that INSERT fail,
-- which (for an AFTER INSERT trigger on auth.users) BLOCKS THE SIGNUP entirely.
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists subrole    text not null default 'setter';
alter table public.profiles add column if not exists dept       text not null default 'sales';
alter table public.profiles add column if not exists provider   text default 'password';
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- Verify all columns now exist:
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema='public' and table_name='profiles'
--   order by ordinal_position;
