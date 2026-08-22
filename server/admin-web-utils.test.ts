import { describe, expect, it } from "vitest";

import { buildAdminNotifications, isSameOriginRequest, normalizeReportMonth } from "./admin-web-utils";

describe("مساعدات موقع الإدارة المستقل", () => {
  it("يقبل أشهر التقارير المطابقة لبداية الشهر فقط", () => {
    expect(normalizeReportMonth("2026-08-01")).toBe("2026-08-01");
    expect(normalizeReportMonth("2026-08-22")).toBeNull();
  });

  it("ينشئ تنبيهاً واضحاً لطلب جديد وملف سائق معلق", () => {
    const notices = buildAdminNotifications(
      [{ id: "c9ce09b0-6da4-42b2-a16e-012345678901", status: "requested", driver_id: null, created_at: "2026-08-22T09:00:00Z", updated_at: "2026-08-22T09:00:00Z" }],
      [{ user_id: "d8ce09b0-6da4-42b2-a16e-012345678901", status: "pending", created_at: "2026-08-22T10:00:00Z", updated_at: "2026-08-22T10:00:00Z" }],
    );

    expect(notices).toHaveLength(2);
    expect(notices[0].title).toBe("طلب تفعيل سائق جديد");
    expect(notices[1].title).toBe("طلب جديد بانتظار التعيين");
  });

  it("يرفض طلبات الواجهة القادمة من نطاق مختلف", () => {
    expect(isSameOriginRequest("https://admin.example.com", "admin.example.com", "https")).toBe(true);
    expect(isSameOriginRequest("https://malicious.example", "admin.example.com", "https")).toBe(false);
  });
});
