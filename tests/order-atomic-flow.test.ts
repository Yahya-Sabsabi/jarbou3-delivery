import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(__dirname, "../supabase/migrations/20260822_jarbou3_schema.sql");
const migration = readFileSync(migrationPath, "utf8");
const locationMigration = readFileSync(resolve(__dirname, "../supabase/migrations/20260822_jarbou3_driver_realtime_location.sql"), "utf8");

describe("atomic order flow contract", () => {
  it("accepts only an unassigned requested order inside one update", () => {
    const functionBody = migration.slice(migration.indexOf("create or replace function public.accept_order"), migration.indexOf("create or replace function public.decline_order_offer"));
    expect(functionBody).toContain("set driver_id = auth.uid(), status = 'accepted'");
    expect(functionBody).toContain("where id = p_order_id and status = 'requested' and driver_id is null");
    expect(functionBody).toContain("returning * into accepted_order");
    expect(functionBody).toContain("raise exception 'ORDER_UNAVAILABLE'");
  });

  it("keeps customer and assigned-driver reads scoped by auth.uid", () => {
    expect(migration).toContain("customer_id = auth.uid() or driver_id = auth.uid()");
    expect(locationMigration).toContain("o.customer_id = auth.uid()");
    expect(locationMigration).toContain("o.status in ('accepted', 'arriving', 'awaiting_otp')");
  });
});
