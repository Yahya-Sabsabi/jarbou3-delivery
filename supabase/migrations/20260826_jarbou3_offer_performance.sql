create index if not exists orders_offered_driver_idx
  on public.orders (offered_driver_id)
  where offered_driver_id is not null;

drop policy if exists "assigned users read trip metrics" on public.order_trip_metrics;
create policy "assigned users read trip metrics"
on public.order_trip_metrics for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_trip_metrics.order_id
      and (
        o.driver_id = (select auth.uid())
        or o.customer_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
);
