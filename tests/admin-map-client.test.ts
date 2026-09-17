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
    expect(liveMap).toContain("ADMIN_LIBERTY_STYLE");
    expect(liveMap).toContain("new window.maplibregl.Map");
    expect(liveMap).toContain("GeolocateControl");
    expect(liveMap).toContain("map.resize()");
    expect(liveMap).not.toContain("createAdminLeafletMap");
    expect(liveMap).not.toContain("ADMIN_LEAFLET_TILE_URL");
    expect(liveMap).not.toContain("ADMIN_ESRI_TILE_URL");
  });

  it("يحافظ على مسار خريطة الإدارة دون فرض مصدر بلاطات OSM المباشر", () => {
    expect(adminApp).toContain("/admin/api/fleet-map");
    expect(liveMap).not.toContain("tile.openstreetmap.org");
  });

  it("يسمح لـMapLibre Worker وخطوط OpenFreeMap بالعمل داخل CSP", () => {
    expect(serverEntry).toContain("worker-src 'self' blob:");
    expect(serverEntry).toContain("font-src 'self' https://tiles.openfreemap.org");
    expect(serverEntry).toContain("child-src 'self' blob:");
  });

  it("يثبت DOM والخريطة عند إعادة فتح Fleet أو وصول تحديث حي", () => {
    expect(adminApp).toContain('state.currentView === view');
    expect(adminApp).toContain('document.querySelector("#fleet-map")');
    expect(adminApp).toContain('window.refreshFleetOperationsMap?.();');
    expect(adminApp).toContain('if (state.currentView === "fleet" && document.querySelector("#fleet-map"))');
    expect(liveMap).toContain('if (!fleetOperationsMap || fleetMapTarget !== target)');
    expect(liveMap).toContain('syncFleetMarkers(drivers, fleetDriverMarkers, "driver")');
    expect(liveMap).not.toContain('refreshDashboard(); }, 10000');
  });
});
