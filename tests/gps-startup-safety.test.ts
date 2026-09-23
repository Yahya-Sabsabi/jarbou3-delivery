import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Android GPS startup safety", () => {
  const appSource = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");

  it("starts native tracking only in the approved driver workspace", () => {
    expect(appSource).toContain("const shouldTrackAcceptedOrder = (page === \"home\" || page === \"drive\") && Boolean(accessToken) && driverIsApproved;");
    expect(appSource).toContain("if (!shouldTrackAcceptedOrder || !accessToken) return;");
    expect(appSource).toContain("[page, accessToken, driverIsApproved, activeOrder?.id]");
  });

  it("does not retain the old login-time home-or-drive watcher gate", () => {
    expect(appSource).not.toContain('if ((page !== "home" && page !== "drive") || !accessToken || !driverIsApproved) return;');
    expect(appSource).not.toContain('if (page === "drive") {\n          const status = await startJarbou3BackgroundTracking();');
  });
});
