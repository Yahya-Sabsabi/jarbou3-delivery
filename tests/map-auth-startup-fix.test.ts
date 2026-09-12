import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const shared = fs.readFileSync(path.resolve(process.cwd(), "shared/jarbou3.ts"), "utf8");
const nativeMap = fs.readFileSync(path.resolve(process.cwd(), "components/hama-map.native.tsx"), "utf8");
const webMap = fs.readFileSync(path.resolve(process.cwd(), "components/hama-map.web.tsx"), "utf8");
const mapScreen = fs.readFileSync(path.resolve(process.cwd(), "components/optimus-map-screen.tsx"), "utf8");
const rootLayout = fs.readFileSync(path.resolve(process.cwd(), "app/_layout.tsx"), "utf8");
const appSource = fs.readFileSync(path.resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");

describe("map container and auth startup", () => {
  it("keeps the requested Hama initial region shared across map renderers", () => {
    expect(shared).toContain("latitude: 35.1318");
    expect(shared).toContain("longitude: 36.7578");
    expect(shared).toContain("latitudeDelta: 0.05");
    expect(shared).toContain("longitudeDelta: 0.05");
    expect(nativeMap).toContain("initialRegion={HAMA_INITIAL_REGION}");
    expect(nativeMap).toContain('provider="google"');
    expect(webMap).toContain("HAMA_INITIAL_REGION");
    expect(webMap).toContain("tile.openstreetmap.org");
  });

  it("uses a full-size map container and smooth recentering", () => {
    expect(mapScreen).toContain("fullScreen");
    expect(mapScreen).toContain("focusPoint={focusPoint}");
    expect(nativeMap).toContain("animateToRegion");
    expect(webMap).toContain("invalidateSize");
    expect(webMap).toContain("flyTo");
  });

  it("keeps the official splash visible until token and role verification is ready", () => {
    expect(rootLayout).toContain("SplashScreen.preventAutoHideAsync");
    expect(appSource).toContain("jarbou3Session.getAccessToken()");
    expect(appSource).toContain("jarbou3Session.getProfile()");
    expect(appSource).toContain("sessionProfile.useQuery");
    expect(appSource).toContain("SplashScreen.hideAsync");
    expect(appSource).toContain("authCheckReady");
  });
});
