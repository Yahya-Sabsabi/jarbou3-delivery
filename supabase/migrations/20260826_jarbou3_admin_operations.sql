begin;

create table public.driver_registration_invites (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null unique check (phone ~ '^\+[0-9]{8,16}$'),
  vehicle_type text check (vehicle_type in ('motorcycle', 'electric_scooter')),
  note text check (char_length(coalesce(note, '')) <= 500),
  is_active boolean not null default true,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reporter_role public.user_role not null check (reporter_role in ('customer', 'driver')),
  message text not null check (char_length(trim(message)) between 10 and 1500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index problem_reports_status_created_idx on public.problem_reports (status, created_at desc);
create index problem_reports_reporter_created_idx on public.problem_reports (reporter_id, created_at desc);

alter table public.driver_registration_invites enable row level security;
alter table public.problem_reports enable row level security;

create policy driver_registration_invites_no_direct_access on public.driver_registration_invites
  for all to anon, authenticated using (false) with check (false);

create policy problem_reports_no_direct_access on public.problem_reports
  for all to anon, authenticated using (false) with check (false);

commit;
