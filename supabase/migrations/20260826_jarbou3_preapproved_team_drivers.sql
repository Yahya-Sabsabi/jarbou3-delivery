alter table public.account_verification_requests
  add column if not exists preapproved_by_admin boolean not null default false;

alter table public.driver_registration_invites
  add column if not exists activation_request_id uuid references public.account_verification_requests(id) on delete set null;

create unique index if not exists driver_registration_invites_activation_request_key
  on public.driver_registration_invites (activation_request_id)
  where activation_request_id is not null;

create index if not exists account_verification_preapproved_status_idx
  on public.account_verification_requests (preapproved_by_admin, status, created_at desc)
  where preapproved_by_admin = true;
