begin;

-- تُحفظ هذه القيم على الطلب نفسه بوصفها لقطة مالية لا تتغير عند اعتماد التسليم.
alter table public.orders
  add column if not exists company_commission_amount integer not null default 0,
  add column if not exists driver_net_amount integer not null default 0,
  add column if not exists commission_calculated_at timestamptz;

alter table public.orders
  drop constraint if exists orders_company_commission_nonnegative,
  drop constraint if exists orders_driver_net_nonnegative,
  drop constraint if exists orders_finance_snapshot_matches_final_price;

alter table public.orders
  add constraint orders_company_commission_nonnegative check (company_commission_amount >= 0),
  add constraint orders_driver_net_nonnegative check (driver_net_amount >= 0),
  add constraint orders_finance_snapshot_matches_final_price check (
    commission_calculated_at is null
    or company_commission_amount + driver_net_amount = coalesce(final_price, estimated_price, 0)
  );

comment on column public.orders.company_commission_amount is
  'عمولة شركة جربوع المجمدة عند التسليم: floor(final_price * 3 / 100).';
comment on column public.orders.driver_net_amount is
  'صافي مستحق السفير المجمد عند التسليم: final_price - company_commission_amount.';
comment on column public.orders.commission_calculated_at is
  'وقت تثبيت لقطة عمولة الشركة وصافي السفير للرحلة المكتملة.';

-- يضمن اتساق السجلات المكتملة السابقة مع السياسة الجديدة من دون المساس بالطلبات النشطة أو الملغاة.
update public.orders
set company_commission_amount = floor(coalesce(final_price, estimated_price, 0)::numeric * 3 / 100)::integer,
    driver_net_amount = coalesce(final_price, estimated_price, 0)
      - floor(coalesce(final_price, estimated_price, 0)::numeric * 3 / 100)::integer,
    commission_calculated_at = coalesce(delivered_at, now())
where status = 'delivered'
  and commission_calculated_at is null;

create index if not exists orders_delivered_finance_idx
  on public.orders (delivered_at desc)
  where status = 'delivered';

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
      actual_time_seconds = greatest(0, extract(epoch from now() - accepted_at)::integer),
      company_commission_amount = floor(coalesce(final_price, estimated_price, 0)::numeric * 3 / 100)::integer,
      driver_net_amount = coalesce(final_price, estimated_price, 0)
        - floor(coalesce(final_price, estimated_price, 0)::numeric * 3 / 100)::integer,
      commission_calculated_at = now()
  where id = p_order_id
    and driver_id = auth.uid()
    and status in ('accepted', 'arriving', 'awaiting_otp')
    and delivery_otp_hash is not null
    and crypt(p_otp, delivery_otp_hash) = delivery_otp_hash;
  return found;
end;
$$;

revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

commit;
