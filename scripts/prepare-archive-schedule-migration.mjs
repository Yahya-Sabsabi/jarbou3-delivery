import { writeFile } from "node:fs/promises";

const url = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase archive schedule credentials are unavailable");

const quote = (value) => `'${value.replace(/'/g, "''")}'`;
const query = `
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'jarbou3_archive_project_url') then
    perform vault.create_secret(${quote(url)}, 'jarbou3_archive_project_url', 'Private project URL used by the Jarbou3 archive scheduler');
  end if;
  if not exists (select 1 from vault.secrets where name = 'jarbou3_archive_service_key') then
    perform vault.create_secret(${quote(serviceKey)}, 'jarbou3_archive_service_key', 'Private service key used only by the Jarbou3 archive scheduler');
  end if;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname in ('jarbou3-monthly-report', 'jarbou3-confirmed-archive-purge');

select cron.schedule(
  'jarbou3-monthly-report',
  '5 2 1 * *',
  $$select extensions.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_project_url') || '/functions/v1/monthly-archive',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_service_key')
      ),
      body := jsonb_build_object('mode', 'generate')
    );$$
);

select cron.schedule(
  'jarbou3-confirmed-archive-purge',
  '10 * * * *',
  $$select extensions.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_project_url') || '/functions/v1/monthly-archive',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'jarbou3_archive_service_key')
      ),
      body := jsonb_build_object('mode', 'purge')
    );$$
);
`;

await writeFile("/tmp/jarbou3-archive-schedule-migration.json", JSON.stringify({
  project_id: "xgmmpcyroxldhjxzywof",
  name: "jarbou3_monthly_report_and_confirmed_purge_schedule",
  query,
}));
