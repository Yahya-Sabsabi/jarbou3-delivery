begin;

create policy "driver_company_payments_no_direct_access"
  on public.driver_company_payments
  for all
  to authenticated
  using (false)
  with check (false);

commit;
