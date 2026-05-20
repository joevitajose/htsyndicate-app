-- HTSyndicate Dashboard — Supabase Schema
-- Run this entire file in: Supabase → SQL Editor → New query → paste → Run

-- ─── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles (linked 1-to-1 with auth.users) ─────────────────
create table if not exists profiles (
  id        uuid references auth.users on delete cascade primary key,
  name      text not null,
  email     text not null,
  role      text not null default 'sales',    -- admin | sales | finance | tech
  subrole   text not null default 'setter',   -- admin | setter | closer | finance | tech
  dept      text not null default 'sales',    -- all | sales | finance | tech
  provider  text default 'password',          -- password | google
  created_at timestamptz default now()
);

-- ─── Leads ────────────────────────────────────────────────────
create table if not exists leads (
  id             text primary key default ('lead_' || substr(md5(random()::text), 1, 7)),
  name           text not null,
  company        text,
  email          text,
  phone          text,
  source         text,
  setter_stage   text default 'new',
  closer_stage   text,
  priority       text default 'warm',
  value          bigint default 0,
  setter         text,
  closer         text,
  product        text,
  city           text,
  industry       text,
  notes          text,
  created_at     timestamptz default now(),
  token_paid_at  timestamptz,
  first_paid_at  timestamptz,
  calls          int default 0,
  call_logs      jsonb default '[]',
  follow_ups     jsonb default '[]',
  setter_history jsonb default '[]',
  closer_history jsonb default '[]',
  payments       jsonb default '[]'
);

-- ─── Invoices ─────────────────────────────────────────────────
create table if not exists invoices (
  id         text primary key,
  client     text not null,
  amount     bigint default 0,
  paid       bigint default 0,
  status     text default 'draft',   -- draft | sent | paid | partial | overdue
  date       date,
  due        date,
  items      jsonb default '[]',
  tax        numeric default 18,
  recurring  boolean default false,
  notes      text,
  created_at timestamptz default now()
);

-- ─── Tasks ────────────────────────────────────────────────────
create table if not exists tasks (
  id         text primary key default ('task_' || substr(md5(random()::text), 1, 7)),
  title      text not null,
  dept       text not null,
  assignee   text,
  status     text default 'todo',      -- todo | in_progress | done
  priority   text default 'medium',    -- low | medium | high | critical
  due        date,
  created_at timestamptz default now()
);

-- ─── Automations ──────────────────────────────────────────────
create table if not exists automations (
  id         text primary key default ('auto_' || substr(md5(random()::text), 1, 7)),
  name       text not null,
  trigger    text,
  action     text,
  dept       text default 'all',
  status     text default 'active',   -- active | paused
  runs       int default 0,
  rate       numeric default 100,
  type       text,
  created_at timestamptz default now()
);

-- ─── Punch State (live status per person, updated on punch in/out) ─────
create table if not exists punch_state (
  person_name  text primary key,
  dept         text,
  clocked_in   boolean default false,
  in_time      text,
  out_time     text,
  hours_today  numeric default 0,
  tasks_today  int default 0,
  calls_today  int default 0,
  productivity int default 0,
  updated_at   timestamptz default now()
);

-- ─── Punch Records (historical per-day log) ────────────────────
create table if not exists punch_records (
  id           uuid primary key default uuid_generate_v4(),
  person_name  text not null,
  dept         text,
  date         date not null default current_date,
  punch_in     text,
  punch_out    text,
  hours        numeric default 0,
  tasks        int default 0,
  calls        int default 0,
  productivity int default 0,
  status       text default 'present',  -- present | absent | leave | halfday | weekend
  late         boolean default false,
  created_at   timestamptz default now(),
  unique (person_name, date)
);

