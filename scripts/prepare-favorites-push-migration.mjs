import { readFile, writeFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260822_jarbou3_favorites_push.sql", import.meta.url), "utf8");
await writeFile(new URL("../.tmp-favorites-push-migration.json", import.meta.url), JSON.stringify({ project_id: "xgmmpcyroxldhjxzywof", name: "jarbou3_favorites_push", query: sql }));
