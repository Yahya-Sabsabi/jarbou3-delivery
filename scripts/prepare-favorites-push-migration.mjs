import { readFile, writeFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260822_jarbou3_favorites_push.sql", import.meta.url), "utf8");
await writeFile("/tmp/jarbou3-favorites-push-migration.json", JSON.stringify({ project_id: "xgmmpcyroxldhjxzywof", name: "jarbou3_favorites_push", query: sql }));
