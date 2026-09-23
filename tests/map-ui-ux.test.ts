import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
const app = root("components/jarbou3-app.tsx");
const mapScreen = root("components/optimus-map-screen.tsx");
const loader = root("components/hama-map-loader.tsx");
const maplibre = root("components/hama-map-maplibre.native.tsx");
const premiumSheet = root("components/premium-order-sheet.tsx");
const premiumProfile = root("components/premium-profile-panel.tsx");
const tabsLayout = root("app/(tabs)/_layout.tsx");

describe("OPTIMUS X MapLibre map UI/UX contract", () => {
  it("keeps map controls below the status bar and sheet content above the navigation bar", () => {
    expect(mapScreen).toContain("insets.top + 12");
    expect(mapScreen).toContain("insets.bottom");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom, 20)");
    expect(app).toContain("paddingBottom: Math.max(insets.bottom + 30, 42)");
  });

  it("uses MapLibre Native with the OpenFreeMap Liberty vector style", () => {
    expect(loader).toContain("hama-map-maplibre.native");
    expect(maplibre).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(maplibre).toContain("<Map");
    expect(maplibre).toContain("<Camera");
    expect(maplibre).toContain("androidView=\"surface\"");
    expect(maplibre).toContain("touchZoom");
    expect(maplibre).toContain("doubleTapZoom");
    expect(maplibre).toContain("HAMA_MAX_BOUNDS");
    expect(maplibre).not.toContain("react-native-maps");
    expect(maplibre).not.toContain("WebView");
  });

  it("keeps Hama initial center, bounded zoom and native fixed-center selection", () => {
    expect(maplibre).toContain("HAMA_INITIAL_REGION.latitude");
    expect(maplibre).toContain("minZoom={11}");
    expect(maplibre).toContain("maxZoom={19}");
    expect(maplibre).toContain("onRegionDidChange={syncCenter}");
    expect(maplibre).not.toContain("styles.centerPin");
    expect(maplibre).toContain("mapRef.current.getCenter()");
  });

  it("keeps live driver updates separate from map rendering", () => {
    expect(maplibre).toContain("driverLocation");
    expect(maplibre).toContain("id=\"driver-marker\"");
    expect(maplibre).toContain("id=\"route-path\"");
    expect(maplibre).toContain("actualPath.length > 1");
    expect(maplibre).toContain("<UserLocation />");
  });

  it("provides explicit loading, error and retry states", () => {
    expect(maplibre).toContain("onDidFinishLoadingMap");
    expect(maplibre).toContain("onDidFailLoadingMap");
    expect(maplibre).toContain("إعادة المحاولة");
    expect(maplibre).toContain("setRetryNonce");
  });

  it("keeps the compact map preview removed from customer home", () => {
    expect(app).not.toContain("<HamaMap compact source={source}");
    expect(app).toContain("الخريطة الكاملة داخل الطلب");
  });

  it("renders a geographic pin and hides it when the bottom sheet is expanded", () => {
    expect(mapScreen).toContain('testID="center-selection-pin"');
    expect(mapScreen).toContain("sheetIndex < snapPoints.length - 1");
    expect(mapScreen).toContain("onChange={setSheetIndex}");
    expect(mapScreen).toContain("index={0}");
    expect(mapScreen).toContain("centerMarkerDot");
    expect(mapScreen).not.toContain("centerMarkerPin: { width: 34, height: 34, borderRadius: 18");
  });

  it("exposes the Premium order sheet, floating options and customer navigation", () => {
    expect(premiumSheet).toContain("جاهز لتحديد رحلتك");
    expect(premiumSheet).toContain("إضافة كود خصم");
    expect(premiumSheet).toContain("العناوين المفضلة");
    expect(premiumSheet).toContain("الرئيسية");
    expect(premiumSheet).toContain("الطلبات");
    expect(premiumSheet).toContain("الحساب");
    expect(premiumSheet).toContain("testID=\"premium-more-menu\"");
    expect(app).toContain("PremiumCustomerNav");
    expect(app).toContain('type CustomerPage = "home" | "order" | "orders"');
  });

  it("keeps the bottom sheet keyboard-safe and fully scrollable", () => {
    expect(mapScreen).toContain("KeyboardAwareFocusView");
    expect(mapScreen).toContain("BottomSheetScrollView");
    expect(mapScreen).toContain('keyboardBehavior="interactive"');
    expect(mapScreen).toContain('keyboardBlurBehavior="restore"');
    expect(mapScreen).toContain('android_keyboardInputMode="adjustResize"');
    expect(mapScreen).not.toContain("automaticallyAdjustKeyboardInsets");
    expect(mapScreen).toContain('keyboardShouldPersistTaps="handled"');
    expect(mapScreen).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
  });

  it("keeps form fields interactive above the keyboard and preserves auth flow", () => {
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain('keyboardShouldPersistTaps="handled"');
    expect(app).toContain('keyboardDismissMode="on-drag"');
    expect(mapScreen).toContain("paddingBottom: Math.max(insets.bottom + 220, 220)");
    expect(premiumSheet).toContain("confirmButton");
    expect(app).toContain("signIn");
  });

  it("uses the shared Premium RTL profile design and removes the duplicate Router tab bar", () => {
    expect(premiumProfile).toContain("الطلبات");
    expect(premiumProfile).toContain("العناوين المفضلة");
    expect(premiumProfile).toContain("كوبونات الخصم");
    expect(premiumProfile).toContain("الإشعارات");
    expect(premiumProfile).toContain("الدعم والمساعدة");
    expect(premiumProfile).toContain("تسجيل الخروج");
    expect(premiumProfile).toContain('active="profile"');
    expect(tabsLayout).toContain('tabBarStyle: { display: "none", height: 0, borderTopWidth: 0 }');
    expect(tabsLayout).not.toContain('title: "Home"');
  });

  it("keeps the account-choice onboarding and home screen within the shared premium design", () => {
    expect(app).toContain("إلى أين نوصلك اليوم؟");
    expect(app).toContain("أنا عميل");
    expect(app).toContain("أنا سفير");
    expect(app).toContain("roleOption");
    expect(app).toContain("homeHeader");
    expect(app).toContain("إلى أين نوصلك اليوم؟");
    expect(app).toContain("createOrderText");
    expect(app).toContain("recentTitle");
    expect(app).not.toContain('title: "Home"');
  });

  it("opens a real profile panel and keeps location feedback inline", () => {
    expect(app).toContain("<ProfilePanel");
    expect(app).toContain("onProfile={() => setPage(\"profile\")}");
    expect(app).toContain("setLocationNotice");
    expect(app).not.toContain('Alert.alert("تم تحديد الاستلام"');
    expect(app).not.toContain('Alert.alert("تم تحديد الوجهة"');
  });
});
