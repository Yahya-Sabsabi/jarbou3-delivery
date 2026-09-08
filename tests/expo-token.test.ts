import { describe, expect, it } from "vitest";

describe("Expo build authentication", () => {
  it("accepts the configured Expo token", async () => {
    const token = process.env.EXPO_TOKEN;
    expect(token, "EXPO_TOKEN must be configured for this test").toBeTruthy();

    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: "query MeUserActorQuery { meUserActor { id username } }",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data?: { meUserActor?: unknown }; errors?: unknown[] };
    expect(body.errors).toBeUndefined();
    expect(body.data?.meUserActor).toBeTruthy();
  }, 15_000);
});
