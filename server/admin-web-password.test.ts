import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerAdminWebRoutes } from "./admin-web";

describe("بوابة كلمة مرور موقع الإدارة", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  beforeAll(async () => {
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

  it("يخدم صفحة تهيئة الإدارة من مسار API المسجل", async () => {
    const page = await fetch(`${baseUrl}/admin/api/setup-page`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("اختر كلمة مرور الإدارة");
    expect(html).toContain("/admin/api/setup");
  });

  it("يقبل طلب التهيئة القادم من نفس المضيف عندما ينهي البروكسي HTTPS خارج الخادم", async () => {
    const deployedOrigin = baseUrl.replace("http:", "https:");
    const setup = await fetch(`${baseUrl}/admin/api/setup`, {
      method: "POST",
      headers: { Origin: deployedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "short", confirmation: "short" }),
    });
    expect(setup.status).toBe(400);
  });

  it("يقبل أصل بوابة الإدارة العامة عندما يحجب البروكسي المضيف الخارجي", async () => {
    const setup = await fetch(`${baseUrl}/admin/api/setup`, {
      method: "POST",
      headers: { Origin: "https://jarbou-deliv-xoohmte2.manus.space", "Content-Type": "application/json" },
      body: JSON.stringify({ password: "short", confirmation: "short" }),
    });
    expect(setup.status).toBe(400);
  });

  it("يرفض فحص الوصول عندما لا توجد جلسة إدارة موقعة", async () => {
    const accessCheck = await fetch(`${baseUrl}/admin/api/access-check`);
    expect(accessCheck.status).toBe(401);
  });

  it("يرفض كلمة المرور الخاطئة ولا يمنح جلسة", async () => {
    const login = await fetch(`${baseUrl}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "this-is-not-the-admin-password" }),
    });
    expect(login.status).toBe(401);
    expect(login.headers.get("set-cookie")).toBeNull();
  });
});
