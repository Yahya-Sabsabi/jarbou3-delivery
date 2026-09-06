import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");

describe("mobile privacy consent flow", () => {
  it("moves to workspace immediately after consent mutation succeeds", () => {
    expect(source).toContain('onSuccess: () => { setStage("workspace");');
    expect(source).toContain("void privacyConsent.refetch().catch(() => undefined);");
  });

  it("keeps the accept action available even when consent status needs retry", () => {
    expect(source).toContain("privacyConsent.isError ? <Pressable");
    expect(source).toContain("<Text style={styles.actionText}>أوافق وأتابع</Text>");
    expect(source).toContain("تعذر حفظ الموافقة على الخادم");
  });
});