-- ─── Pipelines ────────────────────────────────────────────────
create table if not exists pipelines (
  id         text primary key,
  name       text not null,
  sources    jsonb default '[]',
  color      text,
  icon       text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ─── Setter Stages ────────────────────────────────────────────
create table if not exists setter_stages (
  id         text primary key,
  label      text not null,
  color      text,
  sort_order int default 0
);

-- ─── Closer Stages ────────────────────────────────────────────
create table if not exists closer_stages (
  id         text primary key,
  label      text not null,
  color      text,
  sort_order int default 0
);

-- ─── Leaves ───────────────────────────────────────────────────
create table if not exists leaves (
  id           text primary key default ('leave_' || substr(md5(random()::text), 1, 7)),
  by_name      text not null,
  from_date    date not null,
  to_date      date not null,
  type         text default 'casual',   -- casual | sick | earned
  reason       text,
  status       text default 'pending',  -- pending | approved | rejected
  submitted_at timestamptz default now(),
  decided_at   timestamptz,
  decided_by   text
);

-- ─── Bank Payments ────────────────────────────────────────────
create table if not exists bank_payments (
  id                text primary key default ('pmt_' || substr(md5(random()::text), 1, 7)),
  amount            bigint not null,
  from_name         text,
  remarks           text,
  received_at       timestamptz default now(),
  method            text,
  txn_id            text,
  status            text default 'unmatched',  -- unmatched | linked
  linked_lead_id    text references leads(id),
  linked_invoice_id text references invoices(id),
  bank_account      text
);

-- ─── Notifications ────────────────────────────────────────────
create table if not exists notifications (
  id       text primary key default ('notif_' || substr(md5(random()::text), 1, 7)),
  type     text,
  msg      text,
  at       timestamptz default now(),
  read     boolean default false,
  for_role text,    -- admin | sales | all
  for_user text,    -- specific person's name
  link_to  text     -- page id to navigate to
);

-- ─── Row Level Security ───────────────────────────────────────
alter table profiles     enable row level security;
alter table leads        enable row level security;
alter table invoices     enable row level security;
alter table tasks        enable row level security;
alter table automations  enable row level security;
alter table punch_state  enable row level security;
alter table punch_records enable row level security;
alter table pipelines    enable row level security;
alter table setter_stages enable row level security;
alter table closer_stages enable row level security;
alter table leaves       enable row level security;
alter table bank_payments enable row level security;
alter table notifications enable row level security;

-- ─── Profiles: users can only write their own row ─────────────
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- ─── All other tables: any authenticated user has full access ──
-- (tighten these later when you want per-role restrictions)

do $$ declare tbl text; begin
  foreach tbl in array array[
    'leads','invoices','tasks','automations',
    'punch_state','punch_records',
    'pipelines','setter_stages','closer_stages',
    'leaves','bank_payments','notifications'
  ] loop
    execute format(
      'create policy "%s_auth" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      tbl, tbl
    );
  end loop;
end $$;

-- ─── Enable Realtime for live sync ───────────────────────────
-- Run these one at a time if the loop fails on your plan:
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table automations;
alter publication supabase_realtime add table punch_state;
alter publication supabase_realtime add table punch_records;
alter publication supabase_realtime add table pipelines;
alter publication supabase_realtime add table setter_stages;
alter publication supabase_realtime add table closer_stages;
alter publication supabase_realtime add table leaves;
alter publication supabase_realtime add table bank_payments;
alter publication supabase_realtime add table notifications;

-- ─── Seed: default pipelines ──────────────────────────────────
insert into pipelines (id, name, sources, color, icon, sort_order) values
  ('all',       'All Leads',  '[]',                                                                       '#9a9caa', 'users',  0),
  ('whop',      'Whop',       '["Whop (Course Buyer)"]',                                                  '#a07cf5', 'whop',   1),
  ('instagram', 'Instagram',  '["Instagram"]',                                                            '#e1306c', 'link',   2),
  ('linkedin',  'LinkedIn',   '["LinkedIn"]',                                                             '#0a66c2', 'link',   3),
  ('website',   'Website',    '["Website","Inbound Call"]',                                               '#22c3d6', 'link',   4),
  ('ads',       'Paid Ads',   '["Google Ads","Facebook"]',                                                '#eab308', 'tgt',    5),
  ('outbound',  'Outbound',   '["Cold Call","Cold Email"]',                                               '#d4943e', 'phone',  6),
  ('referral',  'Referrals',  '["Referral","Partner"]',                                                   '#3dd68c', 'users',  7)
on conflict (id) do nothing;

-- ─── Seed: default setter stages ──────────────────────────────
insert into setter_stages (id, label, color, sort_order) values
  ('new',           'New Lead',       '#5b9cf5', 0),
  ('call_booked',   'Call Booked',    '#22c3d6', 1),
  ('showup',        'Show Up',        '#d4943e', 2),
  ('no_showup',     'No Show Up',     '#f97316', 3),
  ('follow_up',     'Follow Up',      '#eab308', 4),
  ('qualified',     'Qualified',      '#a07cf5', 5),
  ('not_qualified', 'Not Qualified',  '#ef6b6b', 6),
  ('won',           'Won',            '#3dd68c', 7),
  ('lost',          'Lost',           '#5b5d6b', 8)
on conflict (id) do nothing;

-- ─── Seed: default closer stages ──────────────────────────────
insert into closer_stages (id, label, color, sort_order) values
  ('new',           'New Lead',       '#5b9cf5', 0),
  ('showup',        'Show Up',        '#d4943e', 1),
  ('no_showup',     'No Show Up',     '#f97316', 2),
  ('follow_up',     'Follow Up',      '#eab308', 3),
  ('qualified',     'Qualified',      '#a07cf5', 4),
  ('not_qualified', 'Not Qualified',  '#ef6b6b', 5),
  ('won',           'Won',            '#3dd68c', 6),
  ('lost',          'Lost',           '#5b5d6b', 7)
on conflict (id) do nothing;
