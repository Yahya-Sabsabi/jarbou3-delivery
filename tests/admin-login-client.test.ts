import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("نموذج دخول بوابة الإدارة", () => {
  it("يرسل كلمة المرور فقط ولا يقرأ حقل هاتف غير موجود", () => {
    const script = readFileSync(resolve(process.cwd(), "admin-site/app.js"), "utf8");
    expect(script).toContain("const body = { password };");
    expect(script).not.toContain('$("#phone").value');
  });
});
