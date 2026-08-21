select cron.unschedule(jobid) from cron.job where jobname in ('jarbou3-monthly-report', 'jarbou3-confirmed-archive-purge');

alter extension pg_net set schema extensions;

select cron.schedule(
  'jarbou3-monthly-report',
  '5 2 1 * *',
  $$select extensions.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_project_url') || '/functions/v1/monthly-archive',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_service_key')),
      body := jsonb_build_object('mode', 'generate')
    );$$
);

select cron.schedule(
  'jarbou3-confirmed-archive-purge',
  '10 * * * *',
  $$select extensions.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_project_url') || '/functions/v1/monthly-archive',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_service_key')),
      body := jsonb_build_object('mode', 'purge')
    );$$
);

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
