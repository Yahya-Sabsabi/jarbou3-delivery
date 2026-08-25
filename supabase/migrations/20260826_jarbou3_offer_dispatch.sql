create or replace function public.assign_next_driver_offer(p_order_id uuid)
returns table (
  driver_id uuid,
  offer_expires_at timestamptz,
  offer_round integer,
  assigned_now boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_order public.orders;
  next_driver_id uuid;
begin
  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if target_order.id is null
    or target_order.status <> 'requested'
    or target_order.driver_id is not null then
    return;
  end if;

  if target_order.offered_driver_id is not null
    and target_order.offer_expires_at > now() then
    return query select target_order.offered_driver_id, target_order.offer_expires_at, target_order.offer_round, false;
    return;
  end if;

  if target_order.offered_driver_id is not null then
    update public.orders
    set offered_driver_id = null,
        offer_started_at = null,
        offer_expires_at = null
    where id = target_order.id;
  end if;

  select u.id into next_driver_id
  from public.users u
  join public.drivers_verification v on v.user_id = u.id
  where u.role = 'driver'
    and u.is_active = true
    and v.status = 'approved'
    and v.activated_at is not null
    and u.last_location_lat is not null
    and u.last_location_lng is not null
    and u.last_location_at > now() - interval '2 minutes'
    and not exists (
      select 1 from public.driver_order_declines d
      where d.order_id = target_order.id and d.driver_id = u.id
    )
  order by
    6371000 * 2 * asin(sqrt(
      power(sin(radians((target_order.source_lat - u.last_location_lat) / 2)), 2)
      + cos(radians(u.last_location_lat)) * cos(radians(target_order.source_lat))
        * power(sin(radians((target_order.source_lng - u.last_location_lng) / 2)), 2)
    )),
    u.last_location_at desc
  limit 1;

  if next_driver_id is null then
    return;
  end if;

  update public.orders
  set offered_driver_id = next_driver_id,
      offer_started_at = now(),
      offer_expires_at = now() + interval '20 seconds',
      offer_round = offer_round + 1
  where id = target_order.id
    and status = 'requested'
    and driver_id is null
  returning offered_driver_id, orders.offer_expires_at, orders.offer_round
  into driver_id, offer_expires_at, offer_round;

  assigned_now := true;
  return next;
end;
$$;

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

  return query
  select
    o.id,
    o.source_address,
    o.source_lat,
    o.source_lng,
    o.destination_address,
    o.destination_lat,
    o.destination_lng,
    o.estimated_price,
    o.payment_method,
    o.distance_m,
    6371000 * 2 * asin(sqrt(
      power(sin(radians((o.source_lat - v_driver_lat) / 2)), 2)
      + cos(radians(v_driver_lat)) * cos(radians(o.source_lat))
        * power(sin(radians((o.source_lng - v_driver_lng) / 2)), 2)
    )),
    o.offer_expires_at,
    o.offer_round
  from public.orders o
  where o.status = 'requested'
    and o.driver_id is null
    and o.offered_driver_id = auth.uid()
    and o.offer_expires_at > now()
  order by o.offer_expires_at asc
  limit 1;
end;
$$;

revoke all on function public.assign_next_driver_offer(uuid) from public, anon, authenticated;
grant execute on function public.assign_next_driver_offer(uuid) to service_role;
