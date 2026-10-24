-- Family Wishes: initial schema.
-- RLS is enabled on every table with no policies: only the server-side connection (DATABASE_URL) can read or write.

create table members (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^[0-9]{8,15}$'),
  name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('birthday', 'anniversary', 'special')),
  names text not null,
  family_calls_them text,
  title text,
  day smallint not null check (day between 1 and 31),
  month smallint not null check (month between 1 and 12),
  year smallint,
  repeats_yearly boolean not null default true,
  note text,
  archived boolean not null default false,
  added_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table festivals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  created_at timestamptz not null default now(),
  unique (name, date)
);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  occurrence_date date not null,
  event_id uuid references events (id) on delete cascade,
  festival_id uuid references festivals (id) on delete cascade,
  number smallint not null,
  text text not null,
  source text not null check (source in ('ai', 'template', 'admin')),
  status text not null check (status in ('pending', 'approved', 'sending', 'sent', 'skipped', 'expired', 'failed')),
  error text,
  sent_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  check (num_nonnulls(event_id, festival_id) = 1),
  unique (occurrence_date, event_id),
  unique (occurrence_date, festival_id),
  unique (occurrence_date, number)
);

create table settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('group_id', ''),
  ('draft_time', '20:00'),
  ('nudge_time', '07:00'),
  ('send_time', '08:00'),
  ('time_zone', 'Asia/Kolkata'),
  ('country_code', '91'),
  ('active_batch_date', ''),
  -- Must match DEFAULT_AI_STYLE in packages/core/src/wish/prompt.ts (asserted by a test).
  ('ai_style', 'Warm and short (2–4 lines), mostly English with a natural Hindi touch, a couple of fitting emojis, no hashtags.');

create table login_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

create index login_codes_phone_created_idx on login_codes (phone, created_at desc);

create table sessions (
  token_hash text primary key,
  member_id uuid not null references members (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table outbox (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table wa_auth (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table wa_status (
  id smallint primary key check (id = 1),
  state text not null default 'starting',
  qr text,
  groups jsonb not null default '[]',
  linked_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

insert into wa_status (id) values (1);

create table job_runs (
  job text not null,
  run_date date not null,
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (job, run_date)
);

create table job_requests (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('draft', 'send')),
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  created_at timestamptz not null default now()
);

alter table members enable row level security;
alter table events enable row level security;
alter table festivals enable row level security;
alter table drafts enable row level security;
alter table settings enable row level security;
alter table login_codes enable row level security;
alter table sessions enable row level security;
alter table outbox enable row level security;
alter table wa_auth enable row level security;
alter table wa_status enable row level security;
alter table job_runs enable row level security;
alter table job_requests enable row level security;
