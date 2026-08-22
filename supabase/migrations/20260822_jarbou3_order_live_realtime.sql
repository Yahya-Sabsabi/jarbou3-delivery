create table public.order_live_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete cascade,
  latitude numeric(9,6) not null check (latitude between 35.04 and 35.23),
  longitude numeric(9,6) not null check (longitude between 36.60 and 36.91),
  accuracy_m numeric(7,2),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_live_locations_driver_updated_idx on public.order_live_locations (driver_id, updated_at desc);

alter table public.order_live_locations enable row level security;

create policy "customers and drivers read assigned live locations"
on public.order_live_locations
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_live_locations.order_id
      and o.status in ('accepted', 'arriving', 'awaiting_otp')
      and (
        o.customer_id = auth.uid()
        or o.driver_id = auth.uid()
      )
  )
);

create or replace function public.record_own_driver_live_location(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric default null
)
returns public.order_live_locations
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  active_order_id uuid;
  updated_location public.order_live_locations;
  distance_m numeric;
begin
  if not private.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  distance_m := 6371000 * 2 * asin(sqrt(
    power(sin(radians((p_lat - 35.1319) / 2)), 2)
    + cos(radians(35.1319)) * cos(radians(p_lat)) * power(sin(radians((p_lng - 36.7547) / 2)), 2)
  ));

  if p_lat not between 35.04 and 35.23
    or p_lng not between 36.60 and 36.91
    or distance_m > 7000 then
    raise exception 'OUTSIDE_HAMA_SERVICE_RADIUS';
  end if;

  if p_accuracy is not null and (p_accuracy < 0 or p_accuracy > 80) then
    raise exception 'LOCATION_QUALITY_TOO_LOW';
  end if;

  update public.users
  set last_location_lat = p_lat,
      last_location_lng = p_lng,
      last_location_at = now()
  where id = auth.uid();

  select id into active_order_id
  from public.orders
  where driver_id = auth.uid()
    and status in ('accepted', 'arriving', 'awaiting_otp')
  order by accepted_at desc nulls last
  limit 1;

  if active_order_id is null then
    return null;
  end if;

  insert into public.order_live_locations (order_id, driver_id, latitude, longitude, accuracy_m, recorded_at, updated_at)
  values (active_order_id, auth.uid(), p_lat, p_lng, p_accuracy, now(), now())
  on conflict (order_id) do update
  set driver_id = excluded.driver_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_m = excluded.accuracy_m,
      recorded_at = excluded.recorded_at,
      updated_at = excluded.updated_at
  returning * into updated_location;

  return updated_location;
end;
$$;

revoke all on function public.record_own_driver_live_location(numeric, numeric, numeric) from public, anon;
grant execute on function public.record_own_driver_live_location(numeric, numeric, numeric) to authenticated;
revoke execute on function public.update_own_driver_location(numeric, numeric) from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime' and pr.prrelid = 'public.order_live_locations'::regclass
  ) then
    alter publication supabase_realtime add table public.order_live_locations;
  end if;

  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime' and pr.prrelid = 'public.orders'::regclass
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
