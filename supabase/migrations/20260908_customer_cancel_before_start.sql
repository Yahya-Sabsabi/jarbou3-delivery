-- OPTIMUS X: customer cancellation is allowed only before the trip starts.

create or replace function public.cancel_order_by_customer(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_order public.orders;
begin
  update public.orders
  set status = 'cancelled', cancelled_at = now()
  where id = p_order_id
    and customer_id = auth.uid()
    and status in ('requested', 'accepted', 'arriving', 'awaiting_otp')
  returning * into cancelled_order;

  if cancelled_order.id is null then
    if exists (select 1 from public.orders where id = p_order_id and customer_id = auth.uid() and status = 'started') then
      raise exception 'CANNOT_CANCEL_STARTED_TRIP';
    end if;
    raise exception 'ORDER_NOT_CANCELLABLE';
  end if;

  return cancelled_order;
end;
$$;

grant execute on function public.cancel_order_by_customer(uuid) to authenticated;
