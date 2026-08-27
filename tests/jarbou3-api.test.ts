import { describe, expect, it } from "vitest";

import { resolveJarbou3ApiBaseUrl } from "../shared/jarbou3-api";

describe("عنوان API لتطبيق جربوع", () => {
  it("يستخدم عنوان الإنتاج المضمّن داخل Android", () => {
    expect(resolveJarbou3ApiBaseUrl({
      embeddedApiBaseUrl: "https://jarbou-deliv-xoohmte2.manus.space/",
      isWeb: false,
    })).toBe("https://jarbou-deliv-xoohmte2.manus.space");
  });

  it("يستخدم API معاينة Metro المطابق متى كان عنوان المعاينة متاحاً", () => {
    expect(resolveJarbou3ApiBaseUrl({
      embeddedApiBaseUrl: "https://jarbou-deliv-xoohmte2.manus.space",
      isWeb: false,
      expoHostUri: "8081-current-preview.us2.manus.computer",
    })).toBe("https://3000-current-preview.us2.manus.computer");
  });

  it("يفضل عنوان API المعاينة المضمّن في حزمة Expo Go", () => {
    expect(resolveJarbou3ApiBaseUrl({
      configuredApiBaseUrl: "https://3000-current-preview.us2.manus.computer",
      embeddedApiBaseUrl: "https://jarbou-deliv-xoohmte2.manus.space",
      isWeb: false,
    })).toBe("https://3000-current-preview.us2.manus.computer");
  });

  it("يربط معاينة الويب بخادم API المقابل لها", () => {
    expect(resolveJarbou3ApiBaseUrl({
      isWeb: true,
      currentOrigin: "https://8081-sandbox.example.manus.com",
    })).toBe("https://3000-sandbox.example.manus.com");
  });

  it("لا يسمح لعنوان المعاينة المؤقت بتجاوز API المنشور في Android", () => {
    expect(resolveJarbou3ApiBaseUrl({
      configuredApiBaseUrl: "https://3000-expired-preview.example.manus.com/",
      embeddedApiBaseUrl: "https://jarbou-deliv-xoohmte2.manus.space",
      isWeb: false,
    })).toBe("https://jarbou-deliv-xoohmte2.manus.space");
  });

  it("يحترم عنوان API المعرف صراحةً في الويب خارج معاينة 8081", () => {
    expect(resolveJarbou3ApiBaseUrl({
      configuredApiBaseUrl: "https://api.example.test/",
      embeddedApiBaseUrl: "https://fallback.example.test",
      isWeb: true,
      currentOrigin: "https://app.example.test",
    })).toBe("https://api.example.test");
  });
});
