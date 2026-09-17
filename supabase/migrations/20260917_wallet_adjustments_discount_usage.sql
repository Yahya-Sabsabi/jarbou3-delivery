begin;

alter table public.discount_codes
  add column if not exists max_uses_per_customer integer,
  add column if not exists max_total_uses integer;

alter table public.discount_codes
  drop constraint if exists discount_codes_max_uses_check;
alter table public.discount_codes
  add constraint discount_codes_max_uses_check check (
    (max_uses_per_customer is null or max_uses_per_customer > 0)
    and (max_total_uses is null or max_total_uses > 0)
  );

create table if not exists public.discount_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (discount_code_id, customer_id, order_id)
);
create index if not exists discount_code_redemptions_customer_idx
  on public.discount_code_redemptions (discount_code_id, customer_id, redeemed_at desc);
create index if not exists discount_code_redemptions_code_idx
  on public.discount_code_redemptions (discount_code_id, redeemed_at desc);
alter table public.discount_code_redemptions enable row level security;
create policy discount_code_redemptions_no_direct_access
  on public.discount_code_redemptions for all to authenticated using (false) with check (false);

create or replace function public.record_driver_wallet_adjustment(
  p_driver_id uuid,
  p_amount_signed bigint,
  p_note text default null
)
returns public.driver_wallet_accounts
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare account public.driver_wallet_accounts;
begin
  if auth.role() <> 'service_role' and not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_amount_signed is null or p_amount_signed = 0 or abs(p_amount_signed) > 1000000000 then raise exception 'INVALID_ADJUSTMENT_AMOUNT'; end if;
  if p_note is not null and char_length(trim(p_note)) > 500 then raise exception 'INVALID_ADJUSTMENT_NOTE'; end if;
  perform pg_advisory_xact_lock(hashtext(p_driver_id::text));
  if not exists (select 1 from public.users where id = p_driver_id and role = 'driver') then raise exception 'DRIVER_NOT_FOUND'; end if;
  insert into public.driver_wallet_accounts (driver_id) values (p_driver_id) on conflict (driver_id) do nothing;
  update public.driver_wallet_accounts set balance_amount = balance_amount + p_amount_signed where driver_id = p_driver_id returning * into account;
  insert into public.driver_wallet_ledger (driver_id, entry_type, amount_signed, note, created_by)
    values (p_driver_id, 'adjustment', p_amount_signed, nullif(trim(p_note), ''), auth.uid());
  return account;
end;
$$;
revoke all on function public.record_driver_wallet_adjustment(uuid, bigint, text) from public, anon;
grant execute on function public.record_driver_wallet_adjustment(uuid, bigint, text) to service_role, authenticated;

commit;
