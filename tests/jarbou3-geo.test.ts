import { describe, expect, it } from "vitest";

import { HAMA_CENTER, formatSyp, isInsideHama } from "../shared/jarbou3";

describe("Jarbou3 Hama service boundary", () => {
  it("accepts the center of Hama", () => {
    expect(isInsideHama(HAMA_CENTER.latitude, HAMA_CENTER.longitude)).toBe(true);
  });

  it("rejects an address beyond the approved service bounds", () => {
    expect(isInsideHama(35.5, HAMA_CENTER.longitude)).toBe(false);
    expect(isInsideHama(HAMA_CENTER.latitude, 37.3)).toBe(false);
  });

  it("formats prices using the new Syrian pound label", () => {
    expect(formatSyp(12000)).toContain("ل.س");
  });
});
