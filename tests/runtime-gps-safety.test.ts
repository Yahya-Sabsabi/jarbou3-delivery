import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("post-permission GPS readiness safety", () => {
  it("checks the native provider state separately from permission", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/jarbou3-runtime.ts"), "utf8");
    const readinessBody = source.slice(
      source.indexOf("export async function readRuntimeReadiness"),
      source.indexOf("export async function requestRuntimeLocationPermission"),
    );

    expect(readinessBody).toContain("hasServicesEnabledAsync");
    expect(readinessBody).toContain("getForegroundPermissionsAsync");
    expect(readinessBody).toContain("locationGranted");
  });
});
