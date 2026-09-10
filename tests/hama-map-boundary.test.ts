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
    expect(source).toContain("<MapBoundary fallback={<FallbackHamaMap {...props} />}");
  });
});
