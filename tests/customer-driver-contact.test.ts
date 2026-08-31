import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(__dirname, "../server/routers.ts"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../components/jarbou3-app.tsx"), "utf8");
const repositorySource = readFileSync(resolve(__dirname, "../infrastructure/repositories/supabase-customer-trip-repository.ts"), "utf8");

describe("customer-visible driver contact contract", () => {
  it("scopes the driver lookup to the authenticated customer's assigned order", () => {
    const trackingBlock = routerSource.slice(routerSource.indexOf("currentCustomerTracking:"), routerSource.indexOf("currentCustomerTripPath:"));
    expect(trackingBlock).toContain("requireRole(input.accessToken, [\"customer\"])");
    expect(repositorySource).toContain('.eq("customer_id", customerId)');
    expect(repositorySource).toContain('.select("name,phone,vehicle_type")');
    expect(repositorySource).toContain('.eq("role", "driver")');
    expect(repositorySource).toContain('.eq("is_active", true)');
    expect(repositorySource).toContain("fullName: typeof value.name === \"string\"");
  });

  it("does not reopen a stale role form without an active request", () => {
    expect(appSource).toContain("const canResume = Boolean(saved?.requestId)");
    expect(appSource).toContain("setStage(\"choose\")");
  });

  it("opens a native tel link only when the sanitized driver phone exists", () => {
    expect(appSource).toContain("Linking.openURL(`tel:${visibleDriver.phone}`)");
    expect(appSource).toContain("driverVehicleLabel(visibleDriver.vehicleType)");
    expect(appSource).toContain("لم يُسجّل السفير رقم اتصال صالحاً حالياً");
  });
});
