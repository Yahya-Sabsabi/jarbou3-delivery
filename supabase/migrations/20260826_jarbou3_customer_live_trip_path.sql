create table if not exists public.order_trip_points (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete cascade,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  accuracy_m numeric,
  recorded_at timestamptz not null default now()
);

create index if not exists order_trip_points_order_recorded_idx
  on public.order_trip_points (order_id, recorded_at desc);

alter table public.order_trip_points enable row level security;

create policy "assigned users read trip points"
on public.order_trip_points for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_trip_points.order_id
      and (
        o.driver_id = (select auth.uid())
        or o.customer_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
);

create or replace function public.capture_order_trip_point()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_point public.order_trip_points;
  delta_m numeric;
begin
  select * into previous_point
  from public.order_trip_points
  where order_id = new.order_id
  order by recorded_at desc
  limit 1;

  if previous_point.id is null then
    insert into public.order_trip_points (order_id, driver_id, latitude, longitude, accuracy_m, recorded_at)
    values (new.order_id, new.driver_id, new.latitude, new.longitude, new.accuracy_m, new.recorded_at);
    return new;
  end if;

  delta_m := 6371000 * 2 * asin(sqrt(
    power(sin(radians((new.latitude - previous_point.latitude) / 2)), 2)
    + cos(radians(previous_point.latitude)) * cos(radians(new.latitude))
      * power(sin(radians((new.longitude - previous_point.longitude) / 2)), 2)
  ));

  if delta_m >= 8 or new.recorded_at - previous_point.recorded_at >= interval '30 seconds' then
    insert into public.order_trip_points (order_id, driver_id, latitude, longitude, accuracy_m, recorded_at)
    values (new.order_id, new.driver_id, new.latitude, new.longitude, new.accuracy_m, new.recorded_at);
  end if;
  return new;
end;
$$;

drop trigger if exists order_live_locations_capture_trip_point on public.order_live_locations;
create trigger order_live_locations_capture_trip_point
after insert or update on public.order_live_locations
for each row execute function public.capture_order_trip_point();

create or replace function public.get_customer_order_trip_path(p_order_id uuid)
returns table (
  latitude numeric,
  longitude numeric,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (o.customer_id = auth.uid() or o.driver_id = auth.uid() or private.is_admin())
  ) then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  return query
  select points.latitude, points.longitude, points.recorded_at
  from (
    select p.latitude, p.longitude, p.recorded_at
    from public.order_trip_points p
    where p.order_id = p_order_id
    order by p.recorded_at desc
    limit 120
  ) points
  order by points.recorded_at asc;
end;
$$;

revoke all on function public.get_customer_order_trip_path(uuid) from public, anon;
grant execute on function public.get_customer_order_trip_path(uuid) to authenticated;
