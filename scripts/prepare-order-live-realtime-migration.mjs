import { readFile, writeFile } from "node:fs/promises";

const query = await readFile(new URL("../supabase/migrations/20260822_jarbou3_order_live_realtime.sql", import.meta.url), "utf8");
await writeFile(new URL("../.tmp-order-live-realtime-migration.json", import.meta.url), JSON.stringify({
  project_id: "xgmmpcyroxldhjxzywof",
  name: "jarbou3_order_live_realtime",
  query,
}));
