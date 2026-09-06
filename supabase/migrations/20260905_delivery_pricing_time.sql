begin;

alter table public.delivery_pricing_settings
  add column if not exists per_minute bigint not null default 1
  check (per_minute >= 0 and per_minute <= 1000000000);

alter table public.orders
  add column if not exists estimated_duration_seconds integer
  check (estimated_duration_seconds is null or estimated_duration_seconds >= 0);

drop function if exists public.get_delivery_pricing_settings();
drop function if exists public.update_delivery_pricing_settings(bigint, bigint);
drop function if exists public.update_delivery_pricing_settings(bigint, bigint, bigint);

create function public.get_delivery_pricing_settings()
returns table (minimum_fare bigint, per_km bigint, per_minute bigint, currency_code text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select minimum_fare, per_km, per_minute, currency_code, updated_at
  from public.delivery_pricing_settings
  where singleton = true;
$$;

create function public.update_delivery_pricing_settings(
  p_minimum_fare bigint,
  p_per_km bigint,
  p_per_minute bigint
)
returns table (minimum_fare bigint, per_km bigint, per_minute bigint, currency_code text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_minimum_fare is null or p_minimum_fare <= 0 or p_minimum_fare > 1000000000
     or p_per_km is null or p_per_km <= 0 or p_per_km > 1000000000
     or p_per_minute is null or p_per_minute < 0 or p_per_minute > 1000000000 then
    raise exception 'INVALID_DELIVERY_PRICING';
  end if;
  return query
  update public.delivery_pricing_settings
  set minimum_fare = p_minimum_fare,
      per_km = p_per_km,
      per_minute = p_per_minute,
      currency_code = 'SYP_NEW',
      updated_by = auth.uid()
  where singleton = true
  returning minimum_fare, per_km, per_minute, currency_code, updated_at;
end;
$$;

revoke all on function public.get_delivery_pricing_settings() from public, anon, authenticated;
revoke all on function public.update_delivery_pricing_settings(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.get_delivery_pricing_settings() to service_role;
grant execute on function public.update_delivery_pricing_settings(bigint, bigint, bigint) to service_role;

commit;
