import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("سياسة التحقق برمز التسجيل", () => {
  it("لا ترفض الرمز قبل قراءة سجل الطلب، وتحافظ على حد المحاولات الخاطئة لكل طلب", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const start = source.indexOf("verifyOnboardingCode: publicProcedure");
    const end = source.indexOf("completeOnboardingPassword: publicProcedure", start);
    const procedure = source.slice(start, end);

    expect(procedure).not.toContain("assertOnboardingRateLimit(");
    expect(procedure).toContain("request.code_attempts >= CODE_MAX_ATTEMPTS");
    expect(procedure).toContain("const valid = await bcrypt.compare(input.code, request.verification_code_hash)");
    expect(procedure).toContain('failOnboardingVerification("AUTH_ACCOUNT_CREATE_FAILED")');
    expect(procedure).toContain('failOnboardingVerification("SESSION_CREATE_FAILED")');
  });
});
