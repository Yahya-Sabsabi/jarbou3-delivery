-- Registration requests are service-managed: clients never read another applicant's data or a plaintext code.

create type public.onboarding_role as enum ('customer', 'driver');
create type public.account_verification_status as enum ('pending_admin', 'code_sent', 'verified', 'expired', 'locked', 'rejected');

create table public.account_verification_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null unique check (phone ~ '^\+?[0-9]{8,16}$'),
  requested_role public.onboarding_role not null,
  vehicle_type text check (vehicle_type is null or char_length(trim(vehicle_type)) between 2 and 80),
  status public.account_verification_status not null default 'pending_admin',
  verification_code_hash text,
  code_expires_at timestamptz,
  code_attempts smallint not null default 0 check (code_attempts between 0 and 5),
  code_sent_at timestamptz,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  auth_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_verification_status_created_idx on public.account_verification_requests (status, created_at asc);

create or replace function public.set_account_verification_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger account_verification_set_updated_at before update on public.account_verification_requests for each row execute function public.set_account_verification_updated_at();

alter table public.account_verification_requests enable row level security;
