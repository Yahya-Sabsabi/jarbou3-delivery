alter table public.orders
  add column if not exists offered_driver_id uuid references public.users(id),
  add column if not exists offer_started_at timestamptz,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists offer_round integer not null default 0 check (offer_round >= 0);

create index if not exists orders_offer_queue_idx
  on public.orders (status, offered_driver_id, offer_expires_at, created_at asc)
  where status = 'requested' and driver_id is null;

create table if not exists public.order_trip_metrics (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_lat numeric(9,6) not null,
  last_lng numeric(9,6) not null,
  last_recorded_at timestamptz not null,
  actual_distance_m numeric(12,2) not null default 0 check (actual_distance_m >= 0),
  moving_seconds integer not null default 0 check (moving_seconds >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists order_trip_metrics_driver_idx
  on public.order_trip_metrics (driver_id, updated_at desc);

alter table public.order_trip_metrics enable row level security;

drop policy if exists "assigned users read trip metrics" on public.order_trip_metrics;
create policy "assigned users read trip metrics"
on public.order_trip_metrics for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_trip_metrics.order_id
      and (o.driver_id = auth.uid() or o.customer_id = auth.uid() or private.is_admin())
  )
);

create or replace function public.list_driver_order_offers()
returns table (
  id uuid,
  source_address text,
  source_lat numeric,
  source_lng numeric,
  destination_address text,
  destination_lat numeric,
  destination_lng numeric,
  estimated_price integer,
  payment_method public.payment_method,
  distance_m integer,
  distance_to_pickup_m numeric,
  offer_expires_at timestamptz,
  offer_round integer
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_driver_lat numeric;
  v_driver_lng numeric;
  v_order public.orders;
begin
  if not private.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  select last_location_lat, last_location_lng
  into v_driver_lat, v_driver_lng
  from public.users
  where id = auth.uid();

  if v_driver_lat is null or v_driver_lng is null then
    return;
  end if;

  update public.orders
  set offered_driver_id = null,
      offer_started_at = null,
      offer_expires_at = null,
      offer_round = offer_round + 1
  where status = 'requested'
    and driver_id is null
    and offer_expires_at is not null
    and offer_expires_at <= now();

  select o.* into v_order
  from public.orders o
  where o.status = 'requested'
    and o.driver_id is null
    and o.offered_driver_id = auth.uid()
    and o.offer_expires_at > now()
  order by o.offer_expires_at asc
  limit 1;

  if v_order.id is null then
    select o.* into v_order
    from public.orders o
    where o.status = 'requested'
      and o.driver_id is null
      and o.offered_driver_id is null
      and not exists (
        select 1 from public.driver_order_declines d
        where d.order_id = o.id and d.driver_id = auth.uid()
      )
    order by
      6371000 * 2 * asin(sqrt(
        power(sin(radians((o.source_lat - v_driver_lat) / 2)), 2)
        + cos(radians(v_driver_lat)) * cos(radians(o.source_lat))
          * power(sin(radians((o.source_lng - v_driver_lng) / 2)), 2)
      )),
      o.created_at asc
    limit 1;

    if v_order.id is null then
      return;
    end if;

    update public.orders
    set offered_driver_id = auth.uid(),
        offer_started_at = now(),
        offer_expires_at = now() + interval '20 seconds',
        offer_round = offer_round + 1
    where id = v_order.id
      and status = 'requested'
      and driver_id is null
      and offered_driver_id is null
    returning * into v_order;

    if v_order.id is null then
      return;
    end if;
  end if;

  return query
  select
    v_order.id,
    v_order.source_address,
    v_order.source_lat,
    v_order.source_lng,
    v_order.destination_address,
    v_order.destination_lat,
    v_order.destination_lng,
    v_order.estimated_price,
    v_order.payment_method,
    v_order.distance_m,
    6371000 * 2 * asin(sqrt(
      power(sin(radians((v_order.source_lat - v_driver_lat) / 2)), 2)
      + cos(radians(v_driver_lat)) * cos(radians(v_order.source_lat))
        * power(sin(radians((v_order.source_lng - v_driver_lng) / 2)), 2)
    )),
    v_order.offer_expires_at,
    v_order.offer_round;
end;
$$;

create or replace function public.decline_order_offer(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  insert into public.driver_order_declines (driver_id, order_id)
  values (auth.uid(), p_order_id)
  on conflict (driver_id, order_id) do nothing;

  update public.orders
  set offered_driver_id = null,
      offer_started_at = null,
      offer_expires_at = null,
      offer_round = offer_round + 1
  where id = p_order_id
    and status = 'requested'
    and driver_id is null
    and offered_driver_id = auth.uid();

  return true;
end;
$$;

create or replace function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare accepted_order public.orders;
begin
  if not private.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  update public.orders
  set driver_id = auth.uid(),
      status = 'accepted',
      accepted_at = now(),
      offered_driver_id = null,
      offer_started_at = null,
      offer_expires_at = null
  where id = p_order_id
    and status = 'requested'
    and driver_id is null
    and offered_driver_id = auth.uid()
    and offer_expires_at > now()
  returning * into accepted_order;

  if accepted_order.id is null then
    raise exception 'ORDER_UNAVAILABLE';
  end if;
  return accepted_order;
end;
$$;

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
  hama_distance_m numeric;
  metrics public.order_trip_metrics;
  segment_m numeric := 0;
  elapsed_s integer := 0;
begin
  if not private.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  hama_distance_m := 6371000 * 2 * asin(sqrt(
    power(sin(radians((p_lat - 35.1319) / 2)), 2)
    + cos(radians(35.1319)) * cos(radians(p_lat)) * power(sin(radians((p_lng - 36.7547) / 2)), 2)
  ));

  if p_lat not between 35.04 and 35.23
    or p_lng not between 36.60 and 36.91
    or hama_distance_m > 7000 then
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

  select * into metrics
  from public.order_trip_metrics
  where order_id = active_order_id
  for update;

  if metrics.order_id is null then
    insert into public.order_trip_metrics (order_id, driver_id, started_at, last_lat, last_lng, last_recorded_at)
    values (active_order_id, auth.uid(), now(), p_lat, p_lng, now());
  else
    elapsed_s := greatest(0, extract(epoch from now() - metrics.last_recorded_at)::integer);
    segment_m := 6371000 * 2 * asin(sqrt(
      power(sin(radians((p_lat - metrics.last_lat) / 2)), 2)
      + cos(radians(metrics.last_lat)) * cos(radians(p_lat)) * power(sin(radians((p_lng - metrics.last_lng) / 2)), 2)
    ));

    update public.order_trip_metrics
    set actual_distance_m = actual_distance_m + case
          when elapsed_s between 1 and 300 and segment_m between 3 and greatest(250, elapsed_s * 55) then segment_m
          else 0
        end,
        moving_seconds = moving_seconds + case
          when elapsed_s between 1 and 300 and segment_m between 3 and greatest(250, elapsed_s * 55) then elapsed_s
          else 0
        end,
        last_lat = p_lat,
        last_lng = p_lng,
        last_recorded_at = now(),
        updated_at = now()
    where order_id = active_order_id;
  end if;

  return updated_location;
end;
$$;

create or replace function public.get_own_active_trip_metrics()
returns table (
  order_id uuid,
  actual_distance_m numeric,
  moving_seconds integer,
  elapsed_seconds integer,
  last_recorded_at timestamptz
)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select
    m.order_id,
    m.actual_distance_m,
    m.moving_seconds,
    greatest(0, extract(epoch from now() - coalesce(o.accepted_at, m.started_at))::integer),
    m.last_recorded_at
  from public.order_trip_metrics m
  join public.orders o on o.id = m.order_id
  where m.driver_id = auth.uid()
    and o.status in ('accepted', 'arriving', 'awaiting_otp')
  order by o.accepted_at desc nulls last
  limit 1;
$$;

create or replace function public.verify_delivery_otp(p_order_id uuid, p_otp text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.orders
  set otp_verified_at = now(),
      status = 'delivered',
      delivered_at = now(),
      actual_time_seconds = greatest(0, extract(epoch from now() - accepted_at)::integer)
  where id = p_order_id
    and driver_id = auth.uid()
    and status in ('accepted', 'arriving', 'awaiting_otp')
    and delivery_otp_hash is not null
    and crypt(p_otp, delivery_otp_hash) = delivery_otp_hash;
  return found;
end;
$$;

revoke all on function public.list_driver_order_offers() from public, anon;
revoke all on function public.decline_order_offer(uuid) from public, anon;
revoke all on function public.get_own_active_trip_metrics() from public, anon;
revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.record_own_driver_live_location(numeric, numeric, numeric) from public, anon;
revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
grant execute on function public.list_driver_order_offers() to authenticated;
grant execute on function public.decline_order_offer(uuid) to authenticated;
grant execute on function public.get_own_active_trip_metrics() to authenticated;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.record_own_driver_live_location(numeric, numeric, numeric) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;
