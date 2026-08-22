import { describe, expect, it } from "vitest";

import { adminReducer, initialAdminState } from "./admin-dashboard-state";

describe("adminReducer", () => {
  it("يحفظ انتقالات التشغيل الأساسية في لوحة الإدارة", () => {
    const reviewingDrivers = adminReducer(initialAdminState, { type: "set_view", view: "drivers" });
    const approvedDriver = adminReducer(reviewingDrivers, { type: "approve_driver" });
    const assignedOrder = adminReducer(approvedDriver, { type: "assign_order" });
    const closedShift = adminReducer(assignedOrder, { type: "close_shift" });
    const downloadedReport = adminReducer(closedShift, { type: "confirm_report_download" });

    expect(downloadedReport).toEqual({
      view: "drivers",
      driverDecision: "approved",
      orderAssigned: true,
      shiftClosed: true,
      reportDownloaded: true,
    });
  });

  it("يسجل طلب تحديث وثائق السائق كحالة رفض قابلة للمراجعة", () => {
    expect(adminReducer(initialAdminState, { type: "reject_driver" }).driverDecision).toBe("rejected");
  });
});
