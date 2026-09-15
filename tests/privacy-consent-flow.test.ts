import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
const authDesign = readFileSync(resolve(process.cwd(), "components/auth-design-system.tsx"), "utf8");

describe("mobile privacy consent flow", () => {
  it("requires consent in account creation", () => {
    expect(source).toContain("policyAccepted");
    expect(authDesign).toContain("أوافق على");
    expect(source).toContain("disabled={submitOnboarding.isPending || !policyAccepted");
  });

  it("does not reopen a consent gate during sign-in or session restore", () => {
    expect(source).toContain("Privacy consent is collected during account creation");
    expect(source).not.toContain('setStage("consent")');
  });
});
