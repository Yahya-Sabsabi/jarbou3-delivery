import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname, "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("admin map boot contract", () => {
  it("renders overview immediately without mounting a map", () => {
    const app = readProjectFile("admin-site/app.js");
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(app).toContain("activateView(\"overview\"); try { await refreshDashboard(); activateView(\"overview\"); subscribeNotifications(); } catch (error) { handleApiError(error); }");
    expect(app).not.toContain("overview-fleet-map");
    expect(app).not.toContain("refreshOverviewMap");
    expect(liveMap).not.toContain("overview-fleet-map");
    expect(liveMap).not.toContain("refreshOverviewMap");
  });

  it("opens the fleet map directly and retries only its own Leaflet target", () => {
    const app = readProjectFile("admin-site/app.js");
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(app).toContain('if (view === "fleet") renderFleetMap();');
    expect(app).toContain('fleet:"خريطة الأسطول"');
    expect(liveMap).toContain('const target = document.querySelector("#fleet-map");');
    expect(app).toContain("scheduleAdminMapInstall");
    expect(liveMap).toContain("window.installFleetOperationsMap?.(fleetPayload)");
    expect(liveMap).toContain("if (!leafletReady())");
    expect(liveMap).toContain("ADMIN_LEAFLET_TILE_URL");
    expect(liveMap).toContain("ADMIN_ESRI_TILE_URL");
    expect(liveMap).toContain("window.refreshFleetOperationsMap");
  });

  it("ships the current map bundle and approved raster sources", () => {
    const html = readProjectFile("admin-site/index.html");
    expect(html).toContain("live-map.js?v=admin-map-20260916-5");
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(liveMap).toContain("basemaps.cartocdn.com/rastertiles/voyager");
    expect(liveMap).toContain("ArcGIS/rest/services/World_Street_Map");
    expect(liveMap).not.toContain("tile.openstreetmap.org");
    const server = readProjectFile("server/_core/index.ts");
    expect(server).toContain("https://tiles.openfreemap.org");
    expect(server).toContain("https://*.basemaps.cartocdn.com");
    expect(server).toContain("https://server.arcgisonline.com");
  });
});
