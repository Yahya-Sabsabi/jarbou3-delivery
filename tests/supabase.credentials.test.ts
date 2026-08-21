import { describe, expect, it } from "vitest";

describe("Supabase server credentials", () => {
  it("accesses the protected REST gateway with the configured project credentials", async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    const restUrl = url?.replace(/\/$/, "");

    expect(restUrl).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co(?:\/rest\/v1)?$/);
    expect(key).toBeTruthy();

    const gateway = restUrl!.endsWith("/rest/v1") ? restUrl! : `${restUrl}/rest/v1`;
    const response = await fetch(`${gateway}/users?select=id&limit=1`, {
      headers: { apikey: key!, Authorization: `Bearer ${key!}` },
    });

    expect(response.ok, await response.text()).toBe(true);
  });
});
