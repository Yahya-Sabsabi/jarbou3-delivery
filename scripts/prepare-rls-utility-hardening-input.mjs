import { readFile, writeFile } from "node:fs/promises";

const query = await readFile(new URL("../supabase/migrations/20260822_jarbou3_revoke_rls_utility.sql", import.meta.url), "utf8");
await writeFile("/tmp/jarbou3-rls-utility-hardening.json", JSON.stringify({
  project_id: "xgmmpcyroxldhjxzywof",
  name: "jarbou3_revoke_unused_rls_utility",
  query,
}));
