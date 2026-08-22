import { describe, expect, it } from "vitest";

describe("Supabase public Realtime configuration", () => {
  it("accepts the public project endpoint and publishable key", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(baseUrl).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
    expect(key).toBeTruthy();

    const response = await fetch(`${baseUrl}/rest/v1/`, { headers: { apikey: key! } });
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
