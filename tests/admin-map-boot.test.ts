import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname, "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("admin map boot contract", () => {
  it("renders overview immediately after an authenticated admin session", () => {
    const app = readProjectFile("admin-site/app.js");
    expect(app).toContain("activateView(\"overview\"); try { await refreshDashboard(); activateView(\"overview\"); subscribeNotifications(); } catch (error) { handleApiError(error); }");
  });

  it("renders the overview map after the DOM is injected and retries Leaflet safely", () => {
    const app = readProjectFile("admin-site/app.js");
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(app).toContain("if (typeof window.refreshOverviewMap === \"function\") window.refreshOverviewMap(state.dashboard);");
    expect(liveMap).toContain("const target = document.querySelector(\"#overview-fleet-map\");");
    expect(liveMap).toContain("if (!window.L) {");
    expect(liveMap).toContain("window.L.tileLayer(\"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\"");
  });

  it("allows OpenStreetMap tiles through the admin CSP", () => {
    const server = readProjectFile("server/_core/index.ts");
    expect(server).toContain("connect-src 'self' https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
    expect(server).toContain("img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
  });
});
