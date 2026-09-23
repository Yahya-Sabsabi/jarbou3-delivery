import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("legacy password login compatibility", () => {
  it("does not enforce the new-password minimum on sign-in input", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const start = source.indexOf("signIn: publicProcedure");
    const end = source.indexOf("requestAccountRecovery:", start);
    const body = source.slice(start, end);

    expect(body).toContain('password: z.string().min(1).max(72)');
    expect(body).not.toContain('password: z.string().min(8).max(72)');
  });

  it("does not block legacy short passwords in the mobile sign-in form", () => {
    const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
    const start = source.indexOf("const submitSignIn");
    const end = source.indexOf("const logout", start);
    const body = source.slice(start, end);

    expect(body).toContain("accountPassword.length < 1");
    expect(body).not.toContain("accountPassword.length < 8");
    expect(body).toContain("signIn.mutate({ phone: normalizedPhone, password: accountPassword, expectedRole: role })");
  });
});
