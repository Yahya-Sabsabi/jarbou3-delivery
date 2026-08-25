import { describe, expect, it } from "vitest";

import { isVersionBelow } from "./jarbou3-release";

describe("فحص الإصدار الإلزامي", () => {
  it("يمنع النسخ الأدنى فقط", () => {
    expect(isVersionBelow("1.0.0", "1.0.1")).toBe(true);
    expect(isVersionBelow("1.1.0", "1.0.1")).toBe(false);
    expect(isVersionBelow("2.0.0", "1.9.9")).toBe(false);
  });

  it("لا يمنع التطبيق عند عدم وجود حد أدنى", () => {
    expect(isVersionBelow("1.0.0", null)).toBe(false);
    expect(isVersionBelow("1.0.0", "1.0.0")).toBe(false);
  });
});
