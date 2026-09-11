import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mapScreen = fs.readFileSync(path.resolve(process.cwd(), "components/optimus-map-screen.tsx"), "utf8");
const appSource = fs.readFileSync(path.resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");

describe("Optimus MapScreen", () => {
  it("uses the draggable bottom sheet and keeps the action surface in one component", () => {
    expect(mapScreen).toContain('@gorhom/bottom-sheet');
    expect(mapScreen).toContain("<BottomSheet");
    expect(mapScreen).toContain("snapPoints");
    expect(mapScreen).toContain('accessibilityLabel="تحديد موقعي الحالي"');
    expect(mapScreen).toContain('accessibilityLabel="فتح الملف الشخصي"');
  });

  it("connects the customer order flow to focusPoint and location actions", () => {
    expect(appSource).toContain("<OptimusMapScreen");
    expect(appSource).toContain("focusPoint={source ?? destination}");
    expect(appSource).toContain("onLocate={useMyLocation}");
    expect(appSource).toContain("onSelect={setMapPoint}");
  });
});
