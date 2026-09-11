import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../lib/jarbou3-notifications.ts"), "utf8");

describe("notification native initialization safety", () => {
  it("does not initialize the native notifications module at import time", () => {
    expect(source).not.toMatch(/\nif \(canUseNativePush\) \{/);
    expect(source).not.toMatch(/\nNotifications\.setNotificationHandler\(/);
    expect(source).toContain('require("expo-notifications")');
  });

  it("keeps native module loading behind a guarded function", () => {
    expect(source).toContain("function getNotificationsModule()");
    expect(source).toContain("catch (error)");
    expect(source).toContain("return null;");
  });

  it("does not start Android push setup during workspace entry", () => {
    expect(source).toContain('if (!canUseNativePush || Platform.OS === "android") return null;');
    expect(source).not.toContain("setNotificationChannelAsync");
  });
});
