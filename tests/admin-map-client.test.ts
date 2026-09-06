import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("خريطة بوابة الإدارة", () => {
  const liveMap = readFileSync(resolve(process.cwd(), "admin-site/live-map.js"), "utf8");
  const serverEntry = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

  it("يعرض حمولة العملاء والسفراء في خريطة النظرة العامة", () => {
    expect(liveMap).toContain("const sourceCustomers = Array.isArray(payload) ? [] : payload?.customers || [];");
    expect(liveMap).toContain("window.refreshOverviewMap = installDriverMap;");
    expect(liveMap).toContain("customer-marker-dot");
  });

  it("لا يعيد إنشاء خريطة النظرة العامة عند كل تحديث دوري", () => {
    expect(liveMap).toContain("overviewMarkerLayers?.clearLayers();");
    expect(liveMap).toContain("const target = document.querySelector(\"#overview-fleet-map\");");
    expect(liveMap).toContain("const isNewMap = !liveDriverMap || !existingContainer || existingContainer !== target;");
  });

  it("يسمح بطلب صور بلاطات OpenStreetMap عبر CSP الإدارة", () => {
    expect(serverEntry).toContain("img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
  });
});
