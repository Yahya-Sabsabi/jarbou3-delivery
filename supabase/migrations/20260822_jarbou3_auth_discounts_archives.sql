-- Customer and driver credentials remain in Supabase Auth.
-- This migration stores only hashed one-time codes and operational archive metadata.

alter table public.account_verification_requests
  drop constraint if exists account_verification_requests_code_attempts_check;

alter table public.account_verification_requests
  add constraint account_verification_requests_code_attempts_check
  check (code_attempts between 0 and 3);

alter table public.account_verification_requests
  add column if not exists retry_after timestamptz;

create table public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null check (phone ~ '^\+?[0-9]{8,16}$'),
  requested_role public.onboarding_role not null,
  user_id uuid references public.users(id) on delete cascade,
  status text not null default 'pending_admin' check (status in ('pending_admin', 'code_sent', 'verified', 'locked', 'completed', 'rejected')),
  verification_code_hash text,
  code_expires_at timestamptz,
  code_attempts smallint not null default 0 check (code_attempts between 0 and 3),
  retry_after timestamptz,
  code_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_recovery_phone_created_idx
  on public.account_recovery_requests (phone, created_at desc);

create index account_recovery_status_created_idx
  on public.account_recovery_requests (status, created_at asc);

create or replace function public.set_jarbou3_archive_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger account_recovery_set_updated_at
before update on public.account_recovery_requests
for each row execute function public.set_jarbou3_archive_updated_at();

alter table public.account_recovery_requests enable row level security;

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((discount_type = 'fixed' and discount_value >= 1) or (discount_type = 'percentage' and discount_value <= 100)),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create trigger discount_codes_set_updated_at
before update on public.discount_codes
for each row execute function public.set_jarbou3_archive_updated_at();

alter table public.discount_codes enable row level security;

alter table public.orders
  add column if not exists pre_discount_price integer,
  add column if not exists discount_amount integer not null default 0 check (discount_amount >= 0),
  add column if not exists discount_code_id uuid references public.discount_codes(id) on delete set null;

create table public.manual_archives (
  id uuid primary key default gen_random_uuid(),
  archive_kind text not null check (archive_kind in ('weekly_documents', 'monthly_text')),
  period_start date not null,
  period_end date not null,
  storage_path text not null,
  status text not null default 'ready' check (status in ('ready', 'downloaded', 'purged', 'failed')),
  downloaded_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_kind, period_start, period_end),
  check (period_end >= period_start)
);

create trigger manual_archives_set_updated_at
before update on public.manual_archives
for each row execute function public.set_jarbou3_archive_updated_at();

alter table public.manual_archives enable row level security;
