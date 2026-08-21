-- Harden public RPC access. Helper functions are moved out of the exposed API schema.
create schema if not exists private;

alter function public.set_updated_at() set schema private;
alter function public.handle_new_auth_user() set schema private;
alter function public.is_admin() set schema private;
alter function public.is_active_driver() set schema private;

alter function private.set_updated_at() set search_path = public, pg_temp;
alter function private.handle_new_auth_user() set search_path = public, pg_temp;
alter function private.is_admin() set search_path = public, pg_temp;
alter function private.is_active_driver() set search_path = public, pg_temp;

create or replace function public.accept_order(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = public, pg_temp as $$
declare accepted_order public.orders;
begin
  if not private.is_active_driver() then
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

alter function public.verify_delivery_otp(uuid, text) set search_path = public, pg_temp;

create or replace function public.confirm_monthly_report_download(p_report_id uuid)
returns public.monthly_reports language plpgsql security definer set search_path = public, pg_temp as $$
declare confirmed_report public.monthly_reports;
begin
  if not private.is_admin() then
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

revoke all on function private.set_updated_at() from public, anon;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_active_driver() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.set_updated_at() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_driver() to authenticated;

revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
revoke all on function public.confirm_monthly_report_download(uuid) from public, anon;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;
grant execute on function public.confirm_monthly_report_download(uuid) to authenticated;
