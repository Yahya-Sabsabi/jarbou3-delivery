alter table public.users
  add column if not exists vehicle_type text;

alter table public.users
  drop constraint if exists users_vehicle_type_check;

alter table public.users
  add constraint users_vehicle_type_check
  check (vehicle_type is null or vehicle_type in ('motorcycle', 'electric_scooter'));

update public.users u
set vehicle_type = r.vehicle_type
from public.account_verification_requests r
where r.auth_user_id = u.id
  and u.role = 'driver'
  and u.vehicle_type is null
  and r.vehicle_type in ('motorcycle', 'electric_scooter');
