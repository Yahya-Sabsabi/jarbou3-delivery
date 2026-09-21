import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "admin-site");

describe("حزمة لوحة الإدارة المنشورة", () => {
  it("تحمل أصولاً cache-busted وتحتوي إصلاحات كلمة المرور ورسائل dashboard", () => {
    const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
    expect(index).toContain("app.20260921-14.js");
    expect(index).toContain("live-map.20260921-14.js");
    const app = fs.readFileSync(path.join(root, "app.20260921-14.js"), "utf8");
    expect(app).toContain("SITE_PASSWORD_CONFIGURATION_ERROR");
    expect(app).toContain("SITE_DASHBOARD_UNAVAILABLE");
  });
});
