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
    expect(liveMap).toContain("window.installFleetOperationsMap(payload)");
    expect(liveMap).toContain("if (!window.L) {");
    expect(liveMap).toContain("window.L.tileLayer(\"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\"");
    expect(liveMap).toContain("window.refreshFleetOperationsMap");
  });

  it("allows OpenStreetMap tiles through the admin CSP", () => {
    const server = readProjectFile("server/_core/index.ts");
    expect(server).toContain("connect-src 'self' https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
    expect(server).toContain("img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
    const html = readProjectFile("admin-site/index.html");
    expect(html).toContain("live-map.js?v=admin-map-20260906-3");
  });
});
