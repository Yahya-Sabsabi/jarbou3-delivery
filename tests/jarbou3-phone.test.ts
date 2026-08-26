import { describe, expect, it } from "vitest";

import { isJarbou3Phone, normalizeJarbou3Phone } from "../shared/jarbou3-phone";

describe("توحيد رقم هاتف جربوع", () => {
  it("يوحد العلامات والمسافات إلى رقم واحد يبدأ بعلامة الجمع", () => {
    expect(normalizeJarbou3Phone("+963 944-123 456")).toBe("+963944123456");
  });

  it("يرفض الرقم القصير قبل استدعاء التسجيل", () => {
    expect(isJarbou3Phone("1234")).toBe(false);
    expect(normalizeJarbou3Phone("1234")).toBe("");
  });
});
