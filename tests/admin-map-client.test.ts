import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("خريطة بوابة الإدارة", () => {
  const liveMap = readFileSync(resolve(process.cwd(), "admin-site/live-map.js"), "utf8");
  const serverEntry = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
  const adminApp = readFileSync(resolve(process.cwd(), "admin-site/app.js"), "utf8");

  it("لا يهيئ خريطة في نظرة عامة", () => {
    expect(adminApp).not.toContain("overview-fleet-map");
    expect(liveMap).not.toContain("refreshOverviewMap");
    expect(liveMap).not.toContain("overviewMarkerLayers");
  });

  it("يعرض حمولة العملاء والسفراء في خريطة الأسطول المستقلة", () => {
    expect(liveMap).toContain('const target = document.querySelector("#fleet-map");');
    expect(liveMap).toContain("customer-marker-dot");
    expect(liveMap).toContain("driver-marker-dot");
    expect(liveMap).toContain("last_location_lat");
    expect(liveMap).toContain("window.refreshFleetOperationsMap");
    expect(liveMap).toContain("تعذر تحميل بلاطات الخريطة");
  });

  it("يسمح بطلب صور بلاطات OpenStreetMap عبر CSP الإدارة", () => {
    expect(serverEntry).toContain("img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
  });
});
