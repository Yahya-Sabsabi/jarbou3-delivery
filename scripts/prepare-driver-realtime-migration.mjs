import { readFile, writeFile } from "node:fs/promises";

const query = await readFile(new URL("../supabase/migrations/20260822_jarbou3_driver_realtime_location.sql", import.meta.url), "utf8");
await writeFile("/tmp/jarbou3-driver-realtime-location.json", JSON.stringify({
  project_id: "xgmmpcyroxldhjxzywof",
  name: "jarbou3_driver_realtime_location",
  query,
}));
