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

  it("matches the admin fleet map tile source and keeps a native fixed center marker", () => {
    expect(openMap).toContain("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(openMap).toContain("© OpenStreetMap contributors");
    expect(openMap).not.toContain("basemaps.cartocdn.com");
    expect(openMap).toContain(".leaflet-tile-container img");
    expect(openMap).toContain("margin:0 !important; padding:0 !important;");
    expect(openMap).not.toContain("margin:-1px !important");
    expect(openMap).toContain("doubleClickZoom:false");
    expect(openMap).toContain("minZoom:11");
    expect(openMap).toContain("maxZoom:19");
    expect(openMap).toContain("maxBounds:hamaBounds");
    expect(openMap).toContain("maxBoundsViscosity:1");
    expect(openMap).toContain("updateWhenIdle:true");
    expect(openMap).toContain("keepBuffer:2");
    expect(openMap).toContain("noWrap:true");
    expect(openMap).toContain("map.on('moveend', function(){ mapMoving = false; reportCenter(); })");
    expect(openMap).toContain("map.getCenter()");
    expect(openMap).toContain("map.flyTo([focus.latitude,focus.longitude],16,{animate:true,duration:1})");
    expect(openMap).not.toContain("selectionMarker");
    expect(mapScreen).toContain("centerMarker");
    expect(openMap).toContain("inset:0");
    expect(openMap).toContain("minWidth: 0");
    expect(mapScreen).toContain("overflow: \"hidden\"");
    expect(mapScreen).toContain("pointerEvents=\"none\"");
  });

  it("uses smooth Leaflet zoom settings and GPS focus zoom", () => {
    expect(openMap).toContain("wheelDebounceTime:100");
    expect(openMap).toContain("zoomSnap:0.5");
    expect(openMap).toContain("smoothWheelZoom:true");
    expect(openMap).toContain("data.focusZoom || 13");
    expect(app).toContain("setMapFocusZoom(16)");
    expect(app).toContain("focusZoom={mapFocusZoom}");
  });

  it("keeps Leaflet sizing valid after native layout and orientation changes", () => {
    expect(openMap).toContain("map.invalidateSize({ animate:false, pan:false })");
    expect(openMap).toContain("window.resizeMap = refreshMapSize");
    expect(openMap).toContain("window.addEventListener('resize'");
    expect(openMap).toContain("window.addEventListener('orientationchange'");
    expect(openMap).toContain("width:100%; height:100%");
    expect(openMap).not.toContain("width:100vw");
    expect(openMap).toContain('<html lang="ar" dir="ltr">');
    expect(openMap).toContain(".leaflet-container { direction:ltr;");
    expect(openMap).toContain("fadeAnimation:false");
    expect(openMap).toContain("zoomAnimation:false");
    expect(openMap).toContain("androidLayerType=\"software\"");
    expect(openMap).toContain("map.on('movestart'");
    expect(openMap).toContain("map.on('zoomstart'");
    expect(openMap).not.toContain("map.on('moveend', refreshMapSize)");
    expect(openMap).not.toContain("map.on('zoomend', refreshMapSize)");
  });

  it("keeps the bottom sheet keyboard-safe and fully scrollable", () => {
    expect(mapScreen).toContain("KeyboardAvoidingView");
    expect(mapScreen).toContain("BottomSheetScrollView");
    expect(mapScreen).toContain('keyboardShouldPersistTaps="handled"');
    expect(mapScreen).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
  });

  it("keeps form fields interactive above the keyboard", () => {
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain('keyboardShouldPersistTaps="handled"');
    expect(app).toContain('keyboardDismissMode="on-drag"');
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
  });

  it("applies dynamic top and profile bottom safe-area spacing", () => {
    expect(app).toContain("paddingTop: Math.max(insets.top + 6, 14)");
    expect(app).toContain("paddingTop: Math.max(insets.top + 8, 20)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 36, 64)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
  });

  it("opens a real profile panel and keeps current-location feedback inline", () => {
    expect(app).toContain("<ProfilePanel");
    expect(app).toContain("onProfile={() => setPage(\"profile\")}");
    expect(app).toContain("setLocationNotice");
    expect(app).not.toContain("Alert.alert(\"تم تحديد الاستلام\"");
    expect(app).not.toContain("Alert.alert(\"تم تحديد الوجهة\"");
  });
});
