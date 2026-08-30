-- Privacy consent is private to the authenticated account.
create table if not exists public.privacy_consents (
  user_id uuid primary key references public.users(id) on delete cascade,
  policy_version text not null check (char_length(trim(policy_version)) between 1 and 40),
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_consents_policy_version_idx
  on public.privacy_consents (policy_version, accepted_at desc);

alter table public.privacy_consents enable row level security;

revoke all on table public.privacy_consents from anon;
revoke all on table public.privacy_consents from authenticated;

drop policy if exists privacy_consents_owner_manage on public.privacy_consents;
create policy privacy_consents_owner_manage
  on public.privacy_consents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
