import { describe, expect, it } from "vitest";

import { isJarbou3Phone, isSameJarbou3Phone, normalizeJarbou3Otp, normalizeJarbou3Phone } from "../shared/jarbou3-phone";

describe("توحيد رقم هاتف جربوع", () => {
  it("يوحد العلامات والمسافات إلى رقم واحد يبدأ بعلامة الجمع", () => {
    expect(normalizeJarbou3Phone("+963 944-123 456")).toBe("+963944123456");
  });

  it("يرفض الرقم القصير قبل استدعاء التسجيل", () => {
    expect(isJarbou3Phone("1234")).toBe(false);
    expect(normalizeJarbou3Phone("1234")).toBe("");
  });

  it("يطابق الرقم المسجل تاريخياً حتى لو اختلفت علامة الجمع أو العلامات", () => {
    expect(isSameJarbou3Phone("963 944-123 456", "+963944123456")).toBe(true);
    expect(isSameJarbou3Phone("+963944123456", "+963944123457")).toBe(false);
  });

  it("يوحّد أرقام الهاتف المكتوبة بلوحة مفاتيح عربية", () => {
    expect(normalizeJarbou3Phone("+٩٦٣ ٩٤٤ ١٢٣ ٤٥٦")).toBe("+963944123456");
  });

  it("يقبل رمز WhatsApp العربي المؤلف من ستة أرقام فقط", () => {
    expect(normalizeJarbou3Otp("١٢٣٤٥٦")).toBe("123456");
    expect(normalizeJarbou3Otp("۱۲۳۴۵۶")).toBe("123456");
    expect(normalizeJarbou3Otp("12345")).toBe("");
    expect(normalizeJarbou3Otp("1234567")).toBe("");
  });
});
