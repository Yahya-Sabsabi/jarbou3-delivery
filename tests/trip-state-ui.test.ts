import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("components/jarbou3-app.tsx", "utf8");
const router = readFileSync("server/routers.ts", "utf8");
const startMigration = readFileSync("supabase/migrations/20260908_trip_start_after_arrival.sql", "utf8");
const cancelMigration = readFileSync("supabase/migrations/20260908_customer_cancel_before_start.sql", "utf8");

describe("OPTIMUS X trip state contract", () => {
  it("keeps acceptance separate from server-authoritative trip start", () => {
    expect(router).toContain("startTrip: publicProcedure");
    expect(startMigration).toContain("o.status = 'accepted'");
    expect(startMigration).toContain("DRIVER_NOT_AT_PICKUP");
    expect(startMigration).toContain("status = 'started'");
    expect(app).toContain("<SwipeStartButton");
  });

  it("allows customer cancellation only before started", () => {
    expect(app).toContain('["requested", "accepted", "arriving", "awaiting_otp"]');
    expect(app).toContain("startedTrip = trackingStatus === \"started\"");
    expect(cancelMigration).toContain("CANNOT_CANCEL_STARTED_TRIP");
  });

  it("does not show verification workspace after approval and calls available work requests", () => {
    expect(app).toContain('page === "verify" && !driverIsApproved');
    expect(app).toContain("طلبات قريبة");
    expect(app).toContain("لا توجد طلبات حالياً");
    expect(app).toContain("قبول الطلب");
  });
});
