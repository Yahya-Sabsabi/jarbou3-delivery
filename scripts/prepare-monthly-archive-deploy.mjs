import { readFile, writeFile } from "node:fs/promises";

const content = await readFile(new URL("../supabase/functions/monthly-archive/index.ts", import.meta.url), "utf8");
await writeFile(
  "/tmp/jarbou3-monthly-archive-deploy.json",
  JSON.stringify({
    project_id: "xgmmpcyroxldhjxzywof",
    name: "monthly-archive",
    verify_jwt: false,
    entrypoint_path: "index.ts",
    files: [{ name: "index.ts", content }],
  }),
);
