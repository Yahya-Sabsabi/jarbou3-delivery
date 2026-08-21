import { describe, expect, it } from "vitest";

describe("Supabase archive service key", () => {
  it("accesses the minimal Auth administration endpoint from the server only", async () => {
    const configuredUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const baseUrl = configuredUrl?.replace(/\/rest\/v1$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(baseUrl).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
    expect(key).toBeTruthy();

    const response = await fetch(`${baseUrl}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: key!, Authorization: `Bearer ${key!}` },
    });

    expect(response.ok, await response.text()).toBe(true);
  });
});
