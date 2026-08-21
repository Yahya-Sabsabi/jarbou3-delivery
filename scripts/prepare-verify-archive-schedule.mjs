import { writeFile } from "node:fs/promises";

await writeFile("/tmp/jarbou3-verify-archive-schedule.json", JSON.stringify({
  project_id: "xgmmpcyroxldhjxzywof",
  query: "select jobname, schedule from cron.job where jobname in ('jarbou3-monthly-report', 'jarbou3-confirmed-archive-purge') order by jobname limit 5;",
}));
