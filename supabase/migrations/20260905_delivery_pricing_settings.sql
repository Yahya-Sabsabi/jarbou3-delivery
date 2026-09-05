begin;

create table if not exists public.delivery_pricing_settings (
  singleton boolean primary key default true check (singleton),
  minimum_fare bigint not null default 60 check (minimum_fare > 0 and minimum_fare <= 1000000000),
  per_km bigint not null default 25 check (per_km > 0 and per_km <= 1000000000),
  currency_code text not null default 'SYP_NEW' check (currency_code = 'SYP_NEW'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

insert into public.delivery_pricing_settings (singleton, minimum_fare, per_km, currency_code)
values (true, 60, 25, 'SYP_NEW')
on conflict (singleton) do nothing;

alter table public.delivery_pricing_settings enable row level security;
drop policy if exists delivery_pricing_settings_no_direct_access on public.delivery_pricing_settings;
create policy delivery_pricing_settings_no_direct_access
  on public.delivery_pricing_settings for all to authenticated
  using (false) with check (false);

create or replace function public.set_delivery_pricing_updated_at()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists delivery_pricing_settings_set_updated_at on public.delivery_pricing_settings;
create trigger delivery_pricing_settings_set_updated_at
before update on public.delivery_pricing_settings
for each row execute function public.set_delivery_pricing_updated_at();

create or replace function public.get_delivery_pricing_settings()
returns table (minimum_fare bigint, per_km bigint, currency_code text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select minimum_fare, per_km, currency_code, updated_at
  from public.delivery_pricing_settings
  where singleton = true;
$$;

create or replace function public.update_delivery_pricing_settings(
  p_minimum_fare bigint,
  p_per_km bigint
)
returns table (minimum_fare bigint, per_km bigint, currency_code text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_minimum_fare is null or p_minimum_fare <= 0 or p_minimum_fare > 1000000000
     or p_per_km is null or p_per_km <= 0 or p_per_km > 1000000000 then
    raise exception 'INVALID_DELIVERY_PRICING';
  end if;
  return query
  update public.delivery_pricing_settings
  set minimum_fare = p_minimum_fare,
      per_km = p_per_km,
      currency_code = 'SYP_NEW',
      updated_by = auth.uid()
  where singleton = true
  returning minimum_fare, per_km, currency_code, updated_at;
end;
$$;

revoke all on function public.get_delivery_pricing_settings() from public, anon, authenticated;
revoke all on function public.update_delivery_pricing_settings(bigint, bigint) from public, anon, authenticated;
grant execute on function public.get_delivery_pricing_settings() to service_role;
grant execute on function public.update_delivery_pricing_settings(bigint, bigint) to service_role;

commit;
