import { describe, expect, it } from "vitest";

import { HAMA_CENTER, HAMA_SERVICE_RADIUS_METERS, distanceMeters, estimateDeliveryPrice, formatSyp, isInsideHama } from "../shared/jarbou3";

describe("Jarbou3 Hama service boundary", () => {
  it("accepts the center of Hama", () => {
    expect(isInsideHama(HAMA_CENTER.latitude, HAMA_CENTER.longitude)).toBe(true);
  });

  it("rejects an address beyond the approved service bounds", () => {
    expect(isInsideHama(35.5, HAMA_CENTER.longitude)).toBe(false);
    expect(isInsideHama(HAMA_CENTER.latitude, 37.3)).toBe(false);
  });

  it("rejects a point beyond the seven-kilometre Hama service radius", () => {
    const outsideRadius = { latitude: HAMA_CENTER.latitude + 0.07, longitude: HAMA_CENTER.longitude };
    expect(distanceMeters(HAMA_CENTER, outsideRadius)).toBeGreaterThan(HAMA_SERVICE_RADIUS_METERS);
    expect(isInsideHama(outsideRadius.latitude, outsideRadius.longitude)).toBe(false);
  });

  it("derives a non-zero local delivery price from the route distance", () => {
    expect(estimateDeliveryPrice(0)).toBe(60);
    expect(estimateDeliveryPrice(4200)).toBeGreaterThan(60);
  });

  it("formats prices using the new Syrian pound label", () => {
    expect(formatSyp(120)).toContain("ل.س جديدة");
  });
});
