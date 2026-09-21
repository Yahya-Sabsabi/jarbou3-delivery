import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

describe("وثائق الدراجة في لوحة الإدارة", () => {
  it("يدعم مسار API والواجهة عرض صورة الدراجة", () => {
    const server = fs.readFileSync(path.join(root, "server/admin-web.ts"), "utf8");
    const app = fs.readFileSync(path.join(root, "admin-site/app.20260921-14.js"), "utf8");
    expect(server).toContain('z.enum(["personal", "identity", "vehicle"])');
    expect(server).toContain("vehicle_photo_path");
    expect(app).toContain('data-pending-document="vehicle"');
    expect(app).toContain('data-account-document="vehicle"');
    expect(app).toContain("عرض صورة الدراجة");
  });
});
