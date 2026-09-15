import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
const app = root("components/jarbou3-app.tsx");
const mapScreen = root("components/optimus-map-screen.tsx");
const loader = root("components/hama-map-loader.tsx");
const maplibre = root("components/hama-map-maplibre.native.tsx");

describe("OPTIMUS X MapLibre map UI/UX contract", () => {
  it("keeps map controls below the status bar and sheet content above the navigation bar", () => {
    expect(mapScreen).toContain("insets.top + 12");
    expect(mapScreen).toContain("insets.bottom");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom, 20)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 30, 42)");
  });

  it("uses MapLibre Native with the OpenFreeMap Liberty vector style", () => {
    expect(loader).toContain("hama-map-maplibre.native");
    expect(maplibre).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(maplibre).toContain("<Map");
    expect(maplibre).toContain("<Camera");
    expect(maplibre).toContain("androidView=\"surface\"");
    expect(maplibre).toContain("touchZoom");
    expect(maplibre).toContain("doubleTapZoom");
    expect(maplibre).toContain("HAMA_MAX_BOUNDS");
    expect(maplibre).not.toContain("react-native-maps");
    expect(maplibre).not.toContain("WebView");
  });

  it("keeps Hama initial center, bounded zoom and native fixed-center selection", () => {
    expect(maplibre).toContain("HAMA_INITIAL_REGION.latitude");
    expect(maplibre).toContain("minZoom={11}");
    expect(maplibre).toContain("maxZoom={19}");
    expect(maplibre).toContain("onRegionDidChange={syncCenter}");
    expect(maplibre).toContain("styles.centerPin");
    expect(maplibre).toContain("mapRef.current.getCenter()");
  });

  it("keeps live driver updates separate from map rendering", () => {
    expect(maplibre).toContain("driverLocation");
    expect(maplibre).toContain("id=\"driver-marker\"");
    expect(maplibre).toContain("id=\"route-path\"");
    expect(maplibre).toContain("actualPath.length > 1");
    expect(maplibre).toContain("<UserLocation />");
  });

  it("provides explicit loading, error and retry states", () => {
    expect(maplibre).toContain("onDidFinishLoadingMap");
    expect(maplibre).toContain("onDidFailLoadingMap");
    expect(maplibre).toContain("إعادة المحاولة");
    expect(maplibre).toContain("setRetryNonce");
  });

  it("keeps the compact map preview removed from customer home", () => {
    expect(app).not.toContain("<HamaMap compact source={source}");
    expect(app).toContain("الخريطة الكاملة داخل إنشاء الطلب");
  });

  it("keeps the bottom sheet keyboard-safe and fully scrollable", () => {
    expect(mapScreen).toContain("KeyboardAvoidingView");
    expect(mapScreen).toContain("BottomSheetScrollView");
    expect(mapScreen).toContain('keyboardShouldPersistTaps="handled"');
    expect(mapScreen).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
  });

  it("keeps form fields interactive above the keyboard and preserves auth flow", () => {
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain('keyboardShouldPersistTaps="handled"');
    expect(app).toContain('keyboardDismissMode="on-drag"');
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
    expect(app).toContain("signIn");
  });

  it("opens a real profile panel and keeps location feedback inline", () => {
    expect(app).toContain("<ProfilePanel");
    expect(app).toContain("onProfile={() => setPage(\"profile\")}");
    expect(app).toContain("setLocationNotice");
    expect(app).not.toContain('Alert.alert("تم تحديد الاستلام"');
    expect(app).not.toContain('Alert.alert("تم تحديد الوجهة"');
  });
});
