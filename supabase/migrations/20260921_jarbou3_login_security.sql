-- Persistent account-level login lockout state.
create table if not exists public.account_login_security (
  phone text primary key check (phone ~ '^\+?[0-9]{8,16}$'),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_login_security enable row level security;
