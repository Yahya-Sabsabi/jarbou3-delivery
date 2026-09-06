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
    expect(app).toContain("await refreshDashboard(); activateView(\"overview\"); subscribeNotifications();");
  });

  it("re-renders the first overview after the deferred map module loads", () => {
    const liveMap = readProjectFile("admin-site/live-map.js");
    expect(liveMap).toContain("if (!adminView.hidden && state.currentView === \"overview\" && state.dashboard) renderOverview();");
    expect(liveMap).toContain("window.L.tileLayer(\"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\"");
  });

  it("allows OpenStreetMap tiles through the admin CSP", () => {
    const server = readProjectFile("server/_core/index.ts");
    expect(server).toContain("connect-src 'self' https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
    expect(server).toContain("img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org");
  });
});
