import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const shared = fs.readFileSync(path.resolve(process.cwd(), "shared/jarbou3.ts"), "utf8");
const nativeMap = fs.readFileSync(path.resolve(process.cwd(), "components/hama-map.native.tsx"), "utf8");
const openNativeMap = fs.readFileSync(path.resolve(process.cwd(), "components/hama-map-open.native.tsx"), "utf8");
const mapLoader = fs.readFileSync(path.resolve(process.cwd(), "components/hama-map-loader.tsx"), "utf8");
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
    expect(openNativeMap).toContain("HAMA_INITIAL_REGION");
    expect(openNativeMap).toContain("tile.openstreetmap.org");
    expect(openNativeMap).toContain("© OpenStreetMap contributors");
    expect(mapLoader).not.toContain("if (Platform.OS === \"android\") return");
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

  it("keeps Android on an interactive open-source map instead of the static placeholder", () => {
    expect(mapLoader).toContain("@/components/hama-map-open");
    expect(mapLoader).not.toContain("Platform.OS === \"android\" || failedToLoad");
    expect(openNativeMap).toContain("javaScriptEnabled");
    expect(openNativeMap).toContain("touch-action:none");
    expect(openNativeMap).toContain("minHeight: 300");
  });

  it("keeps the workspace visible while requesting location opportunistically", () => {
    expect(appSource).toContain("requestRuntimeLocationPermission().catch");
    expect(appSource).toContain("const runtimeBlocked = false;");
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
