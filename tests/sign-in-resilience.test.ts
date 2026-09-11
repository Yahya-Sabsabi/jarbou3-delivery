import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("sign-in resilience", () => {
  it("authenticates canonical identity before legacy profile migration", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const start = source.indexOf("signIn: publicProcedure");
    const end = source.indexOf("requestAccountRecovery:", start);
    const body = source.slice(start, end);

    expect(body.indexOf("signInWithPassword({ email: canonicalEmail"))
      .toBeLessThan(body.indexOf("if (authResult.error?.code === \"invalid_credentials\")"));
    expect(body).toContain("SIGN_IN_PROFILE_LOOKUP_FAILED");
    expect(body).toContain("SIGN_IN_ACCOUNT_NOT_FOUND");
  });
});
