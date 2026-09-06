-- OPTIMUS X currency standardisation
-- Monetary integer columns now use the new Syrian pound (SYP-N).
-- The project was confirmed as experimental with no real balances or orders,
-- so no data conversion is required. Legacy reference: 100 old SYP = 1 new SYP.

create or replace function public.driver_can_receive_order(p_driver_id uuid, p_estimated_price integer)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(public.driver_wallet_available(p_driver_id), 0) >= 100
     and coalesce(public.driver_wallet_available(p_driver_id), 0) >= case
       when coalesce(public.driver_wallet_commission_rate(p_driver_id), 0) = 0 then 0
       else floor(greatest(coalesce(p_estimated_price, 0), 0)::numeric * 0.10)::bigint
     end;
$$;

comment on function public.driver_can_receive_order(uuid, integer)
is 'Amounts use the new Syrian pound (SYP-N); minimum available balance is 100 SYP-N.';
