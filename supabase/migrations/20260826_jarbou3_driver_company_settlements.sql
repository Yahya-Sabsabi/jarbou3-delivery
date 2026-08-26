begin;

create table public.driver_company_payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id) on delete restrict,
  amount integer not null check (amount > 0),
  payment_method text not null check (payment_method = 'cash'),
  payment_reference text check (char_length(coalesce(payment_reference, '')) <= 120),
  note text check (char_length(coalesce(note, '')) <= 500),
  recorded_via text not null default 'admin_site' check (recorded_via = 'admin_site'),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index driver_company_payments_driver_paid_idx
  on public.driver_company_payments (driver_id, paid_at desc);

alter table public.driver_company_payments enable row level security;

create policy "driver_company_payments_no_direct_access"
  on public.driver_company_payments
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.prevent_driver_company_payment_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'DRIVER_COMPANY_PAYMENT_LEDGER_IMMUTABLE';
end;
$$;

create trigger driver_company_payments_immutable
  before update or delete on public.driver_company_payments
  for each row execute function public.prevent_driver_company_payment_mutation();

create or replace function public.get_own_company_balance()
returns table (
  total_commission_amount bigint,
  paid_amount bigint,
  outstanding_amount bigint,
  payment_count bigint,
  last_payment_at timestamptz
)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  with commissions as (
    select coalesce(sum(company_commission_amount), 0)::bigint as total
    from public.orders
    where driver_id = auth.uid()
      and status = 'delivered'
      and commission_calculated_at is not null
  ), payments as (
    select
      coalesce(sum(amount), 0)::bigint as total,
      count(*)::bigint as count,
      max(paid_at) as last_payment_at
    from public.driver_company_payments
    where driver_id = auth.uid()
  )
  select commissions.total, payments.total, commissions.total - payments.total, payments.count, payments.last_payment_at
  from commissions cross join payments;
$$;

create or replace function public.list_driver_company_balances()
returns table (
  driver_id uuid,
  driver_name text,
  total_commission_amount bigint,
  paid_amount bigint,
  outstanding_amount bigint,
  payment_count bigint,
  last_payment_at timestamptz
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
  with commissions as (
    select o.driver_id, coalesce(sum(o.company_commission_amount), 0)::bigint as total
    from public.orders o
    where o.status = 'delivered'
      and o.commission_calculated_at is not null
      and o.driver_id is not null
    group by o.driver_id
  ), payments as (
    select p.driver_id, coalesce(sum(p.amount), 0)::bigint as total, count(*)::bigint as count, max(p.paid_at) as last_payment_at
    from public.driver_company_payments p
    group by p.driver_id
  )
  select
    u.id,
    u.name,
    coalesce(c.total, 0),
    coalesce(p.total, 0),
    coalesce(c.total, 0) - coalesce(p.total, 0),
    coalesce(p.count, 0),
    p.last_payment_at
  from public.users u
  left join commissions c on c.driver_id = u.id
  left join payments p on p.driver_id = u.id
  where u.role = 'driver'
  order by (coalesce(c.total, 0) - coalesce(p.total, 0)) desc, u.name;
end;
$$;

create or replace function public.record_driver_company_payment(
  p_driver_id uuid,
  p_amount integer,
  p_payment_method text,
  p_payment_reference text default null,
  p_note text default null
)
returns public.driver_company_payments
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  outstanding_balance bigint;
  payment public.driver_company_payments;
begin
  if auth.role() <> 'service_role' and not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;
  if p_payment_method <> 'cash' then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_driver_id::text));

  if not exists (select 1 from public.users where id = p_driver_id and role = 'driver') then
    raise exception 'DRIVER_NOT_FOUND';
  end if;

  select
    coalesce((
      select sum(company_commission_amount)::bigint
      from public.orders
      where driver_id = p_driver_id
        and status = 'delivered'
        and commission_calculated_at is not null
    ), 0) - coalesce((
      select sum(amount)::bigint
      from public.driver_company_payments
      where driver_id = p_driver_id
    ), 0)
  into outstanding_balance;

  if p_amount > outstanding_balance then
    raise exception 'PAYMENT_EXCEEDS_OUTSTANDING_BALANCE';
  end if;

  insert into public.driver_company_payments (driver_id, amount, payment_method, payment_reference, note)
  values (p_driver_id, p_amount, p_payment_method, nullif(trim(p_payment_reference), ''), nullif(trim(p_note), ''))
  returning * into payment;

  return payment;
end;
$$;

revoke all on table public.driver_company_payments from public, anon, authenticated;
revoke all on function public.get_own_company_balance() from public, anon;
revoke all on function public.list_driver_company_balances() from public, anon, authenticated;
revoke all on function public.record_driver_company_payment(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.get_own_company_balance() to authenticated;

commit;
