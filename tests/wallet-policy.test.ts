import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901_jarbou3_driver_wallet_ledger.sql"), "utf8");
const currencyMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260905_currency_syp_new.sql"), "utf8");
const adminWeb = readFileSync(resolve(process.cwd(), "server/admin-web.ts"), "utf8");
const adminUi = readFileSync(resolve(process.cwd(), "admin-site/app.js"), "utf8");
const adminIndex = readFileSync(resolve(process.cwd(), "admin-site/index.html"), "utf8");
const pricingMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260905_delivery_pricing_settings.sql"), "utf8");
const pricingTimeMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260905_delivery_pricing_time.sql"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("حماية دفتر رصيد السفير", () => {
  it("يثبت تعبئة الرصيد داخل معاملة إدارية مع قفل السفير وتسجيل حركة دفتر", () => {
    expect(baseMigration).toContain("if auth.role() <> 'service_role' and not private.is_admin() then");
    expect(baseMigration).toContain("perform pg_advisory_xact_lock(hashtext(p_driver_id::text));");
    expect(baseMigration).toContain("'deposit', p_amount");
    expect(adminWeb).toContain('app.post("/admin/api/wallets/:driverId/deposits"');
    expect(adminWeb).toContain("requireSiteSession(req);");
  });

  it("يثبت حد الرصيد الأدنى والحجز التقديري والعمولة النهائية 10%", () => {
    expect(currencyMigration).toContain("coalesce(public.driver_wallet_available(p_driver_id), 0) >= 100");
    expect(baseMigration).toContain("insert into public.driver_wallet_holds");
    expect(baseMigration).toContain("greatest(coalesce(v_order.final_price, v_order.estimated_price, 0), 0)::numeric * v_rate");
    expect(baseMigration).toContain("v_rate := coalesce(public.driver_wallet_commission_rate(auth.uid(), now()), 0);");
    expect(baseMigration).toContain("'commission', -v_commission");
  });

  it("يثبت إعداد التسعير الإداري المحمي ووحدة الليرة الجديدة", () => {
    expect(pricingMigration).toContain("currency_code text not null default 'SYP_NEW'");
    expect(pricingMigration).toContain("if auth.role() <> 'service_role' and not private.is_admin() then");
    expect(pricingTimeMigration).toContain("per_minute bigint");
    expect(pricingTimeMigration).toContain("estimated_duration_seconds");
    expect(adminWeb).toContain('app.put("/admin/api/pricing-settings"');
    expect(adminUi).toContain("/admin/api/pricing-settings");
    expect(adminIndex).toContain('data-view="pricing"');
  });

  it("يثبت أن الخادم يعيد حساب السعر ولا يثق بقيمة العميل", () => {
    expect(routers).toContain("const serverEstimatedPrice = estimateDeliveryPrice(input.distanceM, input.durationSeconds, serverPricing)");
    expect(routers).toContain("estimated_price: serverEstimatedPrice");
    expect(routers).toContain('rpc("get_delivery_pricing_settings")');
  });

  it("يعرض للمدير إجراء تعبئة واضحاً وليس تعديلاً مباشراً للرصيد", () => {
    expect(adminUi).toContain("تعبئة رصيد السفير");
    expect(adminUi).toContain("تعبئة الرصيد");
    expect(adminUi).toContain("/admin/api/wallets/${encodeURIComponent(driverId)}/deposits");
  });
});
