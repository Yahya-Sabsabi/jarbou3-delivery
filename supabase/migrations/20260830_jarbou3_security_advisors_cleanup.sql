-- These tables are intentionally server-only. Keep an explicit deny policy in addition to RLS
-- so the intended access boundary is visible to audits and remains closed by default.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'account_recovery_requests',
    'account_verification_requests',
    'admin_access_recovery_links',
    'admin_site_settings',
    'app_release_settings',
    'discount_code_recipients',
    'discount_codes',
    'manual_archive_events',
    'manual_archives'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_direct_access', table_name);
    execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)', table_name || '_no_direct_access', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- This recovery-token function is called only by the protected admin server route.
revoke all on function public.create_admin_access_recovery_token() from public, anon, authenticated;
grant execute on function public.create_admin_access_recovery_token() to service_role;
