import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
const shared = read("shared/jarbou3.ts");
const nativeMap = read("components/hama-map.native.tsx");
const maplibre = read("components/hama-map-maplibre.native.tsx");
const mapLoader = read("components/hama-map-loader.tsx");
const webMap = read("components/hama-map.web.tsx");
const mapScreen = read("components/optimus-map-screen.tsx");
const rootLayout = read("app/_layout.tsx");
const appSource = read("components/jarbou3-app.tsx");

describe("map container and auth startup", () => {
  it("keeps the requested Hama initial region shared across map renderers", () => {
    expect(shared).toContain("latitude: 35.1318");
    expect(shared).toContain("longitude: 36.7578");
    expect(shared).toContain("latitudeDelta: 0.05");
    expect(shared).toContain("longitudeDelta: 0.05");
    expect(maplibre).toContain("HAMA_INITIAL_REGION");
    expect(maplibre).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(nativeMap).not.toContain("react-native-maps");
    expect(webMap).toContain("HAMA_INITIAL_REGION");
  });

  it("uses a full-size map container and smooth recentering", () => {
    expect(mapScreen).toContain("fullScreen");
    expect(mapScreen).toContain("focusPoint={focusPoint}");
    expect(maplibre).toContain("fullScreen");
    expect(maplibre).toContain("cameraRef.current?.flyTo");
    expect(webMap).toContain("invalidateSize");
    expect(webMap).toContain("flyTo");
  });

  it("keeps Android on MapLibre Native instead of Google, WebView or the static placeholder", () => {
    expect(mapLoader).toContain("@/components/hama-map-maplibre.native");
    expect(maplibre).toContain("<Map");
    expect(maplibre).toContain("androidView=\"surface\"");
    expect(maplibre).not.toContain("WebView");
    expect(maplibre).not.toContain("react-native-maps");
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
