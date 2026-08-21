import { writeFile } from "node:fs/promises";

const baseUrl = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const key = process.env.SUPABASE_KEY;
if (!baseUrl || !key) throw new Error("Missing Supabase server environment variables");

const response = await fetch(`${baseUrl}/auth/v1/admin/users?per_page=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

await writeFile("/tmp/jarbou3-server-key-status.json", JSON.stringify({ status: response.status, isAdminKey: response.ok }));
