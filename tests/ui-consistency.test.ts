import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "components/premium-empty-results-dialog.tsx"), "utf8");
const profile = readFileSync(resolve(process.cwd(), "components/premium-profile-panel.tsx"), "utf8");

describe("OPTIMUS X shared UI consistency", () => {
  it("uses the shared auth system for password recovery", () => {
    expect(app).toContain('stage === "recoveryRequest") return <AuthShell>');
    expect(app).toContain('stage === "recoveryWaiting") return <AuthShell>');
    expect(app).toContain('stage === "recoveryCode") return <AuthShell>');
    expect(app).toContain('stage === "recoveryPassword") return <AuthShell>');
    expect(app).not.toContain('stage === "recoveryRequest") return <ScrollView');
  });

  it("removes the old footer and top logout control without removing main branding", () => {
    expect(app).not.toContain("styles.chooseFooter");
    expect(app).not.toContain('<Text style={styles.accessButtonText}>تسجيل الخروج</Text>');
    expect(app).toContain("OPTIMUS X");
    expect(app).toContain("<ProblemReportButton accessToken={savedToken} />");
  });

  it("removes legacy product branding from the customer profile surface", () => {
    expect(profile).not.toContain("مستخدم OPTIMUS X");
    expect(profile).not.toContain("عميل OPTIMUS X");
    expect(profile).toContain("<Text style={styles.role}>عميل</Text>");
  });

  it("uses an in-app RTL empty-results dialog instead of the default Alert", () => {
    expect(app).toContain("PremiumEmptyResultsDialog");
    expect(app).toContain("setEmptyResultsVisible(!merged.length)");
    expect(app).not.toContain('Alert.alert("لا توجد نتائج"');
    expect(dialog).toContain("لا توجد نتائج");
    expect(dialog).toContain("حسنًا");
    expect(dialog).toContain("animationType=\"fade\"");
    expect(dialog).toContain("rgba(22, 37, 29, 0.34)");
  });
});
