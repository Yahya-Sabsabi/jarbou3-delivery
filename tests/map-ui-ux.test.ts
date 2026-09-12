import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
const mapScreen = fs.readFileSync(path.resolve(process.cwd(), "components/optimus-map-screen.tsx"), "utf8");
const openMap = fs.readFileSync(path.resolve(process.cwd(), "components/hama-map-open.native.tsx"), "utf8");

describe("OPTIMUS X map UI/UX contract", () => {
  it("keeps map controls below the status bar and sheet content above the navigation bar", () => {
    expect(mapScreen).toContain("insets.top + 12");
    expect(mapScreen).toContain("insets.bottom");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom, 20)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 30, 42)");
  });

  it("uses a full interactive open map with Hama initial center", () => {
    expect(openMap).toContain("width: \"100%\"");
    expect(openMap).toContain("height: \"100%\"");
    expect(openMap).toContain("touchZoom:true");
    expect(openMap).toContain("dragging:true");
    expect(openMap).toContain("HAMA_INITIAL_REGION");
  });

  it("removes the compact map preview from the customer home screen", () => {
    expect(app).not.toContain("<HamaMap compact source={source}");
    expect(app).toContain("الخريطة الكاملة داخل إنشاء الطلب");
  });

  it("uses free OpenStreetMap tiles and interactive center selection", () => {
    expect(openMap).toContain("{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(openMap).toContain("map.invalidateSize(false)");
    expect(openMap).toContain("draggable:true");
    expect(openMap).toContain("map.on('click'");
    expect(openMap).toContain("map.on('moveend', function");
    expect(openMap).toContain("map.getCenter()");
    expect(openMap).toContain("map.setView([focus.latitude,focus.longitude],16");
  });

  it("uses smooth Leaflet zoom settings and GPS focus zoom", () => {
    expect(openMap).toContain("wheelDebounceTime:100");
    expect(openMap).toContain("zoomSnap:0.5");
    expect(openMap).toContain("smoothWheelZoom:true");
    expect(openMap).toContain("data.focusZoom || 13");
    expect(app).toContain("setMapFocusZoom(16)");
    expect(app).toContain("focusZoom={mapFocusZoom}");
  });

  it("keeps Leaflet sizing valid after WebView layout and orientation changes", () => {
    expect(openMap).toContain("map.invalidateSize(false)");
    expect(openMap).toContain("window.addEventListener('resize'");
    expect(openMap).toContain("window.addEventListener('orientationchange'");
    expect(openMap).toContain("min-width:100%");
    expect(openMap).toContain("width:100vw");
  });

  it("keeps the bottom sheet keyboard-safe with at least 40px bottom space", () => {
    expect(mapScreen).toContain("KeyboardAvoidingView");
    expect(mapScreen).toContain("insets.bottom + 40");
    expect(mapScreen).toContain("Math.max(insets.bottom + 40, 40)");
  });

  it("keeps form fields interactive above the keyboard", () => {
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain('keyboardShouldPersistTaps="handled"');
    expect(app).toContain('keyboardDismissMode="on-drag"');
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 180, 180)");
  });

  it("applies dynamic top and profile bottom safe-area spacing", () => {
    expect(app).toContain("paddingTop: Math.max(insets.top + 6, 14)");
    expect(app).toContain("paddingTop: Math.max(insets.top + 8, 20)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 36, 64)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 180, 180)");
  });

  it("opens a real profile panel and keeps current-location feedback inline", () => {
    expect(app).toContain("<ProfilePanel");
    expect(app).toContain("onProfile={() => setPage(\"profile\")}");
    expect(app).toContain("setLocationNotice");
    expect(app).not.toContain("Alert.alert(\"تم تحديد الاستلام\"");
    expect(app).not.toContain("Alert.alert(\"تم تحديد الوجهة\"");
  });
});
