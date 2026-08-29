import { describe, expect, it } from "vitest";

import { normalizeProblemReportMessage, problemReportErrorMessage } from "../shared/jarbou3-report";

describe("بلاغات مشاكل تطبيق جربوع", () => {
  it("يطبع الفراغات ويحتفظ برسالة قابلة للإرسال", () => {
    expect(normalizeProblemReportMessage("  الخريطة   لا تعمل  ")).toBe("الخريطة لا تعمل");
    expect(normalizeProblemReportMessage("\nمشكلة في الطلب\t")).toBe("مشكلة في الطلب");
  });

  it("يعرض سبباً عملياً عند انتهاء الجلسة", () => {
    expect(problemReportErrorMessage("SUPABASE_UNAUTHORIZED")).toContain("سجّل الخروج");
    expect(problemReportErrorMessage("JARBOU3_FORBIDDEN")).toContain("سجّل الخروج");
  });

  it("لا يكشف أخطاء الخادم الداخلية للمستخدم", () => {
    expect(problemReportErrorMessage("PGRST123")).toBe("تعذر إرسال البلاغ. تحقق من الاتصال وحاول مرة أخرى.");
  });
});
