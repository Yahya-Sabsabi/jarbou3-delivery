import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("customer location visibility and admin zoom", () => {
  it("records customer GPS through the protected customer mutation", () => {
    const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
    expect(source).toContain("trpc.jarbou3.updateCustomerLocation.useMutation");
    expect(source).toContain("updateCustomerLocation.mutate({ accessToken, location: point })");
    expect(source).toContain("const point = await getCurrentHamaLocation()");
    expect(source).toContain("watchHamaLocation(sendPoint");
  });

  it("keeps the source maxzoom for MapLibre overzoom and permits deeper camera zoom", () => {
    const source = readFileSync(resolve(process.cwd(), "admin-site/live-map.js"), "utf8");
    expect(source).toContain("source.maxzoom = Number.isFinite(Number(tileJson.maxzoom))");
    expect(source).toContain("maxZoom: 21");
    expect(source).toContain("source.tiles = tileJson.tiles");
  });
});
