begin;

create table if not exists public.driver_wallet_accounts (
  driver_id uuid primary key references public.users(id) on delete restrict,
  balance_amount bigint not null default 0,
  grace_started_at timestamptz not null default now(),
  grace_ends_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_wallet_grace_order check (grace_ends_at > grace_started_at)
);

create table if not exists public.driver_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  entry_type text not null check (entry_type in ('deposit', 'commission', 'refund', 'adjustment')),
  amount_signed bigint not null check (amount_signed <> 0),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.driver_wallet_holds (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  estimated_commission bigint not null default 0 check (estimated_commission >= 0),
  status text not null default 'held' check (status in ('held', 'released', 'consumed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists driver_wallet_ledger_driver_created_idx
  on public.driver_wallet_ledger (driver_id, created_at desc);
create index if not exists driver_wallet_ledger_order_idx
  on public.driver_wallet_ledger (order_id)
  where order_id is not null;
create index if not exists driver_wallet_holds_driver_status_idx
  on public.driver_wallet_holds (driver_id, status);

alter table public.driver_wallet_accounts enable row level security;
alter table public.driver_wallet_ledger enable row level security;
alter table public.driver_wallet_holds enable row level security;

drop policy if exists driver_wallet_accounts_no_direct_access on public.driver_wallet_accounts;
drop policy if exists driver_wallet_ledger_no_direct_access on public.driver_wallet_ledger;
drop policy if exists driver_wallet_holds_no_direct_access on public.driver_wallet_holds;
create policy driver_wallet_accounts_no_direct_access on public.driver_wallet_accounts for all to authenticated using (false) with check (false);
create policy driver_wallet_ledger_no_direct_access on public.driver_wallet_ledger for all to authenticated using (false) with check (false);
create policy driver_wallet_holds_no_direct_access on public.driver_wallet_holds for all to authenticated using (false) with check (false);

create or replace function public.set_driver_wallet_updated_at()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists driver_wallet_accounts_set_updated_at on public.driver_wallet_accounts;
create trigger driver_wallet_accounts_set_updated_at
before update on public.driver_wallet_accounts
for each row execute function public.set_driver_wallet_updated_at();

create or replace function public.driver_wallet_available(p_driver_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(a.balance_amount, 0) - coalesce(sum(case when h.status = 'held' then h.estimated_commission else 0 end), 0)::bigint
  from public.driver_wallet_accounts a
  left join public.driver_wallet_holds h on h.driver_id = a.driver_id
  where a.driver_id = p_driver_id
  group by a.balance_amount;
$$;

create or replace function public.driver_wallet_commission_rate(p_driver_id uuid, p_at timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case when a.grace_ends_at > coalesce(p_at, now()) then 0::numeric else 0.10::numeric end
  from public.driver_wallet_accounts a
  where a.driver_id = p_driver_id;
$$;

create or replace function public.driver_can_receive_order(p_driver_id uuid, p_estimated_price integer)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(public.driver_wallet_available(p_driver_id), 0) >= 10000
     and coalesce(public.driver_wallet_available(p_driver_id), 0) >= case
       when coalesce(public.driver_wallet_commission_rate(p_driver_id), 0) = 0 then 0
       else floor(greatest(coalesce(p_estimated_price, 0), 0)::numeric * 0.10)::bigint
     end;
$$;

create or replace function public.record_driver_wallet_deposit(
  p_driver_id uuid,
  p_amount bigint,
  p_note text default null
)
returns public.driver_wallet_accounts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  account public.driver_wallet_accounts;
begin
  if auth.role() <> 'service_role' and not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'INVALID_DEPOSIT_AMOUNT';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_driver_id::text));
  if not exists (select 1 from public.users where id = p_driver_id and role = 'driver') then
    raise exception 'DRIVER_NOT_FOUND';
  end if;
  insert into public.driver_wallet_accounts (driver_id)
  values (p_driver_id)
  on conflict (driver_id) do nothing;
  update public.driver_wallet_accounts
  set balance_amount = balance_amount + p_amount
  where driver_id = p_driver_id
  returning * into account;
  insert into public.driver_wallet_ledger (driver_id, entry_type, amount_signed, note, created_by)
  values (p_driver_id, 'deposit', p_amount, nullif(trim(p_note), ''), auth.uid());
  return account;
end;
$$;

create or replace function public.get_own_driver_wallet()
returns table (
  balance_amount bigint,
  held_amount bigint,
  available_amount bigint,
  grace_ends_at timestamptz,
  grace_active boolean
)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select
    coalesce(a.balance_amount, 0),
    coalesce(sum(case when h.status = 'held' then h.estimated_commission else 0 end), 0)::bigint,
    coalesce(a.balance_amount, 0) - coalesce(sum(case when h.status = 'held' then h.estimated_commission else 0 end), 0)::bigint,
    a.grace_ends_at,
    a.grace_ends_at > now()
  from public.driver_wallet_accounts a
  left join public.driver_wallet_holds h on h.driver_id = a.driver_id
  where a.driver_id = auth.uid()
  group by a.balance_amount, a.grace_ends_at;
$$;

create or replace function public.list_driver_wallets()
returns table (
  driver_id uuid,
  driver_name text,
  balance_amount bigint,
  held_amount bigint,
  available_amount bigint,
  grace_ends_at timestamptz,
  grace_active boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  return query
  select u.id, u.name, coalesce(a.balance_amount, 0),
    coalesce(sum(case when h.status = 'held' then h.estimated_commission else 0 end), 0)::bigint,
    coalesce(a.balance_amount, 0) - coalesce(sum(case when h.status = 'held' then h.estimated_commission else 0 end), 0)::bigint,
    a.grace_ends_at, coalesce(a.grace_ends_at > now(), false)
  from public.users u
  left join public.driver_wallet_accounts a on a.driver_id = u.id
  left join public.driver_wallet_holds h on h.driver_id = u.id
  where u.role = 'driver'
  group by u.id, u.name, a.balance_amount, a.grace_ends_at
  order by coalesce(a.balance_amount, 0) - coalesce(sum(case when h.status = 'held' then h.estimated_commission else 0 end), 0);
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
  v_order public.orders;
begin
  if not private.is_active_driver() then raise exception 'DRIVER_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.driver_wallet_accounts where driver_id = auth.uid()) then return; end if;
  select last_location_lat, last_location_lng into v_driver_lat, v_driver_lng from public.users where id = auth.uid();
  if v_driver_lat is null or v_driver_lng is null then return; end if;
  update public.orders set offered_driver_id = null, offer_started_at = null, offer_expires_at = null, offer_round = offer_round + 1
  where status = 'requested' and driver_id is null and offer_expires_at is not null and offer_expires_at <= now();
  select o.* into v_order from public.orders o
  where o.status = 'requested' and o.driver_id is null and o.offered_driver_id = auth.uid() and o.offer_expires_at > now()
    and public.driver_can_receive_order(auth.uid(), o.estimated_price)
  order by o.offer_expires_at asc limit 1;
  if v_order.id is null then
    select o.* into v_order from public.orders o
    where o.status = 'requested' and o.driver_id is null and o.offered_driver_id is null
      and not exists (select 1 from public.driver_order_declines d where d.order_id = o.id and d.driver_id = auth.uid())
      and public.driver_can_receive_order(auth.uid(), o.estimated_price)
    order by 6371000 * 2 * asin(sqrt(power(sin(radians((o.source_lat - v_driver_lat) / 2)), 2) + cos(radians(v_driver_lat)) * cos(radians(o.source_lat)) * power(sin(radians((o.source_lng - v_driver_lng) / 2)), 2))), o.created_at asc
    limit 1;
    if v_order.id is null then return; end if;
    update public.orders set offered_driver_id = auth.uid(), offer_started_at = now(), offer_expires_at = now() + interval '20 seconds', offer_round = offer_round + 1
    where id = v_order.id and status = 'requested' and driver_id is null and offered_driver_id is null returning * into v_order;
    if v_order.id is null then return; end if;
  end if;
  return query select v_order.id, v_order.source_address, v_order.source_lat, v_order.source_lng, v_order.destination_address, v_order.destination_lat, v_order.destination_lng, v_order.estimated_price, v_order.payment_method, v_order.distance_m,
    6371000 * 2 * asin(sqrt(power(sin(radians((v_order.source_lat - v_driver_lat) / 2)), 2) + cos(radians(v_driver_lat)) * cos(radians(v_order.source_lat)) * power(sin(radians((v_order.source_lng - v_driver_lng) / 2)), 2))), v_order.offer_expires_at, v_order.offer_round;
end;
$$;

create or replace function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  accepted_order public.orders;
  estimated_commission bigint;
  available_amount bigint;
begin
  if not private.is_active_driver() then raise exception 'DRIVER_NOT_ACTIVE'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select public.driver_wallet_available(auth.uid()) into available_amount;
  select floor(greatest(estimated_price, 0)::numeric * 0.10)::bigint into estimated_commission from public.orders where id = p_order_id;
  if not public.driver_can_receive_order(auth.uid(), coalesce((select estimated_price from public.orders where id = p_order_id), 0)) then raise exception 'DRIVER_WALLET_INSUFFICIENT'; end if;
  if coalesce(public.driver_wallet_commission_rate(auth.uid()), 0) = 0 then estimated_commission := 0; end if;
  update public.orders set driver_id = auth.uid(), status = 'accepted', accepted_at = now(), offered_driver_id = null, offer_started_at = null, offer_expires_at = null
  where id = p_order_id and status = 'requested' and driver_id is null and offered_driver_id = auth.uid() and offer_expires_at > now()
  returning * into accepted_order;
  if accepted_order.id is null then raise exception 'ORDER_UNAVAILABLE'; end if;
  insert into public.driver_wallet_holds (driver_id, order_id, estimated_commission) values (auth.uid(), accepted_order.id, estimated_commission);
  return accepted_order;
end;
$$;

create or replace function public.verify_delivery_otp(p_order_id uuid, p_otp text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.orders;
  v_hold public.driver_wallet_holds;
  v_commission bigint := 0;
  v_rate numeric;
begin
  select * into v_order from public.orders where id = p_order_id and driver_id = auth.uid() and status in ('accepted', 'arriving', 'awaiting_otp') and delivery_otp_hash is not null and crypt(p_otp, delivery_otp_hash) = delivery_otp_hash for update;
  if v_order.id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  v_rate := coalesce(public.driver_wallet_commission_rate(auth.uid(), now()), 0);
  v_commission := floor(greatest(coalesce(v_order.final_price, v_order.estimated_price, 0), 0)::numeric * v_rate)::bigint;
  update public.orders set otp_verified_at = now(), status = 'delivered', delivered_at = now(), actual_time_seconds = greatest(0, extract(epoch from now() - accepted_at)::integer), company_commission_amount = v_commission::integer, driver_net_amount = greatest(0, coalesce(final_price, estimated_price, 0) - v_commission)::integer, commission_calculated_at = now() where id = p_order_id;
  select * into v_hold from public.driver_wallet_holds where order_id = p_order_id and driver_id = auth.uid() and status = 'held' for update;
  if v_hold.id is not null then
    update public.driver_wallet_holds set status = 'consumed', resolved_at = now() where id = v_hold.id;
  end if;
  if v_commission > 0 then
    update public.driver_wallet_accounts set balance_amount = balance_amount - v_commission where driver_id = auth.uid();
    insert into public.driver_wallet_ledger (driver_id, order_id, entry_type, amount_signed, note, created_by) values (auth.uid(), p_order_id, 'commission', -v_commission, 'عمولة 10% من الأجرة النهائية', auth.uid());
  end if;
  return true;
end;
$$;

revoke all on function public.driver_wallet_available(uuid) from public, anon, authenticated;
revoke all on function public.driver_wallet_commission_rate(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.driver_can_receive_order(uuid, integer) from public, anon, authenticated;
revoke all on function public.record_driver_wallet_deposit(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.get_own_driver_wallet() from public, anon;
revoke all on function public.list_driver_wallets() from public, anon, authenticated;
revoke all on function public.list_driver_order_offers() from public, anon;
revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
grant execute on function public.get_own_driver_wallet() to authenticated;
grant execute on function public.list_driver_order_offers() to authenticated;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

commit;
