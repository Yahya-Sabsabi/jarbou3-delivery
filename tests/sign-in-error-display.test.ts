import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("sign-in error display", () => {
  it("recognizes known auth codes even when tRPC wraps the message", () => {
    const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
    expect(source).toContain("function signInErrorCode");
    expect(source).toContain('message.includes(code)');
    expect(source).toContain("SIGN_IN_PASSWORD_INVALID");
    expect(source).toContain("SIGN_IN_PROFILE_LOOKUP_FAILED");
  });
});
