import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const boundary = readFileSync(resolve(here, "../components/app-error-boundary.tsx"), "utf8");
const layout = readFileSync(resolve(here, "../app/_layout.tsx"), "utf8");

describe("global render error recovery", () => {
  it("provides a retryable Arabic fallback screen", () => {
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("إعادة المحاولة");
    expect(boundary).toContain("this.setState({ error: null })");
  });

  it("wraps the Expo Router root content", () => {
    expect(layout).toContain("<AppErrorBoundary>");
    expect(layout).toContain("</AppErrorBoundary>");
  });
});
