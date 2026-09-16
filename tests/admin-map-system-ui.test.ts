import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const adminIndex = read("admin-site/index.html");
const adminMap = read("admin-site/live-map.js");
const adminApp = read("admin-site/app.js");
const adminStyles = read("admin-site/styles.css");
const appConfig = read("app.config.ts");
const rootLayout = read("app/_layout.tsx");
const tabsLayout = read("app/(tabs)/_layout.tsx");
const customerApp = read("components/jarbou3-app.tsx");

 describe("OPTIMUS X admin map and system UI contract", () => {
  it("uses the same OpenFreeMap Liberty vector style for both admin map surfaces", () => {
    expect(adminIndex).toContain("maplibre-gl");
    expect(adminMap).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(adminMap).toContain("new window.maplibregl.Map");
    expect(adminMap).toContain("GeolocateControl");
    expect(adminMap).toContain("customers");
    expect(adminMap).toContain("drivers");
    expect(adminApp).toContain('id="places-map"');
    expect(adminApp).toContain("scheduleAdminMapInstall");
    expect(adminApp).toContain("disposeAdminMaps");
    expect(adminMap).toContain("ADMIN_LEAFLET_TILE_URL");
    expect(adminMap).toContain("ADMIN_ESRI_TILE_URL");
    expect(adminMap).toContain("window.L");
    expect(adminMap).not.toContain("tile.openstreetmap.org");
  });

  it("falls back to an interactive raster map when WebGL is unavailable", () => {
    expect(adminIndex).toContain("leaflet/leaflet.css");
    expect(adminIndex).toContain("leaflet/leaflet.js");
    expect(adminMap).toContain("maplibregl.supported");
    expect(adminMap).toContain("basemaps.cartocdn.com/rastertiles/voyager");
    expect(adminMap).toContain("ArcGIS/rest/services/World_Street_Map");
    expect(adminMap).toContain("map.locate");
    expect(adminMap).toContain("installLeafletFleetMap");
    expect(adminMap).toContain("window.installFleetOperationsMap?.");
    expect(adminMap).toContain("window.installPlacesMap?.");
    expect(adminMap).toContain("map.invalidateSize()");
  });
  it("keeps live GPS markers and route updates without recreating the map instance", () => {
    expect(adminMap).toContain("refreshFleetOperationsMap");
    expect(adminMap).toContain("setData");
    expect(adminMap).toContain("setLngLat");
    expect(adminMap).toContain("map.resize()");
    expect(adminMap).toContain("destroyVectorFleetMap");
  });

  it("hides Android system navigation by default and reveals it with a bottom swipe", () => {
    expect(appConfig).toContain('"expo-navigation-bar"');
    expect(appConfig).toContain('visibility: "hidden"');
    expect(appConfig).toContain('behavior: "overlay-swipe"');
    expect(rootLayout).toContain("NavigationBar.setVisibilityAsync");
    expect(rootLayout).toContain("NavigationBar.setBehaviorAsync");
  });

  it("keeps only the in-app customer navigation and no legacy footer branding", () => {
    expect(tabsLayout).toContain('tabBarStyle: { display: "none", height: 0, borderTopWidth: 0 }');
    expect(customerApp).toContain("<PremiumCustomerNav");
    expect(customerApp).not.toContain("styles.chooseFooter");
    expect(customerApp).not.toContain("appFooter");
    expect(customerApp).not.toContain("footerBrand");
    expect(adminStyles).not.toContain("map-panel::before");
    expect(adminStyles).not.toContain("map-panel::after");
  });
});
