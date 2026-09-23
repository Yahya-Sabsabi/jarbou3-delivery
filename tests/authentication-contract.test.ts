import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeJarbou3Phone } from "../shared/jarbou3-phone";
import { resolveJarbou3ApiBaseUrl } from "../shared/jarbou3-api";

const here = dirname(fileURLToPath(import.meta.url));
const contract = readFileSync(resolve(here, "../docs/authentication-contract.md"), "utf8");
const app = readFileSync(resolve(here, "../components/jarbou3-app.tsx"), "utf8");
const routers = readFileSync(resolve(here, "../server/routers.ts"), "utf8");

// This suite is intentionally a contract suite: it should fail loudly if a future
// refactor removes the shared customer/driver authentication path or API resolver.
describe("OPTIMUS X authentication contract", () => {
  it("keeps Syrian local and international phone formats equivalent", () => {
    expect(normalizeJarbou3Phone("0944 123 456")).toBe("+963944123456");
    expect(normalizeJarbou3Phone("+963 944-123 456")).toBe("+963944123456");
  });

  it("keeps the shared customer and driver auth implementation present", () => {
    expect(app).toContain("submitSignIn");
    expect(app).toContain("submitOnboarding");
    expect(app).toContain("expectedRole: role");
    expect(routers).toContain("signIn");
    expect(routers).toContain("submitOnboarding");
    expect(routers).toContain("SIGN_IN_ROLE_MISMATCH");
  });

  it("never routes a standalone native build to a Metro preview when production is embedded", () => {
    expect(resolveJarbou3ApiBaseUrl({
      configuredApiBaseUrl: "https://stale-preview.example",
      embeddedApiBaseUrl: "https://jarbou-deliv-xoohmte2.manus.space",
      isWeb: false,
      isExpoGo: false,
      expoHostUri: "8081-old-preview.example",
    })).toBe("https://jarbou-deliv-xoohmte2.manus.space");
  });

  it("keeps the written contract in the repository", () => {
    expect(contract).toContain("عقد المصادقة المحمي");
    expect(contract).toContain("قاعدة محمية");
  });
});
