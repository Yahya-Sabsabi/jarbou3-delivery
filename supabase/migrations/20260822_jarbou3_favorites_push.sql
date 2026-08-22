-- Customer favorites and device tokens remain private to their owning account.

create table public.favorite_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 2 and 80),
  address text not null check (char_length(trim(address)) between 3 and 300),
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint favorite_address_in_hama check (latitude between 35.04 and 35.23 and longitude between 36.60 and 36.91)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  expo_push_token text not null unique check (char_length(expo_push_token) between 20 and 255),
  platform text not null check (platform in ('ios', 'android')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists driver_near_notified_at timestamptz;

create index favorite_addresses_customer_idx on public.favorite_addresses (customer_id, created_at desc);
create index push_tokens_user_idx on public.push_tokens (user_id, last_seen_at desc);

create or replace function public.set_favorite_address_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger favorite_addresses_set_updated_at before update on public.favorite_addresses for each row execute function public.set_favorite_address_updated_at();

alter table public.favorite_addresses enable row level security;
alter table public.push_tokens enable row level security;

create policy favorite_addresses_customer_manage on public.favorite_addresses
  for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy push_tokens_owner_manage on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
