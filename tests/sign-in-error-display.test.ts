import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("auth and onboarding error display", () => {
  it("recognizes known auth and onboarding codes even when tRPC wraps the message", () => {
    const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
    expect(source).toContain("function appErrorCode");
    expect(source).toContain("message.includes(code)");
    expect(source).toContain("SIGN_IN_PASSWORD_INVALID");
    expect(source).toContain("SIGN_IN_PROFILE_LOOKUP_FAILED");
    expect(source).toContain("PHONE_ALREADY_REGISTERED");
    expect(source).toContain("ONBOARDING_RATE_LIMITED");
  });

  it("maps the registration error through the extracted code instead of exact message matching", () => {
    const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
    const submitBlock = source.slice(source.indexOf("const submitOnboarding"), source.indexOf("const verifyOnboarding"));
    expect(submitBlock).toContain("const code = appErrorCode(error)");
    expect(submitBlock).toContain('code === "PHONE_ALREADY_REGISTERED"');
    expect(submitBlock).toContain('code === "DOCUMENT_UPLOAD_FAILED"');
  });
});
