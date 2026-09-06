import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "scripts/start-expo-resilient.mjs"), "utf8");

describe("Expo resilient tunnel runner", () => {
  it("uses a public fallback before LAN", () => {
    expect(source).toContain('"localtunnel"');
    expect(source).toContain("REACT_NATIVE_PACKAGER_HOSTNAME");
    expect(source).toContain("رابط المعاينة العام الحالي");
  });

  it("allows slow public tunnel startup", () => {
    expect(source).toContain("50_000");
    expect(source).toContain("تعذر إنشاء نفق عام؛ إبقاء Metro بوضع LAN كخطة أخيرة.");
  });
});
