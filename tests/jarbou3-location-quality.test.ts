import { describe, expect, it } from "vitest";

import { validateHamaGpsSample } from "../lib/jarbou3-location-quality";
import { HAMA_CENTER } from "../shared/jarbou3";

describe("Jarbou3 driver GPS quality filter", () => {
  it("accepts a precise, in-range reading", () => {
    expect(validateHamaGpsSample({ ...HAMA_CENTER, accuracy: 12, timestamp: 1_000, speed: 8 })).toBe("good");
  });

  it("rejects poor accuracy and mocked readings", () => {
    expect(validateHamaGpsSample({ ...HAMA_CENTER, accuracy: 81, timestamp: 1_000 })).toBe("poor_accuracy");
    expect(validateHamaGpsSample({ ...HAMA_CENTER, accuracy: 10, timestamp: 1_000, mocked: true })).toBe("mocked");
  });

  it("rejects an implausible jump between two accepted areas", () => {
    const previous = { ...HAMA_CENTER, accuracy: 10, timestamp: 1_000 };
    expect(validateHamaGpsSample({ latitude: 35.16, longitude: 36.7547, accuracy: 10, timestamp: 2_000 }, previous)).toBe("unrealistic_jump");
  });
});
