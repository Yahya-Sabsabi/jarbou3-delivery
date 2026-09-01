begin;

create table if not exists public.jarbou3_places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  latitude numeric(9,6) not null check (latitude between 35.04 and 35.23),
  longitude numeric(9,6) not null check (longitude between 36.60 and 36.91),
  is_active boolean not null default true,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarbou3_places_active_name_idx on public.jarbou3_places (is_active, name);
create index if not exists jarbou3_places_geo_idx on public.jarbou3_places (latitude, longitude);

alter table public.jarbou3_places enable row level security;
drop policy if exists jarbou3_places_read_active on public.jarbou3_places;
drop policy if exists jarbou3_places_admin_write on public.jarbou3_places;
create policy jarbou3_places_read_active on public.jarbou3_places for select to authenticated using (is_active or private.is_admin());
create policy jarbou3_places_admin_write on public.jarbou3_places for all to authenticated using (private.is_admin()) with check (private.is_admin());

create or replace function public.set_jarbou3_places_updated_at()
returns trigger language plpgsql set search_path = public, private, pg_temp
as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists jarbou3_places_set_updated_at on public.jarbou3_places;
create trigger jarbou3_places_set_updated_at before update on public.jarbou3_places for each row execute function public.set_jarbou3_places_updated_at();

create or replace function public.list_jarbou3_places(p_query text default null)
returns table (id uuid, name text, latitude numeric, longitude numeric)
language sql stable security invoker set search_path = public, private, pg_temp
as $$
  select p.id, p.name, p.latitude, p.longitude
  from public.jarbou3_places p
  where p.is_active
    and (nullif(trim(p_query), '') is null or p.name ilike '%' || left(trim(p_query), 160) || '%')
  order by p.name asc
  limit 100;
$$;

create or replace function public.admin_list_jarbou3_places()
returns table (id uuid, name text, latitude numeric, longitude numeric, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public, private, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query select p.id, p.name, p.latitude, p.longitude, p.is_active, p.created_at, p.updated_at from public.jarbou3_places p order by p.updated_at desc;
end;
$$;

create or replace function public.admin_create_jarbou3_place(p_name text, p_latitude numeric, p_longitude numeric)
returns public.jarbou3_places
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare place_row public.jarbou3_places;
begin
  if auth.role() <> 'service_role' and not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_name is null or char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 160 then raise exception 'INVALID_PLACE_NAME'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between 35.04 and 35.23 or p_longitude not between 36.60 and 36.91 then raise exception 'PLACE_OUTSIDE_HAMA'; end if;
  insert into public.jarbou3_places (name, latitude, longitude, created_by) values (trim(p_name), p_latitude, p_longitude, auth.uid()) returning * into place_row;
  return place_row;
end;
$$;

create or replace function public.admin_set_jarbou3_place_active(p_id uuid, p_is_active boolean)
returns boolean
language plpgsql security definer set search_path = public, private, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.jarbou3_places set is_active = coalesce(p_is_active, false) where id = p_id;
  return found;
end;
$$;

revoke all on table public.jarbou3_places from public, anon, authenticated;
revoke all on function public.list_jarbou3_places(text) from public, anon;
revoke all on function public.admin_list_jarbou3_places() from public, anon, authenticated;
revoke all on function public.admin_create_jarbou3_place(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.admin_set_jarbou3_place_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.list_jarbou3_places(text) to authenticated;
grant execute on function public.admin_list_jarbou3_places() to authenticated;
grant execute on function public.admin_create_jarbou3_place(text, numeric, numeric) to authenticated;
grant execute on function public.admin_set_jarbou3_place_active(uuid, boolean) to authenticated;

commit;
