import { describe, expect, it } from "vitest";

import { resolveJarbou3ApiBaseUrl } from "../shared/jarbou3-api";

describe("عنوان API لتطبيق جربوع", () => {
  it("يستخدم عنوان الإنتاج المضمّن داخل Android", () => {
    expect(resolveJarbou3ApiBaseUrl({
      embeddedApiBaseUrl: "https://jarbou-deliv-xoohmte2.manus.space/",
      isWeb: false,
    })).toBe("https://jarbou-deliv-xoohmte2.manus.space");
  });

  it("يربط معاينة الويب بخادم API المقابل لها", () => {
    expect(resolveJarbou3ApiBaseUrl({
      isWeb: true,
      currentOrigin: "https://8081-sandbox.example.manus.com",
    })).toBe("https://3000-sandbox.example.manus.com");
  });

  it("يحترم عنوان API المعرف صراحةً", () => {
    expect(resolveJarbou3ApiBaseUrl({
      configuredApiBaseUrl: "https://api.example.test/",
      embeddedApiBaseUrl: "https://fallback.example.test",
      isWeb: false,
    })).toBe("https://api.example.test");
  });
});
