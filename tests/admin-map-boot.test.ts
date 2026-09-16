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

  it("opens the fleet map directly and keeps its own MapLibre target", () => {
    const app = readProjectFile("admin-site/app.js");
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(app).toContain('if (view === "fleet") renderFleetMap();');
    expect(app).toContain('fleet:"خريطة الأسطول"');
    expect(liveMap).toContain('const target = document.querySelector("#fleet-map");');
    expect(app).toContain("scheduleAdminMapInstall");
    expect(liveMap).toContain("window.installFleetOperationsMap");
    expect(liveMap).toContain("ADMIN_LIBERTY_STYLE");
    expect(liveMap).not.toContain("leafletReady");
    expect(liveMap).not.toContain("ADMIN_LEAFLET_TILE_URL");
    expect(liveMap).not.toContain("ADMIN_ESRI_TILE_URL");
    expect(liveMap).toContain("window.refreshFleetOperationsMap");
  });

  it("ships the current MapLibre bundle and Liberty style", () => {
    const html = readProjectFile("admin-site/index.html");
    expect(html).toContain("live-map.js?v=admin-map-20260916-10");
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(liveMap).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(liveMap).not.toContain("tile.openstreetmap.org");
    expect(liveMap).not.toContain("basemaps.cartocdn.com");
    expect(liveMap).not.toContain("ArcGIS/rest/services");
    const server = readProjectFile("server/_core/index.ts");
    expect(server).toContain("https://tiles.openfreemap.org");
    expect(server).not.toContain("https://*.basemaps.cartocdn.com");
    expect(server).not.toContain("https://server.arcgisonline.com");
  });
});
