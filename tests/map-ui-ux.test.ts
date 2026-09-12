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

  it("opens a real profile panel and keeps current-location feedback inline", () => {
    expect(app).toContain("<ProfilePanel");
    expect(app).toContain("onProfile={() => setPage(\"profile\")}");
    expect(app).toContain("setLocationNotice");
    expect(app).not.toContain("Alert.alert(\"تم تحديد الاستلام\"");
    expect(app).not.toContain("Alert.alert(\"تم تحديد الوجهة\"");
  });
});
