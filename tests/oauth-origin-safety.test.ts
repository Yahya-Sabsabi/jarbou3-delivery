import { describe, expect, it } from "vitest";

import { getSafeWebOrigin } from "../shared/safe-web-origin";

describe("سلامة أصل الويب في بيئة native", () => {
  it("لا ينهار عندما تكون window غير موجودة", () => {
    expect(getSafeWebOrigin({})).toBeUndefined();
  });

  it("لا ينهار عندما تكون location غير موجودة", () => {
    expect(getSafeWebOrigin({ window: {} })).toBeUndefined();
  });

  it("يعيد origin فقط عندما يكون نصاً صالحاً", () => {
    expect(getSafeWebOrigin({ window: { location: { origin: "https://8081-preview.example" } } }))
      .toBe("https://8081-preview.example");
  });
});
