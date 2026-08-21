import { readFile, writeFile } from "node:fs/promises";

const query = await readFile(new URL("../supabase/migrations/20260822_jarbou3_extension_hardening.sql", import.meta.url), "utf8");
await writeFile("/tmp/jarbou3-extension-hardening.json", JSON.stringify({
  project_id: "xgmmpcyroxldhjxzywof",
  name: "jarbou3_extension_and_scheduler_hardening",
  query,
}));
