import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("post-permission GPS readiness safety", () => {
  it("does not query the native provider state in the immediate readiness gate", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/jarbou3-runtime.ts"), "utf8");
    const readinessBody = source.slice(
      source.indexOf("export async function readRuntimeReadiness"),
      source.indexOf("export async function requestRuntimeLocationPermission"),
    );

    expect(readinessBody).not.toMatch(/Location\.hasServicesEnabledAsync\s*\(/);
    expect(readinessBody).toContain("getForegroundPermissionsAsync");
    expect(readinessBody).toContain("locationGranted");
  });
});
