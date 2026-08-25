create table public.admin_access_recovery_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_access_recovery_links_valid_idx
  on public.admin_access_recovery_links (expires_at)
  where used_at is null;

alter table public.admin_access_recovery_links enable row level security;

create or replace function public.create_admin_access_recovery_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.admin_access_recovery_links where expires_at < now() or used_at is not null;
  insert into public.admin_access_recovery_links (token_hash, expires_at)
  values (encode(extensions.digest(raw_token, 'sha256'), 'hex'), now() + interval '10 minutes');
  return raw_token;
end;
$$;

revoke all on function public.create_admin_access_recovery_token() from public;
