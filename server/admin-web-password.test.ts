import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerAdminWebRoutes } from "./admin-web";

describe("بوابة كلمة مرور موقع الإدارة", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  const password = process.env.ADMIN_SITE_PASSWORD;

  beforeAll(async () => {
    if (!password) throw new Error("ADMIN_SITE_PASSWORD is required for this test");
    const app = express();
    app.use(express.json());
    registerAdminWebRoutes(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("يعرض صفحة التهيئة الأولى عبر مسار API غير المخزَّن مؤقتاً", async () => {
    const page = await fetch(`${baseUrl}/admin/api/setup-page`);
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toContain("no-store");
    expect(await page.text()).toContain("اختر كلمة مرور الإدارة");
  });

  it("يفتح جلسة موقّعة بواسطة كلمة المرور السرية ويقبلها في فحص الوصول", async () => {
    const login = await fetch(`${baseUrl}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("jarbou3_admin_access=");

    const accessCheck = await fetch(`${baseUrl}/admin/api/access-check`, { headers: { cookie: cookie ?? "" } });
    expect(accessCheck.status).toBe(204);
  });

  it("يرفض كلمة المرور الخاطئة ولا يمنح جلسة", async () => {
    const login = await fetch(`${baseUrl}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: `${password}x` }),
    });
    expect(login.status).toBe(401);
    expect(login.headers.get("set-cookie")).toBeNull();
  });
});
