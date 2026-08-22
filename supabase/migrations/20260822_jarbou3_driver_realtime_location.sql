alter table public.users
  add column if not exists last_location_lat numeric(9,6),
  add column if not exists last_location_lng numeric(9,6),
  add column if not exists last_location_at timestamptz;

alter table public.users
  drop constraint if exists users_location_pair_check;

alter table public.users
  add constraint users_location_pair_check check (
    (last_location_lat is null and last_location_lng is null and last_location_at is null)
    or (
      last_location_lat between 35.04 and 35.23
      and last_location_lng between 36.60 and 36.91
      and last_location_at is not null
    )
  );

create or replace function public.update_own_driver_location(p_lat numeric, p_lng numeric)
returns public.users
language plpgsql security definer set search_path = public, pg_temp as $$
declare updated_user public.users;
declare distance_m numeric;
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

  update public.users
  set last_location_lat = p_lat,
      last_location_lng = p_lng,
      last_location_at = now()
  where id = auth.uid()
  returning * into updated_user;
  return updated_user;
end;
$$;

revoke all on function public.update_own_driver_location(numeric, numeric) from public, anon;
grant execute on function public.update_own_driver_location(numeric, numeric) to authenticated;

create policy users_select_order_driver_location on public.users
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.driver_id = users.id
        and o.customer_id = auth.uid()
        and o.status in ('accepted', 'arriving', 'awaiting_otp')
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime' and pr.prrelid = 'public.users'::regclass
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
end;
$$;
