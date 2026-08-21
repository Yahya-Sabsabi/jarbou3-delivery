-- Jarbou3 Delivery: core data model, private storage and Row Level Security.
-- Password credentials remain in Supabase Auth; no application password hashes are stored here.

create extension if not exists pgcrypto;

create type public.user_role as enum ('customer', 'driver', 'admin');
create type public.driver_verification_status as enum ('pending', 'approved', 'rejected');
create type public.order_status as enum ('requested', 'accepted', 'arriving', 'awaiting_otp', 'delivered', 'cancelled');
create type public.payment_method as enum ('cash', 'sham_cash');
create type public.settlement_method as enum ('cash', 'sham_cash');
create type public.report_status as enum ('generating', 'ready', 'download_confirmed', 'purged', 'failed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'مستخدم جربوع' check (char_length(name) between 2 and 100),
  phone text unique check (phone is null or phone ~ '^\\+?[0-9]{8,16}$'),
  role public.user_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drivers_verification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  personal_photo_path text not null,
  id_photo_path text not null,
  status public.driver_verification_status not null default 'pending',
  activation_code_hash text,
  activated_at timestamptz,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  rejection_reason text check (char_length(coalesce(rejection_reason, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id),
  driver_id uuid references public.users(id),
  source_address text not null check (char_length(source_address) between 3 and 300),
  source_lat numeric(9,6) not null,
  source_lng numeric(9,6) not null,
  destination_address text not null check (char_length(destination_address) between 3 and 300),
  destination_lat numeric(9,6) not null,
  destination_lng numeric(9,6) not null,
  estimated_price integer not null check (estimated_price >= 0),
  final_price integer check (final_price >= 0),
  payment_method public.payment_method not null,
  status public.order_status not null default 'requested',
  distance_m integer not null check (distance_m >= 0),
  actual_time_seconds integer check (actual_time_seconds >= 0),
  delivery_otp_hash text,
  otp_verified_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_in_hama check (source_lat between 35.04 and 35.23 and source_lng between 36.60 and 36.91),
  constraint destination_in_hama check (destination_lat between 35.04 and 35.23 and destination_lng between 36.60 and 36.91)
);

create table public.order_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  photo_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (order_id, photo_path)
);

create table public.driver_shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id),
  shift_date date not null,
  total_amount integer not null default 0 check (total_amount >= 0),
  settlement_method public.settlement_method,
  is_closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, shift_date)
);

create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  report_month date not null unique check (report_month = date_trunc('month', report_month)::date),
  storage_path text,
  status public.report_status not null default 'generating',
  generated_at timestamptz,
  downloaded_at timestamptz,
  downloaded_by uuid references public.users(id),
  purge_started_at timestamptz,
  purged_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_driver_status_idx on public.orders (driver_id, status, created_at desc);
create index orders_requested_idx on public.orders (status, created_at desc) where status = 'requested';
create index order_photos_order_idx on public.order_photos (order_id);
create index driver_shifts_driver_date_idx on public.driver_shifts (driver_id, shift_date desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger driver_verification_set_updated_at before update on public.drivers_verification for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger shifts_set_updated_at before update on public.driver_shifts for each row execute function public.set_updated_at();
create trigger reports_set_updated_at before update on public.monthly_reports for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name, phone, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'مستخدم جربوع'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

create or replace function public.is_active_driver()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.users u
    join public.drivers_verification v on v.user_id = u.id
    where u.id = auth.uid()
      and u.role = 'driver'
      and u.is_active = true
      and v.status = 'approved'
      and v.activated_at is not null
  );
$$;

create or replace function public.accept_order(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare accepted_order public.orders;
begin
  if not public.is_active_driver() then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  update public.orders
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = p_order_id and status = 'requested' and driver_id is null
  returning * into accepted_order;

  if accepted_order.id is null then
    raise exception 'ORDER_UNAVAILABLE';
  end if;
  return accepted_order;
end;
$$;

create or replace function public.verify_delivery_otp(p_order_id uuid, p_otp text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.orders
  set otp_verified_at = now(), status = 'delivered', delivered_at = now()
  where id = p_order_id
    and driver_id = auth.uid()
    and status in ('accepted', 'arriving', 'awaiting_otp')
    and delivery_otp_hash is not null
    and crypt(p_otp, delivery_otp_hash) = delivery_otp_hash;
  return found;
end;
$$;

create or replace function public.confirm_monthly_report_download(p_report_id uuid)
returns public.monthly_reports language plpgsql security definer set search_path = public as $$
declare confirmed_report public.monthly_reports;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  update public.monthly_reports
  set status = 'download_confirmed', downloaded_at = now(), downloaded_by = auth.uid()
  where id = p_report_id and status = 'ready'
  returning * into confirmed_report;
  if confirmed_report.id is null then
    raise exception 'REPORT_NOT_READY';
  end if;
  return confirmed_report;
end;
$$;

grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;
grant execute on function public.confirm_monthly_report_download(uuid) to authenticated;

alter table public.users enable row level security;
alter table public.drivers_verification enable row level security;
alter table public.orders enable row level security;
alter table public.order_photos enable row level security;
alter table public.driver_shifts enable row level security;
alter table public.monthly_reports enable row level security;

create policy users_select_own_or_admin on public.users for select to authenticated using (id = auth.uid() or public.is_admin());
create policy users_update_admin_only on public.users for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy driver_verification_select_own_or_admin on public.drivers_verification for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy driver_verification_insert_own on public.drivers_verification for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy driver_verification_admin_manage on public.drivers_verification for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy orders_select_customer_driver_admin on public.orders for select to authenticated using (customer_id = auth.uid() or driver_id = auth.uid() or (driver_id is null and public.is_active_driver()) or public.is_admin());
create policy orders_insert_customer_only on public.orders for insert to authenticated with check (customer_id = auth.uid() and status = 'requested');
create policy orders_admin_manage on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy order_photos_select_owner_or_admin on public.order_photos for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or o.driver_id = auth.uid())
  )
);
create policy order_photos_insert_assigned_driver on public.order_photos for insert to authenticated with check (
  uploaded_by = auth.uid() and exists (
    select 1 from public.orders o where o.id = order_id and o.driver_id = auth.uid() and o.status = 'delivered'
  )
);
create policy order_photos_admin_manage on public.order_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy shifts_select_owner_or_admin on public.driver_shifts for select to authenticated using (driver_id = auth.uid() or public.is_admin());
create policy shifts_admin_manage on public.driver_shifts for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy reports_admin_only on public.monthly_reports for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jarbou3-private', 'jarbou3-private', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No direct storage.objects policy is created. The client accesses private identity and order media only through signed URLs issued after server-side role and ownership checks.
