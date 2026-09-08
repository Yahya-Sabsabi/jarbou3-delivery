-- OPTIMUS X: separate driver acceptance from trip start.
-- The driver may start only after the server verifies proximity to pickup.

alter type public.order_status add value if not exists 'started';

alter table public.orders
  add column if not exists started_at timestamptz;

create or replace function public.start_trip(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders;
  driver_lat numeric;
  driver_lng numeric;
  pickup_distance_m numeric;
begin
  if not public.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  select o.* into target_order
  from public.orders o
  where o.id = p_order_id
    and o.driver_id = auth.uid()
    and o.status = 'accepted'
  for update;

  if target_order.id is null then
    raise exception 'TRIP_NOT_READY';
  end if;

  select u.last_location_lat, u.last_location_lng
    into driver_lat, driver_lng
  from public.users u
  where u.id = auth.uid();

  if driver_lat is null or driver_lng is null then
    raise exception 'DRIVER_LOCATION_REQUIRED';
  end if;

  pickup_distance_m := 6371000 * 2 * asin(sqrt(
    power(sin(radians((target_order.source_lat - driver_lat) / 2)), 2)
    + cos(radians(driver_lat)) * cos(radians(target_order.source_lat))
      * power(sin(radians((target_order.source_lng - driver_lng) / 2)), 2)
  ));

  if pickup_distance_m > 250 then
    raise exception 'DRIVER_NOT_AT_PICKUP';
  end if;

  update public.orders
  set status = 'started', started_at = now()
  where id = target_order.id
  returning * into target_order;

  return target_order;
end;
$$;

grant execute on function public.start_trip(uuid) to authenticated;

create or replace function public.verify_delivery_otp(p_order_id uuid, p_otp text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.orders
  set otp_verified_at = now(), status = 'delivered', delivered_at = now()
  where id = p_order_id
    and driver_id = auth.uid()
    and status in ('started', 'arriving', 'awaiting_otp')
    and delivery_otp_hash is not null
    and crypt(p_otp, delivery_otp_hash) = delivery_otp_hash;
  return found;
end;
$$;

grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;
