import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260908_customer_cancel_before_start.sql"), "utf8");

describe("customer cancellation contract", () => {
  it("calls the authenticated customer RPC and clears the active trip after success", () => {
    expect(router).toContain("cancelCustomerOrder: publicProcedure");
    expect(router).toContain('requireRole(input.accessToken, ["customer"])');
    expect(router).toContain('rpc("cancel_order_by_customer", { p_order_id: input.orderId })');
    expect(app).toContain("jarbou3Session.clearActiveTrip()");
    expect(app).toContain("onTripActivity(false)");
  });

  it("defines the deployed function with customer ownership and pre-start status guards", () => {
    expect(migration).toContain("create or replace function public.cancel_order_by_customer(p_order_id uuid)");
    expect(migration).toContain("returns public.orders");
    expect(migration).toContain("customer_id = auth.uid()");
    expect(migration).toContain("status in ('requested', 'accepted', 'arriving', 'awaiting_otp')");
    expect(migration).toContain("CANNOT_CANCEL_STARTED_TRIP");
    expect(migration).toContain("grant execute on function public.cancel_order_by_customer(uuid) to authenticated");
  });

  it("keeps the cancel action hidden once the trip has started", () => {
    expect(app).toContain('const canCancelCustomerOrder = ["requested", "accepted", "arriving", "awaiting_otp"].includes(trackingStatus);');
    expect(app).toContain('const startedTrip = trackingStatus === "started";');
    expect(app).toContain("بدأت الرحلة؛ الإلغاء غير متاح");
    expect(app).toContain("لم يعد هذا الطلب قابلاً للإلغاء.");
  });
});
