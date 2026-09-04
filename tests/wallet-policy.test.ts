import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901_jarbou3_driver_wallet_ledger.sql"), "utf8");
const adminWeb = readFileSync(resolve(process.cwd(), "server/admin-web.ts"), "utf8");
const adminUi = readFileSync(resolve(process.cwd(), "admin-site/app.js"), "utf8");

describe("حماية دفتر رصيد السفير", () => {
  it("يثبت تعبئة الرصيد داخل معاملة إدارية مع قفل السفير وتسجيل حركة دفتر", () => {
    expect(migration).toContain("if auth.role() <> 'service_role' and not private.is_admin() then");
    expect(migration).toContain("perform pg_advisory_xact_lock(hashtext(p_driver_id::text));");
    expect(migration).toContain("'deposit', p_amount");
    expect(adminWeb).toContain('app.post("/admin/api/wallets/:driverId/deposits"');
    expect(adminWeb).toContain("requireSiteSession(req);");
  });

  it("يثبت حد الرصيد الأدنى والحجز التقديري والعمولة النهائية 10%", () => {
    expect(migration).toContain("coalesce(public.driver_wallet_available(p_driver_id), 0) >= 10000");
    expect(migration).toContain("insert into public.driver_wallet_holds");
    expect(migration).toContain("greatest(coalesce(v_order.final_price, v_order.estimated_price, 0), 0)::numeric * v_rate");
    expect(migration).toContain("v_rate := coalesce(public.driver_wallet_commission_rate(auth.uid(), now()), 0);");
    expect(migration).toContain("'commission', -v_commission");
  });

  it("يعرض للمدير إجراء تعبئة واضحاً وليس تعديلاً مباشراً للرصيد", () => {
    expect(adminUi).toContain("تعبئة رصيد السفير");
    expect(adminUi).toContain("تعبئة الرصيد");
    expect(adminUi).toContain("/admin/api/wallets/${encodeURIComponent(driverId)}/deposits");
  });
});
