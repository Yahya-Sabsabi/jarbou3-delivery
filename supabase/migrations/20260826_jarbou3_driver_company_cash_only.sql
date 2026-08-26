begin;

alter table public.driver_company_payments
  drop constraint if exists driver_company_payments_payment_method_check;

alter table public.driver_company_payments
  add constraint driver_company_payments_payment_method_check
  check (payment_method = 'cash');

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
  values (p_driver_id, p_amount, 'cash', null, nullif(trim(p_note), ''))
  returning * into payment;

  return payment;
end;
$$;

commit;
