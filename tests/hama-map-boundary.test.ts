import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../components/hama-map-loader.tsx"), "utf8");

describe("HamaMap render safety", () => {
  it("wraps the dynamically loaded map with an error boundary and fallback", () => {
    expect(source).toContain("class MapBoundary extends Component");
    expect(source).toContain("getDerivedStateFromError");
    expect(source).toContain("<MapBoundary fallback={<MapStatus fullScreen={props.fullScreen} failed />}");
    expect(source).not.toContain("FallbackHamaMap");
  });

  it("loads the open-source Android map instead of forcing the static placeholder", () => {
    expect(source).toContain('import("@/components/hama-map-open")');
    expect(source).not.toContain('if (Platform.OS === "android") return;');
    expect(source).not.toContain('if (Platform.OS === "android" || failedToLoad) return <FallbackHamaMap {...props} />;');
  });
});
