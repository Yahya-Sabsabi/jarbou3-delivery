import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sessionSource = fs.readFileSync(path.resolve(process.cwd(), "lib/jarbou3-session.ts"), "utf8");
const appSource = fs.readFileSync(path.resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");

describe("persistent auth session", () => {
  it("persists the access and refresh tokens plus the customer/driver profile", () => {
    expect(sessionSource).toContain('const PROFILE_KEY = "jarbou3.session-profile"');
    expect(sessionSource).toContain("async save(accessToken: string, refreshToken: string, profile?: SavedSessionProfile)");
    expect(sessionSource).toContain("writeJson(PROFILE_KEY, profile)");
    expect(sessionSource).toContain("SecureStore.deleteItemAsync(PROFILE_KEY)");
  });

  it("performs a splash restoration check and verifies the saved token with sessionProfile", () => {
    expect(appSource).toContain("jarbou3Session.getAccessToken()");
    expect(appSource).toContain("jarbou3Session.getProfile()");
    expect(appSource).toContain("trpc.jarbou3.sessionProfile.useQuery");
    expect(appSource).toContain('setStage(savedSession.data.pendingPassword ? "password" : "workspace")');
  });

  it("clears the persisted session before returning to account choice", () => {
    const logoutStart = appSource.indexOf("const logout = async ()");
    const logoutEnd = appSource.indexOf("const refreshRuntimeReadiness", logoutStart);
    const logoutSource = appSource.slice(logoutStart, logoutEnd);
    expect(logoutSource).toContain("jarbou3Session.clear()");
    expect(logoutSource).toContain("jarbou3Session.clearOnboarding()");
    expect(logoutSource).toContain('setStage("choose")');
  });
});
