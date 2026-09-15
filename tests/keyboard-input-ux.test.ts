import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const keyboard = readFileSync(resolve(process.cwd(), "components/keyboard-aware.tsx"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "components/auth-design-system.tsx"), "utf8");
const mapScreen = readFileSync(resolve(process.cwd(), "components/optimus-map-screen.tsx"), "utf8");
const manifest = readFileSync(resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml"), "utf8");
const app = readFileSync(resolve(process.cwd(), "components/jarbou3-app.tsx"), "utf8");
const orderSheet = readFileSync(resolve(process.cwd(), "components/premium-order-sheet.tsx"), "utf8");

describe("keyboard and text input UX", () => {
  it("uses runtime keyboard measurements and focused-node measurement instead of fixed large offsets", () => {
    expect(keyboard).toContain("Keyboard.addListener(\"keyboardDidShow\"");
    expect(keyboard).toContain("Keyboard.metrics?.()?.height");
    expect(keyboard).toContain("UIManager.measureInWindow");
    expect(keyboard).toContain("scrollTo({ y: nextOffset, animated: true })");
    expect(keyboard).not.toContain("paddingBottom: 300");
    expect(keyboard).not.toContain("translateY: -300");
  });

  it("covers auth, order BottomSheet, search, discount, and favorite fields", () => {
    expect(auth).toContain("KeyboardAwareScrollView");
    expect(mapScreen).toContain("KeyboardAwareFocusView");
    expect(mapScreen).toContain("automaticallyAdjustKeyboardInsets");
    expect(app).toContain("stage === \"recoveryRequest\") return <AuthShell>");
    expect(app).toContain("stage === \"recoveryCode\") return <AuthShell>");
    expect(app).toContain("<KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1");
    expect(app).toContain("if (page === \"otp\") return <KeyboardAwareScrollView");
    expect(app).toContain("if (page === \"deliver\") return <KeyboardAwareScrollView");
    expect(app).toContain("if (stage === \"code\") return <KeyboardAwareScrollView");
    expect(app).toContain("if (stage === \"password\") return <KeyboardAwareScrollView");
    expect(orderSheet).toContain("placeholder=\"ابحث عن حي أو شارع أو متجر\"");
    expect(orderSheet).toContain("placeholder=\"مثال: JARBOU3\"");
    expect(orderSheet).toContain("placeholder=\"مثال: المنزل\"");
  });

  it("keeps Android adjustResize and tap-through behavior enabled", () => {
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    expect(auth).toContain("contentContainerStyle={styles.scroll}");
    expect(mapScreen).toContain('keyboardShouldPersistTaps="handled"');
    expect(mapScreen).toContain('keyboardDismissMode="interactive"');
    expect(mapScreen).toContain('<BottomSheetScrollView');
    expect(mapScreen).toContain('<KeyboardAwareFocusView scrollRef={nativeScrollRef}');
    expect(keyboard).not.toContain('<KeyboardAvoidingView');
  });
});
