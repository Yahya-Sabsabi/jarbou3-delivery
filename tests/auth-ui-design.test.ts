import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
const design = readFileSync(resolve(process.cwd(), "components/auth-design-system.tsx"), "utf8");
const tabs = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");

describe("OPTIMUS X authentication UI design contract", () => {
  it("shares one RTL-safe authentication design system", () => {
    expect(app).toContain("<AuthShell>");
    expect(app).toContain("<AuthHeader");
    expect(app).toContain("<AuthIntro");
    expect(app).toContain("<AuthInput");
    expect(app).toContain("<AuthPrimaryButton");
    expect(design).toContain("KeyboardAvoidingView");
    expect(design).toContain('behavior={Platform.OS === "ios" ? "padding" : "height"}');
    expect(design).toContain("flexDirection: \"row-reverse\"");
    expect(design).toContain("keyboardShouldPersistTaps=\"handled\"");
  });

  it("keeps customer and driver registration fields and document flows", () => {
    expect(app).toContain("role === \"driver\"");
    expect(app).toContain("<VehicleOption");
    expect(app).toContain("<AuthDocumentCard");
    expect(app).toContain("captureOnboardingDocument(\"personal\")");
    expect(app).toContain("captureOnboardingDocument(\"identity\")");
    expect(app).toContain("submitOnboarding.mutate");
    expect(app).toContain("signIn.mutate");
  });

  it("does not expose application bottom navigation during auth", () => {
    expect(app).toContain('stage === "workspace"');
    expect(tabs).toContain('tabBarStyle: { display: "none" }');
    expect(app).not.toContain("<PremiumCustomerNav active=\"home\" onHome={() => setStage");
  });
});
