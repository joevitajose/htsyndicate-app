-- ════════════════════════════════════════════════════════════════════════
-- 0c — Auto-create a profile row for EVERY new signup (email/password AND Google).
-- RUN AFTER 0b0-vhegd-profiles-schema-align.sql (needs subrole/dept/provider).
--
-- SECURITY MODEL (open self-signup):
--   • Anyone with the app link can sign up and immediately get a profile.
--   • role/subrole are HARD-CODED to least privilege (sales / setter).
--   • Signup can NEVER choose its own role — metadata app_role is deliberately
--     IGNORED here (this is exactly how a signup escalated to admin before).
--   • Admins promote people afterward via the Team UI.
--
--   Bootstrap note: because every signup is a setter, the FIRST admins
--   (Joevita, Suraj) can't be promoted through the admin-only UI — no admin
--   exists yet. Promote them once via a direct UPDATE after they sign up
--   (regenerated 0d, using their real vhegd auth uuids).
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, subrole, dept, provider)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email,''),'@',1),
      'User'
    ),
    coalesce(new.email,''),
    'sales',    -- forced. do NOT read app_role from metadata.
    'setter',   -- forced least-privilege.
    'sales',
    coalesce(new.raw_app_meta_data->>'provider','password')
  )
  on conflict (id) do nothing;   -- never clobber an admin-corrected profile
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Verify the trigger exists:
--   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;
