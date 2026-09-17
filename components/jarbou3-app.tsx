import { Image } from "expo-image";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, Alert, Animated, AppState, BackHandler, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";

import { trpc } from "@/lib/trpc";
import { jarbou3Session } from "@/lib/jarbou3-session";
import { DEFAULT_DELIVERY_PRICING, HAMA_CENTER, estimateDeliveryPrice, formatSyp, type MapPoint } from "@/shared/jarbou3";
import { HamaMap } from "@/components/hama-map-loader";
import { PremiumCustomerNav, PremiumFavoritesMenu, PremiumMoreMenu, PremiumOrderSheet } from "@/components/premium-order-sheet";
import { KeyboardAwareScrollView } from "@/components/keyboard-aware";
import { PremiumProfilePanel } from "@/components/premium-profile-panel";
import { OptimusMapScreen } from "@/components/optimus-map-screen";
import { PremiumEmptyResultsDialog } from "@/components/premium-empty-results-dialog";
import { SwipeStartButton } from "@/components/swipe-start-button";
import { AuthConsent, AuthDocumentCard, AuthHeader, AuthInput, AuthIntro, AuthLink, AuthPrimaryButton, AuthSection, AuthShell, VehicleOption } from "@/components/auth-design-system";
import { getCurrentHamaLocation, watchHamaLocation } from "@/lib/jarbou3-location";
import { getOsrmRoute, type RouteEstimate } from "@/lib/osrm";
import { configureJarbou3Realtime, subscribeToCustomerOrder, subscribeToOrderLiveLocation, unsubscribeRealtime } from "@/lib/jarbou3-realtime";
import { openRuntimeLocationSettings, readRuntimeReadiness, requestRuntimeLocationPermission, type RuntimeReadiness } from "@/lib/jarbou3-runtime";
import { isVersionBelow } from "@/lib/jarbou3-release";
import { normalizeProblemReportMessage, problemReportErrorMessage } from "@/shared/jarbou3-report";
import { driverVehicleLabel, type CustomerVisibleDriver } from "@/shared/jarbou3-driver";
import { isJarbou3Phone, normalizeJarbou3Digits, normalizeJarbou3Otp, normalizeJarbou3Phone } from "@/shared/jarbou3-phone";
import { JARBOU3_PRIVACY_POLICY_TEXT, JARBOU3_PRIVACY_POLICY_VERSION } from "@/shared/jarbou3-privacy";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";

type Role = "customer" | "driver";
type CustomerPage = "home" | "order" | "orders" | "track" | "otp" | "profile";
type DriverPage = "home" | "verify" | "drive" | "deliver";
type DriverOrderPreview = { id: string; source_address: string; source_lat: number | string; source_lng: number | string; destination_address: string; destination_lat: number | string; destination_lng: number | string; estimated_price: number; payment_method: "cash" | "sham_cash"; distance_m: number; distance_to_pickup_m?: number | string; offer_expires_at?: string | null; offer_round?: number };
type DriverTripMetrics = { actual_distance_m: number | string; moving_seconds: number | string; elapsed_seconds: number | string; last_recorded_at: string };
type DriverCompanyBalance = { total_commission_amount: number | string; paid_amount: number | string; outstanding_amount: number | string; payment_count: number | string; last_payment_at: string | null };
type DriverWallet = { balance_amount: number | string; held_amount: number | string; available_amount: number | string; grace_ends_at: string | null; grace_active: boolean };
type HamaAddressResult = { label: string; latitude: number; longitude: number; kind: "shop" | "street" | "place" };

const dark = "#1E1E1E";
const gray = "#4A4A4A";

function haptic() {
  if (Platform.OS !== "web") {
    void import("expo-haptics")
      .then(({ impactAsync, ImpactFeedbackStyle }) => impactAsync(ImpactFeedbackStyle.Light))
      .catch(() => undefined);
  }
}

function Action({ title, onPress, kind = "solid" }: { title: string; onPress: () => void; kind?: "solid" | "outline" | "dark" }) {
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} style={({ pressed }) => [styles.action, kind === "outline" && styles.actionOutline, kind === "dark" && styles.actionDark, pressed && styles.pressed]}>
      <Text style={[styles.actionText, kind === "outline" && styles.actionOutlineText]}>{title}</Text>
    </Pressable>
  );
}

function Tag({ children, status = false }: { children: ReactNode; status?: boolean }) {
  return <View style={[styles.tag, status && styles.tagStatus]}><Text style={[styles.tagText, status && styles.tagStatusText]}>{children}</Text></View>;
}

function Mark({ small = false }: { small?: boolean }) {
  return <View style={[styles.mark, small && styles.markSmall]}><Image source={require("@/assets/images/icon.png")} style={styles.markImage} contentFit="cover" /></View>;
}

function PrivacyPolicySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.policySheet}><View style={styles.policyHeader}><Text style={styles.policySheetTitle}>شروط الاستخدام والخصوصية</Text><Pressable onPress={onClose} style={styles.policyClose}><Text style={styles.policyCloseText}>إغلاق</Text></Pressable></View><ScrollView style={styles.policyScroll} contentContainerStyle={styles.policyScrollContent}><Text style={styles.policyText}>{JARBOU3_PRIVACY_POLICY_TEXT}</Text></ScrollView><Pressable onPress={onClose} style={styles.authAction}><Text style={styles.actionText}>العودة إلى التسجيل</Text></Pressable></View></View></Modal>;
}

function Heading({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: string }) {
  return (
    <View style={styles.headingRow}>
      <View>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.heading}>{title}</Text></View>
      {aside ? <Text style={styles.aside}>{aside}</Text> : null}
    </View>
  );
}

function ProblemReportButton({ accessToken }: { accessToken: string | null | undefined }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const submitReport = trpc.jarbou3.submitProblemReport.useMutation({
    onSuccess: () => { setMessage(""); setVisible(false); Alert.alert("تم إرسال البلاغ", "وصل بلاغك إلى الإدارة وسيُراجع ضمن بوابة الإدارة."); },
    onError: (error) => Alert.alert("تعذر إرسال البلاغ", problemReportErrorMessage(error.message)),
  });
  const insets = useSafeAreaInsets();
  if (!accessToken) return null;
  const send = async () => {
    if (submitReport.isPending) return;
    const normalizedMessage = normalizeProblemReportMessage(message);
    if (normalizedMessage.length < 10) return Alert.alert("اكتب تفاصيل أكثر", "اكتب وصفاً للمشكلة من عشر خانات على الأقل ليصل واضحاً إلى الإدارة.");
    const latestToken = await jarbou3Session.getAccessToken();
    if (!latestToken) return Alert.alert("انتهت الجلسة", "سجّل الدخول من جديد ثم أرسل البلاغ.");
    submitReport.mutate({ accessToken: latestToken, message: normalizedMessage });
  };
  return <><Pressable onPress={() => setVisible(true)} style={styles.reportIssueButton}><Text style={styles.reportIssueText}>الإبلاغ عن مشكلة</Text></Pressable><Modal transparent animationType="slide" visible={visible} onRequestClose={() => setVisible(false)}><View style={styles.modalBackdrop}><KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingBottom: Math.max(insets.bottom + 16, 28) }}><View style={[styles.problemSheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}><Text style={styles.problemTitle}>الإبلاغ عن مشكلة</Text><Text style={styles.problemCopy}>اكتب المشكلة بوضوح؛ يصل البلاغ مباشرة إلى لوحة الإدارة.</Text><TextInput value={message} onChangeText={setMessage} placeholder="مثال: واجهت مشكلة في الطلب أو الحساب…" placeholderTextColor="#8A8A8A" multiline maxLength={1500} textAlign="right" textAlignVertical="top" style={styles.problemInput} /><Action title={submitReport.isPending ? "جارٍ الإرسال…" : "إرسال البلاغ"} onPress={send} /><Action title="إلغاء" kind="outline" onPress={() => setVisible(false)} /></View></KeyboardAwareScrollView></View></Modal></>;
}

function RoleSwitch({ role, onSelect }: { role: Role; onSelect: (role: Role) => void }) {
  return <View style={styles.roleSwitch}>{(["customer", "driver"] as Role[]).map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.role, role === option && styles.roleSelected]}><Text style={[styles.roleText, role === option && styles.roleTextSelected]}>{option === "customer" ? "عميل" : "سائق"}</Text></Pressable>)}</View>;
}

function ProfilePanel({ name, phone, onBack, onLogout, onOrders }: { name: string; phone?: string; onBack: () => void; onLogout: () => void; onOrders: () => void }) {
  const [policyVisible, setPolicyVisible] = useState(false);
  return <><PremiumProfilePanel name={name} phone={phone} onBack={onBack} onLogout={onLogout} onOrders={onOrders} onHome={onBack} onPolicy={() => setPolicyVisible(true)} /><PrivacyPolicySheet visible={policyVisible} onClose={() => setPolicyVisible(false)} /></>;
}

function Customer({ name, phone, onTripActivity, onLogout }: { name: string; phone?: string; onTripActivity: (active: boolean) => void; onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<CustomerPage>("home");
  const navigateCustomer = (next: CustomerPage) => { if (next === page) return; setPage(next); };
  const [source, setSource] = useState<MapPoint | null>(null);
  const [destination, setDestination] = useState<MapPoint | null>(null);
  const [selecting, setSelecting] = useState<"source" | "destination">("source");
  const [mapFocusZoom, setMapFocusZoom] = useState(13);
  const [mapFocusRequestId, setMapFocusRequestId] = useState(0);
  const [route, setRoute] = useState<RouteEstimate | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [driverLocation, setDriverLocation] = useState<MapPoint | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [payment, setPayment] = useState<"نقدي" | "شام كاش">("نقدي");
  const [otp, setOtp] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<HamaAddressResult[]>([]);
  const [emptyResultsVisible, setEmptyResultsVisible] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [pickupEtaSeconds, setPickupEtaSeconds] = useState<number | null>(null);
  const [acceptedNotice, setAcceptedNotice] = useState(false);
  const [previousDriverId, setPreviousDriverId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("جارٍ فتح التحديث المباشر…");
  const [searchFilter, setSearchFilter] = useState<"all" | "shops" | "streets">("all");
  const [favoriteLabel, setFavoriteLabel] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ discountAmount: number; finalPrice: number } | null>(null);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [favoritesMenuVisible, setFavoritesMenuVisible] = useState(false);
  const [discountExpanded, setDiscountExpanded] = useState(false);
  const createOrder = trpc.jarbou3.createOrder.useMutation({ onSuccess: async (order) => {
    await jarbou3Session.saveActiveTrip({ role: "customer", orderId: order.id, sourceAddress: "نقطة الاستلام المحددة على الخريطة، حماة", sourceLat: source?.latitude ?? 0, sourceLng: source?.longitude ?? 0, destinationAddress: "وجهة التسليم المحددة على الخريطة، حماة", destinationLat: destination?.latitude ?? 0, destinationLng: destination?.longitude ?? 0, distanceM: route?.distanceM ?? 0, savedAt: new Date().toISOString() });
    onTripActivity(true);
    setPage("track");
  }, onError: (error) => Alert.alert("تعذر إنشاء الطلب", error.message === "DISCOUNT_NOT_AVAILABLE" ? "هذا الرمز مخصص لحساب آخر ولا يمكن استخدامه لهذا العميل." : error.message) });
  const cancelCustomerOrder = trpc.jarbou3.cancelCustomerOrder.useMutation({ onSuccess: async () => { await jarbou3Session.clearActiveTrip(); onTripActivity(false); setPage("home"); Alert.alert("تم إلغاء الطلب", "أُلغي الطلب قبل بدء الرحلة."); }, onError: (error) => { const message = error.message === "CANNOT_CANCEL_STARTED_TRIP" ? "بدأت الرحلة، لذلك لم يعد الإلغاء متاحاً. يمكنك إرسال بلاغ أو متابعة السفير." : error.message === "ORDER_NOT_CANCELLABLE" ? "لم يعد هذا الطلب قابلاً للإلغاء." : error.message; Alert.alert("تعذر إلغاء الطلب", message); } });
  // Realtime is the primary transport; slow polling remains only as a recovery fallback.
  const pricingSettings = trpc.jarbou3.pricingSettings.useQuery(undefined, { staleTime: 60_000, retry: 1 });
  const currentTracking = trpc.jarbou3.currentCustomerTracking.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: page === "track" && Boolean(accessToken), refetchInterval: 30_000 });
  const customerTripPath = trpc.jarbou3.currentCustomerTripPath.useQuery({ accessToken: accessToken ?? "pending-session-token-000", orderId: currentTracking.data?.id ?? "00000000-0000-0000-0000-000000000000" }, { enabled: page === "track" && Boolean(accessToken) && Boolean(currentTracking.data?.id), refetchInterval: 30_000 });
  const addressSearch = trpc.jarbou3.searchHamaAddresses.useQuery({ query: addressQuery.trim().length >= 2 ? addressQuery.trim() : "حماة", filter: searchFilter }, { enabled: false });
  const localPlaces = trpc.jarbou3.listJarbou3Places.useQuery({ accessToken: accessToken ?? "pending-session-token-000", query: addressQuery.trim().length >= 2 ? addressQuery.trim() : undefined }, { enabled: Boolean(accessToken) && addressQuery.trim().length >= 2, retry: false });
  const discountPreview = trpc.jarbou3.previewDiscount.useQuery({ code: discountCode.trim() || "---", preDiscountPrice: route?.price ?? 0, accessToken: accessToken ?? undefined }, { enabled: false, retry: false });
  const favoriteAddresses = trpc.jarbou3.listFavoriteAddresses.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken) });
  const saveFavorite = trpc.jarbou3.saveFavoriteAddress.useMutation({ onSuccess: () => { favoriteAddresses.refetch(); setFavoriteLabel(""); Alert.alert("تم الحفظ", "أصبح العنوان ضمن عناوينك المفضلة."); }, onError: (error) => Alert.alert("تعذر الحفظ", error.message) });
  const deleteFavorite = trpc.jarbou3.deleteFavoriteAddress.useMutation({ onSuccess: () => favoriteAddresses.refetch() });
  const registerPushToken = trpc.jarbou3.registerPushToken.useMutation();
  const updateCustomerLocation = trpc.jarbou3.updateCustomerLocation.useMutation({ onError: () => setLocationNotice("تعذر إرسال موقعك إلى لوحة الإدارة؛ تحقق من GPS والاتصال."), onSuccess: () => setLocationNotice(null) });
  const clearCustomerLocation = trpc.jarbou3.clearCustomerLocation.useMutation();

  useEffect(() => { jarbou3Session.getAccessToken().then(setAccessToken); }, []);
  useEffect(() => {
    jarbou3Session.getActiveTrip().then((trip) => {
      if (trip?.role === "customer") setPage("track");
    });
  }, []);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    let remove: (() => void) | undefined;
    let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
    let starting = false;
    const clearSharedLocation = () => {
      void clearCustomerLocation.mutateAsync({ accessToken }).catch(() => undefined);
    };
    const stopTracking = () => {
      remove?.();
      remove = undefined;
    };
    const sendPoint = (point: MapPoint) => {
      if (!active) return;
      setSource((current) => current ?? point);
      updateCustomerLocation.mutate({ accessToken, location: point });
    };
    const startTracking = async () => {
      if (!active || starting || remove) return;
      starting = true;
      try {
        const point = await getCurrentHamaLocation();
        if (!active) return;
        sendPoint(point);
      } catch {
        if (active) setLocationNotice("لم نتمكن من قراءة موقعك الحالي؛ فعّل GPS واسمح بالموقع.");
      }
      if (!active) { starting = false; return; }
      try {
        const subscription = await watchHamaLocation(sendPoint, () => undefined, () => {
          if (!active) return;
          stopTracking();
          clearSharedLocation();
          setLocationNotice("تم إيقاف GPS؛ لن يظهر موقعك في لوحة الإدارة حتى تعيد تشغيله.");
        });
        if (active) remove = () => subscription.remove(); else subscription.remove();
      } catch {
        if (active) setLocationNotice("تعذر استمرار مشاركة موقعك؛ اترك GPS والاتصال مفعّلين.");
      } finally {
        starting = false;
      }
    };
    void startTracking();
    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        stopTracking();
        clearSharedLocation();
      } else {
        void startTracking();
      }
    });
    return () => { active = false; stopTracking(); appStateSubscription?.remove(); clearSharedLocation(); };
  }, [accessToken]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let previousBackAt = 0;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (page === "order" || page === "track") { setPage("home"); return true; }
      if (page === "otp") { setPage("track"); return true; }
      if (Date.now() - previousBackAt < 2_000) return false;
      previousBackAt = Date.now();
      ToastAndroid.show("اضغط رجوع مرة أخرى للخروج", ToastAndroid.SHORT);
      return true;
    });
    return () => subscription.remove();
  }, [page]);
  useEffect(() => {
    if (!accessToken) return;
    configureJarbou3Realtime(accessToken);
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken || Platform.OS === "web") return;
    let active = true;
    void import("@/lib/jarbou3-notifications")
      .then(({ registerJarbou3PushToken }) => registerJarbou3PushToken())
      .then((expoPushToken) => {
        if (!active || !expoPushToken) return;
        registerPushToken.mutate({ accessToken, expoPushToken, platform: Platform.OS === "ios" ? "ios" : "android" });
      })
      .catch((error) => console.warn("[push-init] unavailable", error));
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!source || !destination) return;
    let active = true;
    setRouteLoading(true);
    getOsrmRoute(source, destination).then((next) => { if (!active) return; const pricing = pricingSettings.data ? { minimumFare: pricingSettings.data.minimumFare, perKm: pricingSettings.data.perKm, perMinute: pricingSettings.data.perMinute } : DEFAULT_DELIVERY_PRICING; setRoute({ ...next, price: estimateDeliveryPrice(next.distanceM, next.durationSeconds, pricing) }); }).catch(() => { if (active) setRoute(null); }).finally(() => { if (active) setRouteLoading(false); });
    return () => { active = false; };
  }, [source, destination, pricingSettings.data?.minimumFare, pricingSettings.data?.perKm, pricingSettings.data?.perMinute]);
  useEffect(() => {
    const query = addressQuery.trim();
    if (page !== "order" || query.length < 2) {
      setAddressResults([]);
      setSearchingAddress(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      addressSearch.refetch().then((result) => {
        if (active) setAddressResults((result.data ?? []) as HamaAddressResult[]);
      }).catch(() => {
        if (active) setAddressResults([]);
      }).finally(() => {
        if (active) setSearchingAddress(false);
      });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [addressQuery, searchFilter, page]);

  useEffect(() => {
    if (page !== "track" || !currentTracking.data?.id) return;
    setRealtimeStatus("جارٍ فتح التحديث المباشر…");
    const orderSubscription = subscribeToCustomerOrder(currentTracking.data.id, () => {
      currentTracking.refetch();
    }, (status) => setRealtimeStatus(status === "SUBSCRIBED" ? "التحديث المباشر متصل" : status === "CHANNEL_ERROR" ? "تعذر فتح التحديث المباشر" : "جارٍ إعادة اتصال التحديث المباشر…"));
    const locationSubscription = currentTracking.data.driver_id
      ? subscribeToOrderLiveLocation(currentTracking.data.id, setDriverLocation, (status) => {
        if (status === "CHANNEL_ERROR") setRealtimeStatus("تعذر فتح قناة موقع السفير");
      })
      : null;
    return () => {
      unsubscribeRealtime(orderSubscription);
      unsubscribeRealtime(locationSubscription);
    };
  }, [page, currentTracking.data?.id, currentTracking.data?.driver_id]);

  useEffect(() => {
    if (!driverLocation || !source || page !== "track" || !currentTracking.data?.driver_id) return;
    let active = true;
    getOsrmRoute(driverLocation, source).then((next) => { if (active) setPickupEtaSeconds(next.durationSeconds); }).catch(() => { if (active) setPickupEtaSeconds(null); });
    return () => { active = false; };
  }, [driverLocation, source, page, currentTracking.data?.driver_id]);

  useEffect(() => {
    const driverId = currentTracking.data?.driver_id ?? null;
    if (page === "track" && driverId && driverId !== previousDriverId) {
      setPreviousDriverId(driverId);
      setAcceptedNotice(true);
      const timeout = setTimeout(() => setAcceptedNotice(false), 7_000);
      return () => clearTimeout(timeout);
    }
    if (!driverId) setPreviousDriverId(null);
  }, [page, currentTracking.data?.driver_id, previousDriverId]);

  const setMapPoint = (point: MapPoint) => { setMapFocusZoom(13); if (selecting === "source") setSource(point); else setDestination(point); };
  const trackedSource = currentTracking.data ? { latitude: Number(currentTracking.data.source_lat), longitude: Number(currentTracking.data.source_lng) } : source;
  const trackedDestination = currentTracking.data ? { latitude: Number(currentTracking.data.destination_lat), longitude: Number(currentTracking.data.destination_lng) } : destination;
  const liveTripPath = useMemo(() => {
    const points = ((customerTripPath.data ?? []) as Array<{ latitude: number | string; longitude: number | string }>).map((point) => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }));
    if (driverLocation && (!points.length || points[points.length - 1].latitude !== driverLocation.latitude || points[points.length - 1].longitude !== driverLocation.longitude)) points.push(driverLocation);
    return points;
  }, [customerTripPath.data, driverLocation]);
  const searchAddress = async () => {
    setEmptyResultsVisible(false);
    if (addressQuery.trim().length < 2) return Alert.alert("اكتب العنوان", "اكتب اسم شارع أو حي أو متجر داخل حماة ثم اضغط بحث.");
    setSearchingAddress(true);
    try {
      const result = await addressSearch.refetch();
      const managedPlaces: HamaAddressResult[] = ((localPlaces.data ?? []) as Array<{ name: string; latitude: number | string; longitude: number | string }>).map((place) => ({ label: place.name, latitude: Number(place.latitude), longitude: Number(place.longitude), kind: "place" }));
      const externalResults = (result.data ?? []) as HamaAddressResult[];
      const merged = [...managedPlaces, ...externalResults.filter((item) => !managedPlaces.some((place) => place.label === item.label))].slice(0, 20);
      setAddressResults(merged);
      setEmptyResultsVisible(!merged.length);
    } catch {
      Alert.alert("تعذر البحث الآن", "تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setSearchingAddress(false);
    }
  };
  const chooseAddress = (result: HamaAddressResult) => { setMapPoint({ latitude: result.latitude, longitude: result.longitude }); setAddressResults([]); setAddressQuery(result.label.split(",")[0] ?? result.label); };
  const chooseFavorite = (favorite: { latitude: number | string; longitude: number | string; address: string }) => { setMapPoint({ latitude: Number(favorite.latitude), longitude: Number(favorite.longitude) }); setAddressQuery(favorite.address); };
  const saveCurrentFavorite = () => {
    const point = selecting === "source" ? source : destination;
    if (!accessToken) return Alert.alert("سجّل الدخول أولاً", "يلزم الدخول لحفظ عنوان ضمن حسابك.");
    if (!point) return Alert.alert("اختر دبوساً", "حدّد نقطة على الخريطة ثم احفظها ضمن عناوينك.");
    const address = addressQuery.trim() || (selecting === "source" ? "نقطة استلام داخل حماة" : "نقطة تسليم داخل حماة");
    const label = favoriteLabel.trim() || (selecting === "source" ? "استلام محفوظ" : "وجهة محفوظة");
    saveFavorite.mutate({ accessToken, label, address, point });
  };
  const useMyLocation = async () => {
    setLocating(true);
    setMapFocusZoom(16);
    setMapFocusRequestId((value) => value + 1);
    setLocationNotice(null);
    try {
      const point = await getCurrentHamaLocation();
      if (!source || selecting === "source") {
        setSource(point);
        setSelecting("destination");
      } else {
        setDestination(point);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "LOCATION_UNAVAILABLE";
      setLocationNotice(code === "OUTSIDE_HAMA_SERVICE_RADIUS"
        ? "موقعك خارج نطاق خدمة حماة البالغ ٧ كم. اختر عنواناً داخل النطاق."
        : code === "LOCATION_SERVICES_DISABLED"
          ? "فعّل GPS من إعدادات الهاتف ثم اضغط زر الموقع مرة أخرى."
          : code === "LOCATION_PERMISSION_DENIED"
            ? "اسمح للتطبيق بالوصول إلى الموقع أثناء الاستخدام ثم أعد المحاولة."
            : "تعذر تثبيت الموقع بدقة كافية. انتظر لحظات في مكان مفتوح ثم أعد المحاولة.");
    } finally {
      setLocating(false);
    }
  };
  const submitOrder = async () => {
    if (!source || !destination || !route) return Alert.alert("اختر النقطتين", "ضع دبوس الاستلام ودبوس التسليم داخل دائرة حماة أولاً.");
    const accessToken = await jarbou3Session.getAccessToken();
    if (!accessToken) return Alert.alert("سجّل الدخول أولاً", "يلزم الدخول الآمن لإنشاء طلب محفوظ ومتابعة السائق.");
    createOrder.mutate({ accessToken, sourceAddress: "نقطة الاستلام المحددة على الخريطة، حماة", destinationAddress: "وجهة التسليم المحددة على الخريطة، حماة", source, destination, estimatedPrice: route.price, paymentMethod: payment === "نقدي" ? "cash" : "sham_cash", distanceM: route.distanceM, durationSeconds: route.durationSeconds, discountCode: discountCode.trim() || undefined });
  };
  const verifyDiscount = async () => {
    if (!route || discountCode.trim().length < 3) return Alert.alert("أدخل الرمز", "اكتب رمز الخصم الذي وصلك ثم اضغط تحقق.");
    try {
      const result = await discountPreview.refetch();
      if (!result.data) throw new Error("DISCOUNT_CODE_INVALID");
      setAppliedDiscount(result.data);
      Alert.alert("تم تطبيق الخصم", `يوفّر لك الخصم ${formatSyp(result.data.discountAmount)} على هذا الطلب.`);
    } catch (error) {
      setAppliedDiscount(null);
      Alert.alert("الرمز غير صالح", error instanceof Error && error.message === "DISCOUNT_NOT_AVAILABLE" ? "هذا الرمز مخصص لعملاء آخرين." : "تحقق من الرمز أو من تاريخ صلاحيته.");
    }
  };

  if (page === "profile") return <View style={[styles.fill, styles.profilePage]}><ProfilePanel name={name} phone={phone} onBack={() => navigateCustomer("home")} onLogout={onLogout} onOrders={() => navigateCustomer("orders")} /></View>;

  if (page === "orders") return <View style={styles.fill}><ScrollView contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom + 30, 42) }]}><View style={styles.hero}><View><Text style={styles.eyebrow}>سجل النشاط</Text><Text style={styles.heroTitle}>الطلبات</Text><Text style={styles.copy}>تابع طلباتك الحالية والسابقة من مكان واحد.</Text></View><MaterialIcons name="receipt-long" size={30} color="#24755E" /></View><View style={styles.empty}><Text style={styles.emptyText}>لا توجد طلبات محفوظة للعرض حالياً.</Text></View></ScrollView><PremiumCustomerNav active="orders" onHome={() => navigateCustomer("home")} onOrders={() => navigateCustomer("orders")} onProfile={() => navigateCustomer("profile")} /></View>;

  if (page === "order") return (
    <OptimusMapScreen
      source={source}
      destination={destination}
      focusPoint={source ?? destination}
      focusZoom={mapFocusZoom}
      focusRequestId={mapFocusRequestId}
      routePath={route?.path}
      selecting={selecting}
      onSelect={setMapPoint}
      onOutsideRange={() => Alert.alert("خارج نطاق الخدمة", "اختر نقطة داخل دائرة حماة المسموح بها، حتى ٧ كم من مركز المدينة.")}
      onLocate={useMyLocation}
      locating={locating}
      onProfile={() => setPage("profile")}
      onHome={() => setPage("home")}
      onMore={() => setMoreMenuVisible((value) => !value)}
      moreMenu={<><PremiumMoreMenu visible={moreMenuVisible && !favoritesMenuVisible} onClose={() => setMoreMenuVisible(false)} onDiscount={() => { setMoreMenuVisible(false); setDiscountExpanded(true); }} onFavorites={() => { setMoreMenuVisible(false); setFavoritesMenuVisible(true); }} /><PremiumFavoritesMenu visible={favoritesMenuVisible} favorites={(favoriteAddresses.data ?? []) as Array<{ id: string; label: string; address: string; latitude: number | string; longitude: number | string }>} onClose={() => setFavoritesMenuVisible(false)} onChoose={(favorite) => { chooseFavorite(favorite); setFavoritesMenuVisible(false); }} onDelete={(id) => accessToken && deleteFavorite.mutate({ accessToken, favoriteId: id })} onAdd={() => { setFavoritesMenuVisible(false); setDiscountExpanded(false); }} /></>}
    >
      <PremiumOrderSheet
        source={source}
        destination={destination}
        selecting={selecting}
        onSelectMode={setSelecting}
        locationNotice={locationNotice}
        onDismissNotice={() => setLocationNotice(null)}
        addressQuery={addressQuery}
        onAddressQueryChange={(value) => { setAddressQuery(value); setAddressResults([]); setSearchingAddress(value.trim().length >= 2); }}
        searchingAddress={searchingAddress}
        onSearch={searchAddress}
        addressResults={addressResults}
        onChooseAddress={chooseAddress}
        favoriteAddresses={(favoriteAddresses.data ?? []) as Array<{ id: string; label: string; address: string; latitude: number | string; longitude: number | string }>}
        onChooseFavorite={chooseFavorite}
        onDeleteFavorite={(id) => accessToken && deleteFavorite.mutate({ accessToken, favoriteId: id })}
        favoriteLabel={favoriteLabel}
        onFavoriteLabelChange={setFavoriteLabel}
        onSaveFavorite={saveCurrentFavorite}
        savingFavorite={saveFavorite.isPending}
        discountCode={discountCode}
        onDiscountCodeChange={(value) => { setDiscountCode(value.toUpperCase()); setAppliedDiscount(null); }}
        onVerifyDiscount={verifyDiscount}
        discountFetching={discountPreview.isFetching}
        discountExpanded={discountExpanded}
        onToggleDiscount={() => setDiscountExpanded((value) => !value)}
        onOpenFavorites={() => setFavoritesMenuVisible(true)}
        appliedDiscount={appliedDiscount}
        route={route}
        routeLoading={routeLoading}
        payment={payment}
        onPaymentChange={setPayment}
        onSubmit={submitOrder}
        submitting={createOrder.isPending}
      />
          <PremiumEmptyResultsDialog visible={emptyResultsVisible} onClose={() => setEmptyResultsVisible(false)} />
    </OptimusMapScreen>
  );
  const visibleDriver = (currentTracking.data as { driver?: CustomerVisibleDriver | null } | null | undefined)?.driver ?? null;
  const callVisibleDriver = () => {
    if (!visibleDriver?.phone) {
      Alert.alert("الاتصال غير متاح", "لم يُسجّل السفير رقم اتصال صالحاً حالياً.");
      return;
    }
    Linking.openURL(`tel:${visibleDriver.phone}`).catch(() => Alert.alert("تعذر الاتصال", "افتح تطبيق الهاتف يدوياً وحاول الاتصال بالرقم الظاهر."));
  };

  const trackingStatus = (currentTracking.data as { status?: string } | null | undefined)?.status ?? "requested";
  const canCancelCustomerOrder = ["requested", "accepted", "arriving", "awaiting_otp"].includes(trackingStatus);
  const startedTrip = trackingStatus === "started";
  if (page === "track") return <View style={styles.fill}><HamaMap source={trackedSource} destination={trackedDestination} routePath={route?.path} actualPath={liveTripPath} driverLocation={driverLocation} readOnly />{startedTrip ? <View style={styles.startedNotice}><Text style={styles.startedNoticeTitle}>أنت الآن في الرحلة</Text><Text style={styles.startedNoticeCopy}>بدأ السفير الرحلة بعد الوصول إلى نقطة الاستلام. الإلغاء غير متاح، ويمكنك متابعة المسار أو إرسال بلاغ.</Text></View> : acceptedNotice ? <View style={styles.acceptedNotice}><Text style={styles.acceptedNoticeTitle}>تم قبول طلبك</Text><Text style={styles.acceptedNoticeCopy}>تم تعيين سائق OPTIMUS X وهو متجه إلى نقطة الاستلام.</Text></View> : null}<View style={[styles.trackSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}><View style={styles.handle} /><View style={styles.split}><Tag status>{startedTrip ? "الرحلة بدأت" : currentTracking.data?.driver_id ? "تم تعيين سائق" : "بانتظار سائق"}</Tag><Text style={styles.muted}>طلب قيد المتابعة</Text></View><Text style={styles.trackTitle}>{startedTrip ? "أنت الآن في الرحلة" : currentTracking.data?.driver_id ? "السائق متجه إلى المصدر" : "سنعيّن سائقاً قريباً"}</Text><Text style={styles.copy}>{startedTrip ? liveTripPath.length > 1 ? `تتبع حي للمسار: ${liveTripPath.length} نقاط GPS حديثة.` : "ستظهر حركة السفير ومساره تلقائياً بعد أول تحديث GPS." : currentTracking.data?.driver_id ? "السفير متجه إلى نقطة الاستلام. سيبدأ المسار بعد تأكيد وصوله وبدء الرحلة." : "ستظهر بيانات السفير فور قبوله طلبك."}</Text><View style={styles.driverBox}>{visibleDriver?.photoUrl ? <Image source={{ uri: visibleDriver.photoUrl }} style={styles.driverPhoto} contentFit="cover" /> : <View style={styles.avatar}><Text style={styles.avatarText}>ج</Text></View>}<View style={styles.flex}><Text style={styles.driverName}>{visibleDriver?.fullName ?? (currentTracking.data?.driver_id ? "سفير OPTIMUS X معيّن" : "بانتظار قبول السفير")}</Text><Text style={styles.mutedRight}>{visibleDriver ? `${driverVehicleLabel(visibleDriver.vehicleType)} · ${visibleDriver.phone ?? "الرقم غير متاح"}` : "تظهر بيانات السفير بعد تثبيت التعيين"}</Text><Text style={styles.mutedRight}>{pickupEtaSeconds != null ? `يصل إلى الاستلام خلال ${Math.max(1, Math.ceil(pickupEtaSeconds / 60))} دقائق تقريباً` : driverLocation ? "يجري حساب وقت الوصول…" : "سيظهر وقت الوصول عند بدء مشاركة الموقع"}</Text></View>{visibleDriver?.phone ? <Pressable onPress={callVisibleDriver} style={styles.minor}><Text style={styles.minorText}>اتصال</Text></Pressable> : null}</View><View style={styles.timeline}><Text style={styles.done}>● تم إنشاء طلبك</Text><Text style={startedTrip ? styles.live : currentTracking.data?.driver_id ? styles.live : styles.future}>{startedTrip ? "● بدأت الرحلة والتتبع الحي" : currentTracking.data?.driver_id ? "● السفير متجه إلى المصدر" : "○ بانتظار قبول سفير"}</Text><Text style={styles.future}>○ استلام رمز التسليم</Text></View>{canCancelCustomerOrder ? <Action title={cancelCustomerOrder.isPending ? "جارٍ الإلغاء…" : "إلغاء الطلب قبل بدء الرحلة"} kind="outline" onPress={() => { if (!currentTracking.data?.id || cancelCustomerOrder.isPending) return; Alert.alert("تأكيد الإلغاء", "يمكن الإلغاء الآن قبل بدء الرحلة فقط.", [{ text: "عودة", style: "cancel" }, { text: "إلغاء الطلب", style: "destructive", onPress: () => accessToken && cancelCustomerOrder.mutate({ accessToken, orderId: currentTracking.data?.id ?? "" }) }]); }} /> : <Text style={styles.startedTripNotice}>بدأت الرحلة؛ الإلغاء غير متاح. يمكنك متابعة السفير أو إرسال بلاغ.</Text>}<Action title="لدي رمز الاستلام" onPress={() => setPage("otp")} /><Action title="العودة للرئيسية" kind="outline" onPress={() => setPage("home")} /></View></View>;

  if (page === "otp") return <KeyboardAwareScrollView contentContainerStyle={[styles.fill, { paddingBottom: Math.max(insets.bottom + 24, 32) }]} ><Top title="تأكيد الاستلام" back={() => setPage("track")} /><View style={styles.centered}><View style={styles.otpBadge}><Text style={styles.otpBadgeText}>OTP</Text></View><Text style={styles.centerTitle}>أدخل رمز الاستلام</Text><Text style={styles.centerCopy}>يشاركك السائق الرمز عند وصول الطلب. لا تؤكده قبل الاستلام.</Text><TextInput style={styles.otp} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={4} placeholder="••••" placeholderTextColor="#AAA" textAlign="center" /><Action title="تأكيد الرمز" onPress={() => otp.length === 4 ? Alert.alert("تم التأكيد", "سيطلب من السائق الآن تصوير إثبات التسليم.") : Alert.alert("الرمز غير مكتمل", "أدخل أربعة أرقام.")} /><View style={styles.proofNotice}><Text style={styles.proofNoticeIcon}>▧</Text><View style={styles.flex}><Text style={styles.proofNoticeTitle}>صورة إثبات التسليم</Text><Text style={styles.proofNoticeCopy}>ستظهر هنا فور رفعها من السائق.</Text></View></View></View></KeyboardAwareScrollView>;

  return <View style={styles.fill}><ScrollView contentContainerStyle={[styles.homeScroll, { paddingTop: Math.max(insets.top + 10, 22), paddingBottom: Math.max(insets.bottom + 104, 116) }]}><View style={styles.homeHeader}><View style={styles.homeIdentity}><Text style={styles.homeEyebrow}>OPTIMUS X · حماة</Text><Text style={styles.homeGreeting}>أهلاً، {name}</Text><Text style={styles.homeSubcopy}>جاهز لتوصيلك اليوم؟</Text></View><Mark small /></View><View style={styles.orderHero}><View style={styles.orderHeroGlow} /><Text style={styles.orderKicker}>الخدمة متاحة الآن</Text><Text style={styles.orderTitle}>إلى أين نوصلك اليوم؟</Text><Text style={styles.orderCopy}>حدد نقطة الاستلام والوجهة على الخريطة التفاعلية.</Text><Pressable onPress={() => { haptic(); setPage("order"); }} style={({ pressed }) => [styles.createOrderButton, pressed && styles.choosePressed]}><MaterialIcons name="near-me" size={19} color="#FFFFFF" /><Text style={styles.createOrderText}>إنشاء طلب توصيل</Text></Pressable><View style={styles.mapShortcut}><View style={styles.mapShortcutIcon}><MaterialIcons name="map" size={18} color="#24755E" /></View><View style={styles.mapShortcutCopy}><Text style={styles.mapShortcutTitle}>الخريطة الكاملة داخل الطلب</Text><Text style={styles.mapShortcutText}>اختيار دقيق وسلس من أول لمسة</Text></View><MaterialIcons name="chevron-left" size={20} color="#A4B0AA" /></View></View><View style={styles.homeSectionHeader}><Text style={styles.homeSectionTitle}>آخر الطلبات</Text><Pressable onPress={() => navigateCustomer("orders")}><Text style={styles.homeSectionLink}>عرض الكل</Text></Pressable></View><View style={styles.recentEmpty}><View style={styles.recentIcon}><MaterialIcons name="receipt-long" size={20} color="#24755E" /></View><View style={styles.recentCopy}><Text style={styles.recentTitle}>لا توجد طلبات نشطة</Text><Text style={styles.recentText}>ستظهر تفاصيل طلبك وحالة السفير هنا فور التأكيد.</Text></View></View></ScrollView><PremiumCustomerNav active="home" onHome={() => navigateCustomer("home")} onOrders={() => navigateCustomer("orders")} onProfile={() => navigateCustomer("profile")} /></View>;
}

function Driver({ name, onTripActivity }: { name: string; onTripActivity: (active: boolean) => void }) {
  const [page, setPage] = useState<DriverPage>("home");
  const [personal, setPersonal] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [livePoint, setLivePoint] = useState<MapPoint | null>(null);
  const [mapFocusRequestId, setMapFocusRequestId] = useState(0);
  const [gpsQuality, setGpsQuality] = useState("بانتظار إشارة GPS عالية الدقة");
  const [activeOrder, setActiveOrder] = useState<DriverOrderPreview | null>(null);
  const [tripMetrics, setTripMetrics] = useState<DriverTripMetrics | null>(null);
  const [offerClock, setOfferClock] = useState(Date.now());
  const [tripStarted, setTripStarted] = useState(false);
  const updateLocation = trpc.jarbou3.updateDriverLocation.useMutation({
    onSuccess: (result) => {
      if (result.tripMetrics) setTripMetrics(result.tripMetrics as DriverTripMetrics);
    },
    onError: async (_error, variables) => {
      await jarbou3Session.saveQueuedLocation({ ...variables.location, capturedAt: new Date().toISOString() });
    },
  });
  const clearLocation = trpc.jarbou3.clearDriverLocation.useMutation();
  const submitVerification = trpc.jarbou3.submitDriverVerification.useMutation({
    onSuccess: () => { setPage("home"); Alert.alert("تم إرسال الوثائق", "تم إرسال الصورة الشخصية وصورة الهوية للمراجعة."); },
    onError: (error) => Alert.alert("تعذر إرسال الوثائق", error.message),
  });
  const driverVerification = trpc.jarbou3.driverVerificationStatus.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken), refetchInterval: 8_000 });
  const driverIsApproved = driverVerification.data?.status === "approved";
  useEffect(() => {
    if (driverIsApproved && page === "verify") setPage("home");
  }, [driverIsApproved, page]);
  const availableOrders = trpc.jarbou3.availableDriverOrders.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken) && page === "home" && driverIsApproved, refetchInterval: 4_000 });
  const activeTripMetrics = trpc.jarbou3.activeDriverTripMetrics.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken) && page === "drive", refetchInterval: 8_000 });
  const companyBalance = trpc.jarbou3.ownCompanyBalance.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken), refetchInterval: 20_000 });
  const driverWallet = trpc.jarbou3.ownDriverWallet.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken), refetchInterval: 20_000 });
  const acceptOrder = trpc.jarbou3.acceptOrder.useMutation({ onSuccess: async (_result, variables) => { const order = (availableOrders.data as DriverOrderPreview[] | undefined)?.find((item) => item.id === variables.orderId) ?? null; setTripMetrics(null); setTripStarted(false); setActiveOrder(order); if (order) await jarbou3Session.saveActiveTrip({ role: "driver", orderId: order.id, sourceAddress: order.source_address, sourceLat: Number(order.source_lat), sourceLng: Number(order.source_lng), destinationAddress: order.destination_address, destinationLat: Number(order.destination_lat), destinationLng: Number(order.destination_lng), distanceM: order.distance_m, started: false, savedAt: new Date().toISOString() }); onTripActivity(true); setPage("drive"); }, onError: (error) => Alert.alert("تعذر قبول الطلب", error.message) });
  const startTrip = trpc.jarbou3.startTrip.useMutation({ onSuccess: async () => { setTripStarted(true); if (activeOrder) await jarbou3Session.saveActiveTrip({ role: "driver", orderId: activeOrder.id, sourceAddress: activeOrder.source_address, sourceLat: Number(activeOrder.source_lat), sourceLng: Number(activeOrder.source_lng), destinationAddress: activeOrder.destination_address, destinationLat: Number(activeOrder.destination_lat), destinationLng: Number(activeOrder.destination_lng), distanceM: activeOrder.distance_m, started: true, savedAt: new Date().toISOString() }); setPage("drive"); Alert.alert("بدأت الرحلة", "تم التحقق من وصولك إلى نقطة الاستلام. أصبح تتبع الرحلة فعالاً الآن."); }, onError: (error) => Alert.alert("لا يمكن بدء الرحلة بعد", error.message === "DRIVER_NOT_AT_PICKUP" ? "اقترب من نقطة الاستلام ثم اسحب الزر مرة أخرى." : error.message === "DRIVER_LOCATION_REQUIRED" ? "فعّل GPS وانتظر وصول موقعك الحالي ثم حاول مجدداً." : error.message) });
  const declineOrder = trpc.jarbou3.declineOrder.useMutation({ onSuccess: () => { availableOrders.refetch(); Alert.alert("تم تجاهل الطلب", "ينتقل الطلب تلقائياً إلى السفير التالي الأقرب."); }, onError: (error) => Alert.alert("تعذر رفض الطلب", error.message) });
  const uploadDeliveryProof = trpc.jarbou3.uploadDeliveryProof.useMutation();
  const verifyDelivery = trpc.jarbou3.verifyDeliveryOtp.useMutation({
    onSuccess: async (result) => {
      if (!result.verified || !accessToken || !activeOrder || !proof) return Alert.alert("تعذر الإنهاء", "لم يتم التحقق من رمز التسليم.");
      try {
        await uploadDeliveryProof.mutateAsync({ accessToken, orderId: activeOrder.id, photo: proof });
        await jarbou3Session.clearActiveTrip();
        setTripMetrics(null);
        setActiveOrder(null);
        onTripActivity(false);
        setPage("home");
        await companyBalance.refetch();
        Alert.alert("تم التسليم", "حُفظت المسافة والوقت الفعليان للرحلة، وأُضيف إثبات التسليم.");
      } catch (error) {
        Alert.alert("تم التسليم لكن تعذر رفع الإثبات", error instanceof Error ? error.message : "أعد المحاولة لرفع الصورة.");
      }
    },
    onError: (error) => Alert.alert("تعذر تأكيد التسليم", error.message),
  });
  const camera = async (which: "personal" | "identity" | "proof") => { const ImagePicker = await import("expo-image-picker"); const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return Alert.alert("إذن الكاميرا مطلوب", "يلزم الإذن لالتقاط الصور المطلوبة."); const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.65, base64: true }); if (result.canceled) return; const asset = result.assets[0]; const uri = asset.base64 ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` : asset.uri; if (which === "personal") setPersonal(uri); if (which === "identity") setIdentity(uri); if (which === "proof") setProof(uri); };

  useEffect(() => { jarbou3Session.getAccessToken().then(setAccessToken); }, []);
  useEffect(() => {
    if (page !== "home") return;
    setOfferClock(Date.now());
    const interval = setInterval(() => setOfferClock(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [page]);
  useEffect(() => {
    jarbou3Session.getActiveTrip().then((trip) => {
      if (!trip || trip.role !== "driver") return;
      setActiveOrder({ id: trip.orderId, source_address: trip.sourceAddress, source_lat: trip.sourceLat, source_lng: trip.sourceLng, destination_address: trip.destinationAddress, destination_lat: trip.destinationLat, destination_lng: trip.destinationLng, estimated_price: 0, payment_method: "cash", distance_m: trip.distanceM });
      setTripStarted(Boolean(trip.started));
      onTripActivity(true);
      setPage("drive");
    });
  }, [onTripActivity]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let previousBackAt = 0;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (page === "verify") { setPage("home"); return true; }
      if (page === "deliver") { setPage("drive"); return true; }
      if (page === "drive") { setPage("home"); return true; }
      if (Date.now() - previousBackAt < 2_000) return false;
      previousBackAt = Date.now();
      ToastAndroid.show("اضغط رجوع مرة أخرى للخروج", ToastAndroid.SHORT);
      return true;
    });
    return () => subscription.remove();
  }, [page]);
  useEffect(() => {
    // Never start native GPS watchers immediately after login or permission approval.
    // Android can terminate the process while a watcher/foreground service is created
    // before an order exists. Start location only for an accepted order.
    const shouldTrackAcceptedOrder = (page === "home" || page === "drive") && Boolean(accessToken) && driverIsApproved;
    if (!shouldTrackAcceptedOrder || !accessToken) return;
    let active = true;
    let remove: (() => void) | undefined;
    let backgroundStarted = false;
    let stopBackground: (() => Promise<void>) | undefined;
    void import("@/lib/jarbou3-background-location")
      .then(async ({ flushJarbou3QueuedLocation, startJarbou3BackgroundTracking, stopJarbou3BackgroundTracking }) => {
        if (!active) return;
        await flushJarbou3QueuedLocation().catch(() => undefined);
        stopBackground = stopJarbou3BackgroundTracking;
        const status = await startJarbou3BackgroundTracking();
        if (!active) return;
        backgroundStarted = status === "started";
        setGpsQuality(status === "started" ? "تتبع الرحلة بالخلفية نشط" : status === "unavailable" ? "تتبع الخلفية يحتاج بناء تطبيق على جهاز فعلي" : status === "background_denied" ? "اسمح بتتبع الموقع دائماً أثناء الرحلة" : status === "services_disabled" ? "فعّل خدمات GPS لاستمرار التتبع" : "يلزم السماح بالموقع لبدء التتبع");
      })
      .catch(() => { if (active) setGpsQuality("تعذر بدء التتبع الخلفي؛ سيستمر التحديث أثناء فتح التطبيق"); });
    watchHamaLocation((point) => {
      if (!active) return;
      setLivePoint(point);
      if (!backgroundStarted) updateLocation.mutate({ accessToken, location: point });
    }, (quality) => setGpsQuality(quality === "good" ? "GPS عالي الدقة متصل" : quality === "poor_accuracy" ? "إشارة GPS ضعيفة؛ لا نرسل قراءة غير دقيقة" : quality === "mocked" ? "تم رفض موقع غير موثوق" : quality === "unrealistic_jump" ? "تم رفض قفزة موقع غير واقعية" : "الموقع خارج نطاق حماة")).then((subscription) => { remove = () => subscription.remove(); }).catch(() => { if (!activeOrder) clearLocation.mutate({ accessToken }); Alert.alert("تعذر مشاركة الموقع", "فعّل خدمات الموقع واسمح بالتحديد أثناء استخدام التطبيق لمتابعة الرحلة داخل حماة."); });
    return () => { active = false; remove?.(); void stopBackground?.().catch(() => undefined); if (!activeOrder) clearLocation.mutate({ accessToken }); };
  }, [page, accessToken, driverIsApproved, activeOrder?.id]);
  useEffect(() => {
    if (!accessToken || activeOrder) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") clearLocation.mutate({ accessToken });
    });
    return () => subscription.remove();
  }, [accessToken, activeOrder?.id]);
  const locateDriver = async () => {
    try {
      const point = await getCurrentHamaLocation();
      setLivePoint(point);
      setMapFocusRequestId((value) => value + 1);
      if (accessToken) updateLocation.mutate({ accessToken, location: point });
    } catch (error) {
      Alert.alert("تعذر تحديد الموقع", error instanceof Error && error.message === "LOCATION_SERVICES_DISABLED" ? "شغّل GPS من إعدادات الهاتف ثم حاول مرة أخرى." : "اسمح بالوصول إلى الموقع وتحقق من تشغيل GPS.");
    }
  };

  if (page === "verify" && !driverIsApproved) return <ScrollView contentContainerStyle={styles.scroll}><Top title="وثائق السفير" back={() => setPage("home")} /><View style={styles.space}><Tag>خطوة مطلوبة</Tag><Heading title="أرفق صورتين قبل الإرسال" /><Text style={styles.copyRight}>تُراجع الصورة الشخصية وصورة الهوية من الإدارة فقط، ولا تُعرض للعملاء أو السفراء الآخرين.</Text><Upload title="الصورة الشخصية" detail={personal ? "تم التقاط الصورة" : "التقط صورة واضحة للوجه"} uri={personal} onPress={() => camera("personal")} /><Upload title="صورة الهوية" detail={identity ? "تم التقاط الصورة" : "التقط صورة الهوية بوضوح"} uri={identity} onPress={() => camera("identity")} /><Action title={submitVerification.isPending ? "جارٍ الإرسال…" : "إرسال للمراجعة"} onPress={() => !personal || !identity || !accessToken ? Alert.alert("تحتاج صورتين", "أرفق الصورة الشخصية وصورة الهوية قبل الإرسال.") : submitVerification.mutate({ accessToken, personalPhoto: personal, identityPhoto: identity })} /></View></ScrollView>;

  const reportedMetrics = (activeTripMetrics.data as DriverTripMetrics | null | undefined) ?? tripMetrics;
  const actualDistanceKm = Number(reportedMetrics?.actual_distance_m ?? 0) / 1000;
  const elapsedMinutes = Math.max(0, Math.floor(Number(reportedMetrics?.elapsed_seconds ?? 0) / 60));
  if (page === "drive") return <View style={styles.drive}><View style={styles.split}><Tag status={tripStarted}>{tripStarted ? "رحلة نشطة" : "متجه إلى نقطة الاستلام"}</Tag><Text style={styles.driveNumber}>#{activeOrder?.id.slice(0, 6) ?? "—"}</Text></View><HamaMap compact source={activeOrder ? { latitude: Number(activeOrder.source_lat), longitude: Number(activeOrder.source_lng) } : null} destination={activeOrder ? { latitude: Number(activeOrder.destination_lat), longitude: Number(activeOrder.destination_lng) } : null} driverLocation={livePoint} readOnly /><View><Text style={styles.driveLabel}>{tripStarted ? "المسافة الفعلية" : "حالة الوصول"}</Text><Text style={styles.distance}>{tripStarted ? actualDistanceKm.toFixed(1) : "—"}</Text><Text style={styles.distanceLabel}>{tripStarted ? `كم قطعتها · ${elapsedMinutes} دقيقة منذ بدء الرحلة` : "اقترب من نقطة الاستلام ثم اسحب زر بدء الرحلة"}</Text><Text style={styles.street}>المحطة التالية: نقطة الاستلام</Text><View style={styles.progress}><View style={styles.progressFill} /></View><Text style={styles.driveHint}>{livePoint ? (tripStarted ? "تُحسب المسافة من نقاط GPS المتتابعة الموثوقة، ويصل موقعك الحي إلى العميل المعيّن." : "موقعك متاح. لا تبدأ الرحلة قبل الوصول إلى نقطة الاستلام.") : "اسمح بالموقع لتحديث العميل أثناء الرحلة."}</Text><Text style={styles.gpsQuality}>{gpsQuality}</Text></View>{tripStarted ? null : <SwipeStartButton disabled={!accessToken || !activeOrder || !livePoint || startTrip.isPending} onComplete={() => { if (accessToken && activeOrder) startTrip.mutate({ accessToken, orderId: activeOrder.id }); }} />}<View style={styles.driveBottom}><View style={styles.utilityRow}><Pressable onPress={() => Alert.alert("اتصال", "سيُفتح اتصال العميل عند ربط أرقام الخدمة.")} style={styles.utility}><Text style={styles.utilityText}>اتصال</Text></Pressable><Pressable onPress={() => Alert.alert("دردشة", "ستظهر محادثة الطلب النصية هنا.")} style={styles.utility}><Text style={styles.utilityText}>دردشة</Text></Pressable></View><Action title="تم التوصيل" kind="dark" onPress={() => setPage("deliver")} /></View></View>;

  if (page === "deliver") return <KeyboardAwareScrollView contentContainerStyle={styles.scroll}><Top title="إتمام التسليم" back={() => setPage("drive")} /><View style={styles.space}><DeliveryStep number="١" title="تحقق من رمز العميل" detail="لا تلتقط الصورة قبل مطابقة الرمز." /><TextInput style={styles.input} value={otp} onChangeText={setOtp} maxLength={4} keyboardType="number-pad" placeholder="رمز من ٤ أرقام" placeholderTextColor="#AAA" textAlign="center" /><DeliveryStep number="٢" title="صورة عند الباب" detail="تُرسل للعميل كإثبات التسليم فقط." /><Pressable onPress={() => camera("proof")} style={styles.cameraBox}>{proof ? <Image source={{ uri: proof }} style={styles.photo} contentFit="cover" /> : <><Text style={styles.cameraIcon}>◉</Text><Text style={styles.cameraText}>التقط صورة إثبات التسليم</Text></>}</Pressable><Action title={verifyDelivery.isPending || uploadDeliveryProof.isPending ? "جارٍ تأكيد التسليم…" : "تأكيد التسليم ورفع الصورة"} onPress={() => otp.length !== 4 || !proof || !accessToken || !activeOrder ? Alert.alert("ينقصك إجراء", "تحقق من الرمز والتقط صورة الإثبات.") : verifyDelivery.mutate({ accessToken, orderId: activeOrder.id, otp })} /></View></KeyboardAwareScrollView>;

  const nextOrder = (availableOrders.data as DriverOrderPreview[] | undefined)?.[0];
  const settlementBalance = (companyBalance.data as DriverCompanyBalance | null | undefined) ?? null;
  const totalCompanyCommission = Math.max(0, Number(settlementBalance?.total_commission_amount ?? 0));
  const paidCompanyCommission = Math.max(0, Number(settlementBalance?.paid_amount ?? 0));
  const outstandingCompanyCommission = Math.max(0, Number(settlementBalance?.outstanding_amount ?? 0));
  const wallet = (driverWallet.data as DriverWallet | null | undefined) ?? null;
  const walletBalance = Number(wallet?.balance_amount ?? 0);
  const walletHeld = Number(wallet?.held_amount ?? 0);
  const walletAvailable = Number(wallet?.available_amount ?? 0);
  const walletBlocked = walletBalance < 0;
  if (!driverIsApproved) return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.driverHero}><View><Text style={styles.driverEyebrow}>وضع السفير</Text><Text style={styles.driverHeroTitle}>أهلاً، {name || "سفير OPTIMUS X"}</Text><Text style={styles.driverHeroCopy}>تظهر الطلبات بعد اعتماد الإدارة لوثائقك.</Text></View><Tag status={false}>{driverVerification.isLoading ? "جارٍ التحقق" : "بانتظار الاعتماد"}</Tag></View><View style={styles.space}><HamaMap compact driverLocation={livePoint} focusPoint={livePoint} focusRequestId={mapFocusRequestId} onLocate={locateDriver} readOnly /><View style={styles.empty}><Text style={styles.emptyText}>{driverVerification.data?.status === "missing" ? "أرسل الصورة الشخصية وصورة الهوية للمراجعة أولاً." : "وثائقك محفوظة بانتظار اعتماد الإدارة. لا تطلب رمزاً جديداً."}</Text></View><Action title="الوثائق" kind="outline" onPress={() => setPage("verify")} /></View></ScrollView>;
  const pickupDistanceKm = Number(nextOrder?.distance_to_pickup_m ?? 0) / 1000;
  const offerSecondsLeft = nextOrder?.offer_expires_at ? Math.max(0, Math.ceil((new Date(nextOrder.offer_expires_at).getTime() - offerClock) / 1000)) : 0;
  const offerProgress = Math.max(0, Math.min(100, (offerSecondsLeft / 20) * 100));
  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.driverHero}><View><Text style={styles.driverEyebrow}>وضع السفير</Text><Text style={styles.driverHeroTitle}>أهلاً، {name || "سفير OPTIMUS X"}</Text><Text style={styles.driverHeroCopy}>تظهر طلبات حماة للسفراء المتصلين، ويثبت النظام السفير الذي يقبل أولاً.</Text></View><Tag status={!walletBlocked}>متصل</Tag></View><View style={styles.space}><View style={styles.shift}><View style={styles.split}><View><Text style={styles.shiftTitle}>رصيد الضمان التشغيلي</Text><Text style={[styles.shiftValue, walletBlocked && { color: "#B42318" }]}>{driverWallet.isLoading ? "جارٍ الحساب…" : formatSyp(walletBalance)}</Text></View><Tag status={!walletBlocked}>{walletBlocked ? "موقوف مالياً" : wallet?.grace_active ? "إعفاء أول شهر" : "نشط"}</Tag></View><Text style={styles.setupCopy}>متاح للطلبات: {formatSyp(walletAvailable)} · محجوز لرحلات جارية: {formatSyp(walletHeld)}{walletBlocked ? ` · يلزم تسوية ${formatSyp(Math.abs(walletBalance))}` : ""}</Text>{walletBlocked ? <Text style={styles.setupCopy}>لا تظهر طلبات جديدة ولا يمكن قبول طلب حتى تسوية الرصيد. الرحلة الجارية، إن وجدت، تستمر حتى الإكمال.</Text> : null}<View style={styles.shift}><View style={styles.split}><View><Text style={styles.shiftTitle}>المستحق لشركة OPTIMUS X</Text><Text style={styles.shiftValue}>{companyBalance.isLoading ? "جارٍ الحساب…" : formatSyp(outstandingCompanyCommission)}</Text></View><Tag status={outstandingCompanyCommission === 0}>{outstandingCompanyCommission === 0 ? "الرصيد صفر" : "تسوية مطلوبة"}</Tag></View><Text style={styles.setupCopy}>عمولة الرحلات: {formatSyp(totalCompanyCommission)} · المدفوع: {formatSyp(paidCompanyCommission)}. يتراكم 10% من كل رحلة مكتملة فقط.</Text><View style={styles.settlementMethods}><Pressable onPress={() => Alert.alert("الدفع النقدي", outstandingCompanyCommission === 0 ? "لا يوجد رصيد مستحق حالياً." : `سلّم ${formatSyp(outstandingCompanyCommission)} نقداً للإدارة، وسيُصفَّر الرصيد من لوحة الإدارة بعد الاستلام.`)} style={styles.cashMethod}><Text style={styles.cashMethodTitle}>الدفع نقداً (Cash)</Text><Text style={styles.cashMethodCopy}>متاح الآن · سلّم المبلغ للإدارة مباشرة</Text></Pressable><Pressable onPress={() => Alert.alert("الدفع الإلكتروني", "قريباً. لا توجد خدمة دفع إلكتروني متاحة حالياً.")} style={styles.upcomingMethod}><Text style={styles.upcomingMethodTitle}>الدفع الإلكتروني</Text><Text style={styles.upcomingMethodCopy}>قريباً</Text></Pressable></View></View></View></View><HamaMap compact driverLocation={livePoint} focusPoint={livePoint} focusRequestId={mapFocusRequestId} onLocate={locateDriver} readOnly /><View style={styles.space}><Heading eyebrow="طلبات قريبة" title={nextOrder ? "طلب متاح لك الآن" : "لا توجد طلبات حالياً"} />{nextOrder ? <View style={styles.orderCard}><View style={styles.split}><Tag>{pickupDistanceKm.toFixed(1)} كم إليك</Tag><Text style={styles.orderPrice}>{formatSyp(nextOrder.estimated_price)}</Text></View><Text style={styles.orderRoute}>نقطة استلام ← وجهة العميل</Text><View style={styles.offerTimer}><View style={styles.offerTimerTop}><Text style={styles.offerTimerLabel}>مهلة القبول</Text><Text style={styles.offerTimerValue}>{offerSecondsLeft} ث</Text></View><View style={styles.offerTimerTrack}><View style={[styles.offerTimerFill, { width: `${offerProgress}%` }]} /></View><Text style={styles.offerTimerHint}>بعد انتهاء العداد ينتقل الطلب تلقائياً إلى السفير التالي.</Text></View><Text style={styles.copyRight}>{nextOrder.payment_method === "cash" ? "نقدي" : "شام كاش"}</Text><Action title={acceptOrder.isPending ? "جارٍ تثبيت التعيين…" : "قبول الطلب"} onPress={() => accessToken && acceptOrder.mutate({ accessToken, orderId: nextOrder.id })} /><Action title={declineOrder.isPending ? "جارٍ الرفض…" : "تجاهل الطلب"} kind="outline" onPress={() => accessToken && declineOrder.mutate({ accessToken, orderId: nextOrder.id })} /></View> : <View style={styles.empty}><Text style={styles.emptyText}>{availableOrders.isLoading ? "جارٍ فحص الطلب التالي…" : "تظهر الطلبات المتاحة للسفراء المتصلين عند إنشاء طلب جديد."}</Text></View>}</View></ScrollView>;
}

function Upload({ title, detail, uri, onPress }: { title: string; detail: string; uri: string | null; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.upload}>{uri ? <Image source={{ uri }} style={styles.uploadPhoto} contentFit="cover" /> : <View style={styles.uploadPlaceholder}><Text style={styles.uploadSymbol}>＋</Text></View>}<View style={styles.flex}><Text style={styles.uploadTitle}>{title}</Text><Text style={styles.uploadDetail}>{detail}</Text></View></Pressable>; }
function DeliveryStep({ number, title, detail }: { number: string; title: string; detail: string }) { return <View style={styles.deliveryStep}><Text style={styles.stepNumber}>{number}</Text><View><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDetail}>{detail}</Text></View></View>; }

function Top({ title, back }: { title: string; back: () => void }) { return <View style={styles.top}><Pressable onPress={back} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.topTitle}>{title}</Text><View style={styles.backBlank} /></View>; }

function appErrorCode(error: { message?: string }): string {
  const message = error.message ?? "";
  const knownCodes = [
    "INVALID_PHONE",
    "PHONE_ALREADY_REGISTERED",
    "PASSWORD_SETUP_PENDING",
    "ACCOUNT_ALREADY_VERIFIED",
    "DRIVER_DOCUMENTS_REQUIRED",
    "VEHICLE_TYPE_REQUIRED",
    "CUSTOMER_DOCUMENTS_NOT_ALLOWED",
    "ONBOARDING_RATE_LIMITED",
    "ONBOARDING_REQUEST_FAILED",
    "DOCUMENT_UPLOAD_FAILED",
    "SIGN_IN_PASSWORD_INVALID",
    "SIGN_IN_IDENTITY_LOOKUP_FAILED",
    "SIGN_IN_IDENTITY_MIGRATION_FAILED",
    "SIGN_IN_ACCOUNT_NOT_FOUND",
    "SIGN_IN_PROFILE_LOOKUP_FAILED",
    "NETWORK_REQUEST_FAILED",
  ];
  if (/network request failed|network error|failed to fetch|aborterror|timeout/i.test(message)) return "NETWORK_REQUEST_FAILED";
  return knownCodes.find((code) => message === code || message.includes(code)) ?? message;
}

export function Jarbou3App() {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role>("customer");
  const [stage, setStage] = useState<"loading" | "choose" | "form" | "waiting" | "code" | "password" | "signin" | "recoveryRequest" | "recoveryWaiting" | "recoveryCode" | "recoveryPassword" | "consent" | "workspace">("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState<"motorcycle" | "electric_scooter">("motorcycle");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<string | null>(null);
  const [codeClock, setCodeClock] = useState(Date.now());
  const [savedToken, setSavedToken] = useState<string | null | undefined>(undefined);
  const [workspaceName, setWorkspaceName] = useState("");
  const [onboardingPersonalPhoto, setOnboardingPersonalPhoto] = useState<string | null>(null);
  const [onboardingIdentityPhoto, setOnboardingIdentityPhoto] = useState<string | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyVisible, setPolicyVisible] = useState(false);
  const [recoveryRequestId, setRecoveryRequestId] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryResetToken, setRecoveryResetToken] = useState<string | null>(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState<RuntimeReadiness | null>(null);
  const navigation = useNavigation<any>();
  const [activeTrip, setActiveTrip] = useState(false);
  const normalizedPhone = normalizeJarbou3Phone(phone);

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: stage === "workspace" ? undefined : { display: "none" } });
  }, [navigation, stage]);
  useEffect(() => {
    let active = true;
    let settled = false;
    const applyRestoredState = (token: string | null, saved: Awaited<ReturnType<typeof jarbou3Session.getOnboarding>>, profile: Awaited<ReturnType<typeof jarbou3Session.getProfile>>) => {
      if (!active || settled) return;
      settled = true;
      const canResume = Boolean(saved?.requestId) || saved?.stage === "waiting" || saved?.stage === "code" || saved?.stage === "password";
      if (saved && canResume) {
        setRole(saved.role);
        setName(saved.name);
        setPhone(saved.phone);
        setRequestId(saved.requestId);
        setCodeExpiresAt(saved.codeExpiresAt);
        setRetryAfter(saved.retryAfter ?? null);
        setStage(saved.stage);
      } else {
        setStage("choose");
      }
      if (token && profile) {
        setRole(profile.role);
        setWorkspaceName(profile.name);
        setStage("workspace");
      }
      setSavedToken(token);
    };

    Promise.all([jarbou3Session.getAccessToken(), jarbou3Session.getOnboarding(), jarbou3Session.getProfile()])
      .then(([token, saved, profile]) => applyRestoredState(token, saved, profile))
      .catch(() => applyRestoredState(null, null, null));

    // لا تسمح لتعطل SecureStore على جهاز Android بحبس المستخدم في شاشة سوداء.
    const watchdog = setTimeout(() => applyRestoredState(null, null, null), 3_000);
    return () => { active = false; clearTimeout(watchdog); };
  }, []);
  const savedSession = trpc.jarbou3.sessionProfile.useQuery({ accessToken: savedToken ?? "pending-session-token-000" }, { enabled: Boolean(savedToken), retry: false });
  const authCheckReady = savedToken !== undefined && (Boolean(savedToken) ? Boolean(savedSession.data) || savedSession.isError : stage !== "loading");
  useEffect(() => {
    if (!authCheckReady) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [authCheckReady]);
  const privacyConsent = trpc.jarbou3.privacyConsentStatus.useQuery({ accessToken: savedToken ?? "pending-session-token-000" }, { enabled: Boolean(savedToken) && Boolean(savedSession.data), retry: false });
  const acceptPrivacyConsent = trpc.jarbou3.acceptPrivacyConsent.useMutation({ onSuccess: () => { setStage("workspace"); void privacyConsent.refetch().catch(() => undefined); void refreshRuntimeReadiness().catch(() => undefined); }, onError: () => Alert.alert("تعذر حفظ الموافقة", "تعذر حفظ الموافقة على الخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.") });
  const releaseSettings = trpc.jarbou3.releaseSettings.useQuery(undefined, { enabled: Boolean(savedToken), refetchInterval: 30_000, retry: false });
  const currentVersion = Constants.expoConfig?.version ?? "1.0.0";
  const onboardingStatus = trpc.jarbou3.onboardingStatus.useQuery({ requestId: requestId ?? "00000000-0000-0000-0000-000000000000", phone: normalizedPhone }, { enabled: Boolean(requestId) && Boolean(normalizedPhone) && (stage === "waiting" || stage === "code"), refetchInterval: stage === "waiting" || stage === "code" ? 4_000 : false, retry: false });
  const preapprovedDriver = trpc.jarbou3.lookupPreapprovedTeamDriver.useQuery({ phone: normalizedPhone || "+00000000", fullName: name.trim().length >= 2 ? name.trim() : "—" }, { enabled: stage === "form" && role === "driver" && Boolean(normalizedPhone) && name.trim().length >= 2, retry: false, staleTime: 15_000 });
  useEffect(() => {
    if (savedToken === undefined) return;
    if (!savedToken) {
      setStage((current) => current === "loading" ? "choose" : current);
      return;
    }
    if (savedSession.data) {
      setRole(savedSession.data.role);
      setWorkspaceName(savedSession.data.name);
      setStage(savedSession.data.pendingPassword ? "password" : "workspace");
    } else if (savedSession.isError && !/network request failed|network error|failed to fetch|timeout|offline/i.test(savedSession.error?.message ?? "")) {
      jarbou3Session.clear().finally(() => { setSavedToken(null); setStage("choose"); });
    }
  }, [savedToken, savedSession.data, savedSession.isError]);
  useEffect(() => {
    if (!savedToken || stage !== "workspace") {
      setRuntimeReadiness(null);
      return;
    }
    let active = true;
    const refresh = () => readRuntimeReadiness().then((next) => { if (active) setRuntimeReadiness(next); }).catch(() => { if (active) setRuntimeReadiness({ online: false, gpsEnabled: false, locationGranted: false }); });
    // Request location opportunistically, but never replace the authenticated
    // workspace with a blocking GPS screen. Android only shows a prompt when
    // permission has not already been granted; previously granted users proceed
    // directly without another prompt.
    void requestRuntimeLocationPermission().catch(() => undefined).finally(refresh);
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
        releaseSettings.refetch();
      }
    });
    return () => { active = false; subscription.remove(); };
  }, [savedToken, stage]);
  useEffect(() => {
    if (!savedToken || stage !== "workspace") return;
    jarbou3Session.getActiveTrip().then((trip) => setActiveTrip(Boolean(trip)));
  }, [savedToken, stage]);
  useEffect(() => {
    if (!runtimeReadiness?.online) return;
    void import("@/lib/jarbou3-background-location")
      .then(({ flushJarbou3QueuedLocation }) => flushJarbou3QueuedLocation())
      .catch(() => undefined);
  }, [runtimeReadiness?.online]);
  useEffect(() => {
    if (Platform.OS !== "android" || stage === "workspace" || stage === "loading") return;
    let previousBackAt = 0;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stage === "form" || stage === "signin") { setStage("choose"); return true; }
      if (stage === "waiting") { setStage("form"); return true; }
      if (stage === "code") { setStage("waiting"); return true; }
      if (stage === "recoveryRequest") { setStage("signin"); return true; }
      if (stage === "recoveryWaiting") { setStage("recoveryRequest"); return true; }
      if (stage === "recoveryCode") { setStage("recoveryWaiting"); return true; }
      if (stage === "recoveryPassword" || stage === "password") return true;
      if (Date.now() - previousBackAt < 2_000) return false;
      previousBackAt = Date.now();
      ToastAndroid.show("اضغط رجوع مرة أخرى للخروج", ToastAndroid.SHORT);
      return true;
    });
    return () => subscription.remove();
  }, [stage]);
  useEffect(() => {
    const next = onboardingStatus.data;
    if (!next) return;
    if (next.codeExpiresAt) setCodeExpiresAt(next.codeExpiresAt);
    if (next.retryAfter) setRetryAfter(next.retryAfter);
    if (next.status === "code_sent" && stage === "waiting") setStage("code");
    if (next.status === "locked") {
      setVerificationCode("");
      setCodeExpiresAt(null);
      setStage("waiting");
    }
  }, [onboardingStatus.data, stage]);
  useEffect(() => {
    if ((stage !== "code" && stage !== "recoveryCode") || !codeExpiresAt) return;
    setCodeClock(Date.now());
    const interval = setInterval(() => setCodeClock(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [stage, codeExpiresAt]);

  useEffect(() => {
    if (stage === "form" || stage === "waiting" || stage === "code" || stage === "password") {
      jarbou3Session.saveOnboarding({ role, stage, name, phone: normalizedPhone || phone, requestId, codeExpiresAt, retryAfter }).catch(() => undefined);
    }
  }, [role, stage, name, phone, normalizedPhone, requestId, codeExpiresAt, retryAfter]);

  const remainingSeconds = codeExpiresAt ? Math.max(0, Math.ceil((new Date(codeExpiresAt).getTime() - codeClock) / 1_000)) : null;
  const retrySeconds = retryAfter ? Math.max(0, Math.ceil((new Date(retryAfter).getTime() - codeClock) / 1_000)) : 0;
  const codeExpired = remainingSeconds === 0;
  const codeTimerLabel = remainingSeconds == null ? "بانتظار إرسال الرمز" : codeExpired ? "انتهت صلاحية الرمز" : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")} متبقية`;

  const submitOnboarding = trpc.jarbou3.submitOnboarding.useMutation({
    onSuccess: async (result) => {
      setRequestId(result.requestId);
      setRole(result.requestedRole);
      setCodeExpiresAt(result.codeExpiresAt ?? null);
      setRetryAfter(result.retryAfter ?? null);
      setStage(result.status === "code_sent" ? "code" : "waiting");
    },
    onError: (error) => {
      const code = appErrorCode(error);
      const copy = code === "PHONE_ALREADY_REGISTERED"
        ? "هذا الرقم مستخدم بالفعل. اختر «لدي حساب بالفعل» لتسجيل الدخول أو استرجاع كلمة المرور."
        : code === "PASSWORD_SETUP_PENDING"
          ? "تم التحقق من هذا الحساب سابقاً لكنه ينتظر اختيار كلمة المرور. أكمل التسجيل من نفس الجهاز أو اطلب رمزاً جديداً من الإدارة."
          : code === "ACCOUNT_ALREADY_VERIFIED"
            ? "هذا الحساب مكتمل بالفعل. اختر «لدي حساب بالفعل» لتسجيل الدخول."
            : code === "DRIVER_DOCUMENTS_REQUIRED"
              ? "يلزم للسفير التقاط صورة شخصية وصورة هوية قبل إرسال الطلب."
              : code === "VEHICLE_TYPE_REQUIRED"
                ? "اختر نوع المركبة قبل إرسال طلب السفير."
                : code === "INVALID_PHONE"
                  ? "أدخل رقم WhatsApp صحيحاً، مثل 09xxxxxxxx أو +9639xxxxxxxx."
                  : code === "ONBOARDING_RATE_LIMITED"
                    ? "تم إيقاف المحاولات مؤقتاً لحماية الحساب. حاول بعد قليل."
                    : code === "DOCUMENT_UPLOAD_FAILED"
                      ? "تم حفظ الطلب، لكن تعذر رفع الوثائق. أعد المحاولة بصورة أصغر."
                      : "تعذر الوصول إلى خدمة التسجيل الآن. تحقق من الإنترنت ثم أعد المحاولة.";
      Alert.alert("تعذر إرسال الطلب", copy);
    },
  });
  const verifyOnboarding = trpc.jarbou3.verifyOnboardingCode.useMutation({
    onSuccess: async (result) => {
      await jarbou3Session.save(result.accessToken, result.refreshToken, { role: result.user.role, name: result.user.name });
      setSavedToken(result.accessToken);
      setRole(result.user.role);
      setWorkspaceName(result.user.name);
      setVerificationCode("");
      setStage("password");
      Alert.alert("تم التحقق", "اختر الآن كلمة مرور لحسابك لإتمام الدخول.");
    },
    onError: async (error) => {
      await onboardingStatus.refetch();
      const copy = error.message === "ONBOARDING_CODE_LOCKED"
        ? "توقفت المحاولات. انتظر ثلاث دقائق قبل طلب رمز جديد من الإدارة."
        : error.message === "ONBOARDING_REQUEST_NOT_FOUND"
          ? "لم نعثر على طلب التحقق المطابق لهذا الرقم. ارجع إلى بيانات التسجيل وتأكد من رقم WhatsApp."
          : error.message === "INVALID_OR_EXPIRED_CODE"
            ? "الرمز غير صحيح أو انتهت صلاحيته. بعد ثلاث محاولات خاطئة يُلغى الرمز تلقائياً."
            : error.message === "AUTH_ACCOUNT_CREATE_FAILED" || error.message === "AUTH_ACCOUNT_UPDATE_FAILED"
              ? "تم قبول الرمز، لكن تعذر تجهيز حساب الدخول. حاول مرة واحدة فقط، ثم أبلغ الإدارة بالرمز: AUTH_ACCOUNT_FAILED."
              : error.message === "PROFILE_LOOKUP_FAILED" || error.message === "PROFILE_UPDATE_FAILED" || error.message === "VERIFICATION_UPDATE_FAILED"
                ? "تم قبول الرمز، لكن تعذر حفظ مرحلة التسجيل. حاول مرة واحدة فقط، ثم أبلغ الإدارة بالرمز: PROFILE_SYNC_FAILED."
                : error.message === "SESSION_CREATE_FAILED"
                  ? "تم قبول الرمز، لكن تعذر إنشاء جلسة الدخول. حاول مرة واحدة فقط، ثم أبلغ الإدارة بالرمز: SESSION_CREATE_FAILED."
            : "تعذر التحقق الآن. تحقق من الاتصال ثم أعد المحاولة.";
      Alert.alert("تعذر التحقق", copy);
    },
  });
  const completeOnboardingPassword = trpc.jarbou3.completeOnboardingPassword.useMutation({
    onSuccess: async (result) => {
      setWorkspaceName(result.user.name);
      setRole(result.user.role);
      setAccountPassword("");
      setPasswordConfirm("");
      await Promise.all([jarbou3Session.clearOnboarding(), jarbou3Session.clearActiveTrip()]);
      setStage("workspace");
      Alert.alert("تم إنشاء الحساب", `أهلاً ${result.user.name}`);
    },
    onError: (error) => Alert.alert("تعذر حفظ كلمة المرور", error.message === "PASSWORD_SETUP_NOT_AVAILABLE" ? "انتهت جلسة إعداد كلمة المرور. تواصل مع الإدارة لإرسال رمز جديد." : "حاول مرة أخرى بكلمة مرور مختلفة."),
  });
  const signIn = trpc.jarbou3.signIn.useMutation({
    onSuccess: async (result) => {
      await Promise.all([jarbou3Session.save(result.accessToken, result.refreshToken, { role: result.user.role, name: result.user.name }), jarbou3Session.clearActiveTrip()]);
      setSavedToken(result.accessToken);
      setRole(result.user.role);
      setWorkspaceName(result.user.name);
      setStage("workspace");
    },
    onError: (error) => {
      const code = appErrorCode(error);
      const copy = code === "NETWORK_REQUEST_FAILED"
        ? "تعذر الوصول إلى الخادم. بدّل بين بيانات الهاتف والواي فاي، وأعد المحاولة بعد لحظات؛ لم تتغير كلمة المرور أو الحساب."
        : code === "INVALID_PHONE"
        ? "أدخل رقم WhatsApp صحيحاً، مثل 09xxxxxxxx أو +9639xxxxxxxx."
        : code === "SIGN_IN_PASSWORD_INVALID"
          ? "كلمة المرور غير مطابقة لهذا الحساب. استخدم «نسيت كلمة المرور؟» لإعادة تعيينها."
          : code === "SIGN_IN_IDENTITY_LOOKUP_FAILED"
            ? "تعذر العثور على هوية الحساب. أبلغ الإدارة بالرمز: SIGN_IN_IDENTITY_LOOKUP_FAILED."
            : code === "SIGN_IN_IDENTITY_MIGRATION_FAILED"
              ? "تعذر تجهيز هوية الدخول لهذا الحساب. أبلغ الإدارة بالرمز: SIGN_IN_IDENTITY_MIGRATION_FAILED."
              : code === "SIGN_IN_ACCOUNT_NOT_FOUND"
                ? "لا يوجد حساب مسجل بهذا الرقم. تحقق من الرقم أو أنشئ حساباً جديداً."
                : code === "SIGN_IN_PROFILE_LOOKUP_FAILED"
                  ? "تعذر الوصول إلى ملف الحساب في الخادم. حاول بعد قليل؛ المشكلة من الخدمة وليست من كلمة المرور."
                  : "تعذر تسجيل الدخول الآن. تحقق من الاتصال والرقم وكلمة المرور ثم حاول مرة أخرى.";
      Alert.alert("تعذر الدخول", copy);
    },
  });
  const requestRecovery = trpc.jarbou3.requestAccountRecovery.useMutation({
    onSuccess: (result) => {
      setRecoveryRequestId(result.requestId);
      setCodeExpiresAt(result.codeExpiresAt ?? null);
      setRetryAfter(result.retryAfter ?? null);
      setStage(result.status === "code_sent" ? "recoveryCode" : "recoveryWaiting");
    },
    onError: (error) => {
      const copy = error.message === "RECOVERY_ACCOUNT_NOT_FOUND"
        ? "لم نجد حساباً مطابقاً للاسم والرقم ونوع الحساب."
        : error.message === "ONBOARDING_RATE_LIMITED"
          ? "تم إيقاف محاولات الاسترجاع مؤقتاً لحماية الحساب. انتظر 15 دقيقة ثم أعد المحاولة."
          : error.message === "RECOVERY_PROFILE_LOOKUP_FAILED"
            ? "تعذر قراءة بيانات الحساب من الخادم. أعد المحاولة لاحقاً."
            : error.message === "RECOVERY_STATUS_LOOKUP_FAILED" || error.message === "RECOVERY_REQUEST_FAILED"
              ? "تعذر حفظ طلب الاسترجاع في الخادم. أعد المحاولة لاحقاً، وإذا تكرر الخطأ أرسل الرمز: RECOVERY_STORAGE_FAILED."
              : "تعذر إنشاء طلب الاسترجاع الآن. تحقق من الاتصال والبيانات ثم أعد المحاولة.";
      Alert.alert("تعذر إرسال الطلب", copy);
    },
  });
  const recoveryStatus = trpc.jarbou3.recoveryStatus.useQuery({ requestId: recoveryRequestId ?? "00000000-0000-0000-0000-000000000000", phone }, { enabled: Boolean(recoveryRequestId) && Boolean(phone) && (stage === "recoveryWaiting" || stage === "recoveryCode"), refetchInterval: stage === "recoveryWaiting" ? 4_000 : false, retry: false });
  useEffect(() => {
    const next = recoveryStatus.data;
    if (!next) return;
    if (next.codeExpiresAt) setCodeExpiresAt(next.codeExpiresAt);
    if (next.retryAfter) setRetryAfter(next.retryAfter);
    if (next.status === "code_sent" && stage === "recoveryWaiting") setStage("recoveryCode");
    if (next.status === "locked") {
      setRecoveryCode("");
      setCodeExpiresAt(null);
      setStage("recoveryWaiting");
    }
  }, [recoveryStatus.data, stage]);
  const verifyRecovery = trpc.jarbou3.verifyRecoveryCode.useMutation({
    onSuccess: (result) => {
      setRecoveryResetToken(result.resetToken);
      setRecoveryCode("");
      setCodeExpiresAt(result.resetTokenExpiresAt);
      setStage("recoveryPassword");
    },
    onError: async (error) => {
      await recoveryStatus.refetch();
      Alert.alert("تعذر التحقق", error.message === "RECOVERY_CODE_LOCKED" ? "توقفت المحاولات. انتظر ثلاث دقائق قبل طلب رمز جديد." : "الرمز غير صحيح أو انتهت صلاحيته.");
    },
  });
  const completeRecovery = trpc.jarbou3.completeAccountRecovery.useMutation({
    onSuccess: async (result) => {
      await Promise.all([jarbou3Session.save(result.accessToken, result.refreshToken, { role: result.user.role, name: result.user.name }), jarbou3Session.clearActiveTrip()]);
      setSavedToken(result.accessToken);
      setRole(result.user.role);
      setWorkspaceName(result.user.name);
      setRecoveryResetToken(null);
      setAccountPassword("");
      setPasswordConfirm("");
      setStage("workspace");
      Alert.alert("تمت إعادة التعيين", "تم إلغاء كلمة المرور السابقة وتسجيل دخولك بأمان.");
    },
    onError: (error) => {
      const copy = error.message === "RECOVERY_NOT_VERIFIED"
        ? "انتهت جلسة الاسترجاع. اطلب رمز استرجاع جديداً من الإدارة."
        : error.message === "RECOVERY_PASSWORD_UPDATE_FAILED"
          ? "تعذر حفظ كلمة المرور في حساب الدخول. حاول مرة واحدة فقط ثم أبلغ الإدارة بالرمز: RECOVERY_PASSWORD_UPDATE_FAILED."
          : error.message === "RECOVERY_SESSION_CREATE_FAILED"
            ? "حُفظت كلمة المرور، لكن تعذر فتح جلسة الدخول. اضغط «لدي حساب بالفعل» وسجّل الدخول بكلمة المرور الجديدة."
            : "تعذر إكمال عملية الاسترجاع. حاول مرة واحدة فقط ثم أبلغ الإدارة بالرمز: RECOVERY_COMPLETE_FAILED.";
      Alert.alert("تعذر حفظ كلمة المرور", copy);
    },
  });
  const submitForm = () => {
    if (!policyAccepted) {
      Alert.alert("الموافقة مطلوبة", "اقرأ شروط الاستخدام وسياسة الخصوصية ثم حدّد مربع الموافقة قبل إرسال بيانات التسجيل.");
      return;
    }
    if (!isJarbou3Phone(phone) || name.trim().length < 2) {
      Alert.alert("تحقق من البيانات", "أدخل اسماً من حرفين على الأقل ورقم WhatsApp بصيغة دولية صحيحة.");
      return;
    }
    const isMatchingTeamDriver = Boolean(preapprovedDriver.data?.found);
    if (role === "driver" && !isMatchingTeamDriver && (!onboardingPersonalPhoto || !onboardingIdentityPhoto)) {
      Alert.alert("وثائق السفير مطلوبة", "التقط الصورة الشخصية وصورة الهوية قبل إرسال طلب المراجعة.");
      return;
    }
    setPhone(normalizedPhone);
    submitOnboarding.mutate({ fullName: name.trim(), phone: normalizedPhone, requestedRole: role, vehicleType: role === "driver" ? vehicleType : undefined, personalPhoto: role === "driver" && !isMatchingTeamDriver ? onboardingPersonalPhoto ?? undefined : undefined, identityPhoto: role === "driver" && !isMatchingTeamDriver ? onboardingIdentityPhoto ?? undefined : undefined });
  };
  const verifyCode = () => {
    if (codeExpired) return Alert.alert("انتهت صلاحية الرمز", "اطلب من المدير إنشاء رمز WhatsApp جديد ثم تحقق منه." );
    const code = normalizeJarbou3Otp(verificationCode);
    if (!requestId || !code) return Alert.alert("الرمز غير مكتمل", "أدخل رمز التحقق المكوّن من ستة أرقام.");
    verifyOnboarding.mutate({ requestId, phone: normalizedPhone, code });
  };
  const saveOnboardingPassword = () => {
    if (accountPassword.length < 8 || accountPassword !== passwordConfirm) return Alert.alert("تحقق من كلمة المرور", "اكتب كلمة مرور من ثمانية أحرف على الأقل وأعد كتابتها مطابقة.");
    if (!savedToken) return Alert.alert("انتهت الجلسة", "أدخل رمز WhatsApp مرة أخرى لإكمال التسجيل.");
    completeOnboardingPassword.mutate({ accessToken: savedToken, password: accountPassword });
  };
  const submitRecoveryRequest = () => {
    if (!isJarbou3Phone(phone) || name.trim().length < 2) return Alert.alert("تحقق من البيانات", "أدخل الاسم الكامل ورقم WhatsApp الصحيحين.");
    setPhone(normalizedPhone);
    requestRecovery.mutate({ fullName: name.trim(), phone: normalizedPhone, requestedRole: role });
  };
  const submitRecoveryCode = () => {
    const code = normalizeJarbou3Otp(recoveryCode);
    if (!recoveryRequestId || !code) return Alert.alert("الرمز غير مكتمل", "أدخل رمز التحقق المكوّن من ستة أرقام.");
    if (codeExpired) return Alert.alert("انتهت صلاحية الرمز", "اطلب من الإدارة إرسال رمز جديد.");
    verifyRecovery.mutate({ requestId: recoveryRequestId, phone: normalizedPhone, code });
  };
  const saveRecoveredPassword = () => {
    if (!recoveryRequestId || !recoveryResetToken) return Alert.alert("انتهت الجلسة", "ابدأ طلب استرجاع كلمة المرور من جديد.");
    if (accountPassword.length < 8 || accountPassword !== passwordConfirm) return Alert.alert("تحقق من كلمة المرور", "اكتب كلمة مرور من ثمانية أحرف على الأقل وأعد كتابتها مطابقة.");
    completeRecovery.mutate({ requestId: recoveryRequestId, phone: normalizedPhone, resetToken: recoveryResetToken, password: accountPassword });
  };
  const captureOnboardingDocument = async (kind: "personal" | "identity") => {
    const ImagePicker = await import("expo-image-picker");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("إذن الكاميرا مطلوب", "يلزم إذن الكاميرا لالتقاط وثائق السفير.");
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.6, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) return Alert.alert("تعذر قراءة الصورة", "التقط الصورة من جديد ثم حاول مرة أخرى.");
    if (asset.base64.length > 4_000_000) return Alert.alert("الصورة كبيرة جداً", "التقط صورة أوضح من مسافة أبعد قليلاً ثم حاول مرة أخرى.");
    const uri = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    if (kind === "personal") setOnboardingPersonalPhoto(uri); else setOnboardingIdentityPhoto(uri);
  };
  const submitSignIn = () => {
    // تسجيل الدخول يجب أن يقبل كلمات المرور القديمة؛ حد الثمانية أحرف
    // يطبق فقط عند إنشاء/تغيير كلمة مرور جديدة، وليس على الحسابات الموروثة.
    if (!isJarbou3Phone(phone) || accountPassword.length < 1) return Alert.alert("تحقق من البيانات", "أدخل رقم WhatsApp وكلمة المرور.");
    setPhone(normalizedPhone);
    signIn.mutate({ phone: normalizedPhone, password: accountPassword });
  };
  const logout = async () => { await Promise.all([jarbou3Session.clear(), jarbou3Session.clearOnboarding()]); setPolicyAccepted(false); setPolicyVisible(false); setSavedToken(null); setRequestId(null); setVerificationCode(""); setCodeExpiresAt(null); setRetryAfter(null); setName(""); setPhone(""); setAccountPassword(""); setPasswordConfirm(""); setShowAccountPassword(false); setShowPasswordConfirm(false); setStage("choose"); };
  const refreshRuntimeReadiness = async () => {
    await requestRuntimeLocationPermission();
    setRuntimeReadiness(await readRuntimeReadiness());
  };
  const updateRequired = Boolean(releaseSettings.data?.forceUpdate && releaseSettings.data.updateUrl && isVersionBelow(currentVersion, releaseSettings.data.minVersion));
  // Privacy consent is collected during account creation; sign-in must not reopen the consent gate.
  // Readiness is advisory after authentication. Active trips can show a small
  // banner, but missing GPS/Internet must never hide the workspace or trap the
  // user behind a repeated permission gate.
  const runtimeBlocked = false;
  const runtimeProblem = !runtimeReadiness ? "جارٍ التحقق من الجاهزية…" : !runtimeReadiness.online ? "يلزم اتصال بالإنترنت لاستخدام OPTIMUS X." : !runtimeReadiness.locationGranted ? "اسمح للموقع الجغرافي لاستخدام OPTIMUS X." : "فعّل خدمات GPS من إعدادات الجهاز ثم أعد المحاولة.";

  if (stage === "loading") return <View style={styles.onboardingRoot}><ActivityIndicator color={gray} size="large" /></View>;
  if (stage === "consent") return <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.onboardingScroll}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>سياسة الخصوصية</Text><Text style={styles.onboardingCopy}>{privacyConsent.isError ? "تعذر تحميل حالة الموافقة. أعد المحاولة قبل متابعة استخدام التطبيق." : "قبل استخدام التطبيق، اقرأ السياسة التالية واختر الموافقة أو الرفض."}</Text><View style={styles.verificationGuide}><Text style={styles.verificationGuideText}>{JARBOU3_PRIVACY_POLICY_TEXT}</Text><Text style={styles.verificationGuideText}>نسخة السياسة: {JARBOU3_PRIVACY_POLICY_VERSION}</Text></View><View style={{ gap: 10 }}>{privacyConsent.isError ? <Pressable onPress={() => { void privacyConsent.refetch(); }} disabled={privacyConsent.isFetching} style={styles.authAction}><Text style={styles.actionText}>{privacyConsent.isFetching ? "جارٍ إعادة المحاولة…" : "إعادة تحميل السياسة"}</Text></Pressable> : null}<Pressable onPress={() => savedToken && acceptPrivacyConsent.mutate({ accessToken: savedToken, policyVersion: JARBOU3_PRIVACY_POLICY_VERSION })} disabled={acceptPrivacyConsent.isPending || !savedToken} style={[styles.authAction, acceptPrivacyConsent.isPending && styles.authActionDisabled]}>{acceptPrivacyConsent.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>أوافق وأتابع</Text>}</Pressable></View><Pressable onPress={logout} disabled={acceptPrivacyConsent.isPending} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>أرفض وأخرج</Text></Pressable></View></ScrollView>;
  if (updateRequired) return <View style={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>تحديث مطلوب</Text><Text style={styles.onboardingCopy}>توجد نسخة أحدث مطلوبة لمتابعة استخدام التطبيق. حدّث التطبيق ثم افتحه من جديد.</Text><Pressable onPress={() => Linking.openURL(releaseSettings.data?.updateUrl ?? "").catch(() => Alert.alert("تعذر فتح الرابط", "تواصل مع الإدارة للحصول على رابط التحديث."))} style={styles.authAction}><Text style={styles.actionText}>تحديث التطبيق</Text></Pressable></View></View>;
  if (runtimeBlocked) return <View style={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>يلزم الإنترنت وGPS</Text><Text style={styles.onboardingCopy}>{runtimeProblem}</Text>{runtimeReadiness?.gpsEnabled === false ? <Pressable onPress={() => openRuntimeLocationSettings().catch(() => Alert.alert("تعذر فتح الإعدادات", "افتح إعدادات الموقع في الهاتف وفعّل GPS، ثم أعد التحقق."))} style={styles.authAction}><Text style={styles.actionText}>فتح إعدادات GPS</Text></Pressable> : null}<Pressable onPress={() => refreshRuntimeReadiness().catch(() => Alert.alert("تعذر الفحص", "تحقق من أذونات الموقع والاتصال ثم حاول مرة أخرى."))} style={styles.authAction}><Text style={styles.actionText}>إعادة التحقق</Text></Pressable><Pressable onPress={logout} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>تسجيل الخروج</Text></Pressable></View></View>;
  if (stage === "workspace") return <View style={styles.root}>{runtimeReadiness && (!runtimeReadiness.online || !runtimeReadiness.gpsEnabled || !runtimeReadiness.locationGranted) ? <View style={styles.runtimeBanner}><View style={styles.runtimeBannerRow}><Text style={styles.runtimeBannerText}>{!runtimeReadiness.online ? "انقطع الإنترنت؛ ستُستأنف المزامنة تلقائياً عند عودته." : !runtimeReadiness.locationGranted ? "اسمح للتطبيق بالوصول إلى موقعك حتى يعمل تحديد الموقع." : "خدمة GPS متوقفة. شغّل الموقع من إعدادات الهاتف ليظهر موقعك على الخريطة."}</Text>{runtimeReadiness.online && runtimeReadiness.locationGranted && !runtimeReadiness.gpsEnabled ? <Pressable onPress={() => { void openRuntimeLocationSettings(); }} style={styles.runtimeBannerButton}><Text style={styles.runtimeBannerButtonText}>تشغيل GPS</Text></Pressable> : null}</View></View> : null}<View style={[styles.accessBar, { paddingTop: Math.max(insets.top + 6, 14) }]}><Text style={styles.accessCopy}>{role === "driver" ? "مساحة السفير" : "مساحة العميل"} · جلسة محمية على هذا الجهاز</Text><ProblemReportButton accessToken={savedToken} /></View>{role === "customer" ? <Customer name={workspaceName} phone={phone} onTripActivity={setActiveTrip} onLogout={logout} /> : <Driver name={workspaceName} onTripActivity={setActiveTrip} />}</View>;
  if (stage === "choose") return <View style={styles.onboardingRoot}><View style={styles.chooseGlow} /><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.chooseScroll}><View style={styles.chooseHeader}><View style={styles.chooseLogo}><Mark small /></View><Text style={styles.chooseBrand}>التوصيل في حماة</Text><Text style={styles.chooseTagline}>توصيل راقٍ داخل حماة</Text></View><View style={styles.chooseIntro}><Text style={styles.chooseKicker}>مرحباً بك</Text><Text style={styles.chooseTitle}>ابدأ طلبك بثقة</Text><Text style={styles.chooseCopy}>اختر تجربتك</Text></View><View style={styles.roleOptions}><Pressable onPress={() => { haptic(); setRole("customer"); setPolicyAccepted(false); setStage("form"); }} style={({ pressed }) => [styles.roleOption, pressed && styles.choosePressed]}><View style={styles.roleIcon}><MaterialIcons name="person-outline" size={25} color="#24755E" /></View><View style={styles.roleCopy}><Text style={styles.roleOptionTitle}>أنا عميل</Text><Text style={styles.roleOptionDescription}>اطلب توصيلاً سريعاً وواضحاً</Text></View><MaterialIcons name="arrow-back-ios" size={17} color="#A2AEA8" /></Pressable><Pressable onPress={() => { haptic(); setRole("driver"); setPolicyAccepted(false); setStage("form"); }} style={({ pressed }) => [styles.roleOption, pressed && styles.choosePressed]}><View style={[styles.roleIcon, styles.roleIconDriver]}><MaterialIcons name="two-wheeler" size={25} color="#24755E" /></View><View style={styles.roleCopy}><Text style={styles.roleOptionTitle}>أنا سفير</Text><Text style={styles.roleOptionDescription}>انضم إلى شبكة السفراء في حماة</Text></View><MaterialIcons name="arrow-back-ios" size={17} color="#A2AEA8" /></Pressable></View></ScrollView></View>;
  if (stage === "waiting") return <View style={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>تم إرسال طلبك</Text><Text style={styles.onboardingCopy}>{retrySeconds > 0 ? "أُلغي الرمز بعد ثلاث محاولات غير صحيحة. انتظر قبل طلب رمز جديد من الإدارة." : "يراجع المدير بياناتك ثم يرسل رمزاً من ستة أرقام إلى WhatsApp على الرقم المسجّل."}</Text>{retrySeconds > 0 ? <View style={styles.verificationTimer}><Text style={styles.verificationTimerLabel}>إعادة المحاولة بعد</Text><Text style={styles.verificationTimerValue}>{`${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}`}</Text></View> : <Tag status>بانتظار مراجعة الإدارة</Tag>}<Action title={onboardingStatus.isFetching ? "جارٍ التحقق…" : "تحقق من وصول الرمز"} onPress={() => onboardingStatus.refetch()} /><Pressable onPress={() => setStage("form")} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>تعديل البيانات</Text></Pressable></View></View>;
  if (stage === "code") return <KeyboardAwareScrollView contentContainerStyle={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>أدخل رمز التحقق</Text><Text style={styles.onboardingCopy}>أدخل الرمز الذي وصلك. عند إعادة إرسال رمز من الإدارة يتجدد العداد هنا تلقائياً.</Text><View style={[styles.verificationTimer, codeExpired && styles.verificationTimerExpired]}><Text style={styles.verificationTimerLabel}>{codeExpired ? "الرمز غير صالح الآن" : "صلاحية الرمز"}</Text><Text style={[styles.verificationTimerValue, codeExpired && styles.verificationTimerValueExpired]}>{codeTimerLabel}</Text></View><TextInput value={verificationCode} onChangeText={(value) => setVerificationCode(normalizeJarbou3Digits(value).slice(0, 6))} autoFocus keyboardType="number-pad" maxLength={6} placeholder="••••••" placeholderTextColor="#A0A0A0" style={styles.onboardingOtp} textAlign="center" editable={!codeExpired} /><Pressable onPress={verifyCode} disabled={verifyOnboarding.isPending || codeExpired} style={[styles.authAction, (verifyOnboarding.isPending || codeExpired) && styles.authActionDisabled]}>{verifyOnboarding.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>تحقق من الرمز</Text>}</Pressable><Pressable onPress={() => onboardingStatus.refetch().catch(() => Alert.alert("تعذر التحديث", "تحقق من اتصال الإنترنت ثم أعد المحاولة."))} disabled={onboardingStatus.isFetching} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>{onboardingStatus.isFetching ? "جارٍ التحقق من الرمز الجديد…" : "تحديث حالة الرمز"}</Text></Pressable><Pressable onPress={() => { setVerificationCode(""); setStage("form"); }} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>العودة إلى بيانات التسجيل</Text></Pressable></View></KeyboardAwareScrollView>;
  if (stage === "password") return <KeyboardAwareScrollView contentContainerStyle={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>اختر كلمة المرور</Text><Text style={styles.onboardingCopy}>تم التحقق من رمز WhatsApp. اختر كلمة مرور من ثمانية أحرف على الأقل لإكمال إنشاء الحساب.</Text><TextInput value={accountPassword} onChangeText={setAccountPassword} placeholder="كلمة المرور الجديدة" placeholderTextColor="#999" secureTextEntry style={styles.authInput} textAlign="right" /><TextInput value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="أعد كتابة كلمة المرور" placeholderTextColor="#999" secureTextEntry style={styles.authInput} textAlign="right" /><Pressable onPress={saveOnboardingPassword} disabled={completeOnboardingPassword.isPending} style={[styles.authAction, completeOnboardingPassword.isPending && styles.authActionDisabled]}>{completeOnboardingPassword.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>تأكيد وإنشاء الحساب</Text>}</Pressable></View></KeyboardAwareScrollView>;
  if (stage === "signin") return <AuthShell><AuthHeader title={role === "driver" ? "دخول سائق" : "دخول عميل"} onBack={() => setStage("choose")} /><AuthIntro title="تسجيل الدخول" copy={role === "driver" ? "مرحباً بعودتك، تابع طلبات حماة من مساحة السفير." : "مرحباً بعودتك، سجّل دخولك لمتابعة طلباتك."} /><AuthInput icon="phone" value={phone} onChangeText={setPhone} placeholder="رقم WhatsApp" keyboardType="phone-pad" autoComplete="tel" /><AuthInput icon="lock-outline" value={accountPassword} onChangeText={setAccountPassword} placeholder="كلمة المرور" secureTextEntry={!showAccountPassword} rightAction={<Pressable onPress={() => setShowAccountPassword((current) => !current)} hitSlop={8}><MaterialIcons name={showAccountPassword ? "visibility-off" : "visibility"} size={20} color="#829087" /></Pressable>} /><AuthPrimaryButton title="تسجيل الدخول" onPress={submitSignIn} loading={signIn.isPending} disabled={!isJarbou3Phone(phone) || accountPassword.length < 1} /><AuthLink onPress={() => { setAccountPassword(""); setStage("recoveryRequest"); }}>نسيت كلمة المرور؟</AuthLink></AuthShell>;
  if (stage === "recoveryRequest") return <AuthShell><AuthHeader title="استعادة الحساب" onBack={() => setStage("signin")} /><AuthIntro title="استعادة كلمة المرور" copy="أدخل بيانات الحساب، وسنرسل رمز التحقق إلى WhatsApp بعد المطابقة." /><AuthInput icon="person-outline" value={name} onChangeText={setName} placeholder="الاسم الكامل" autoComplete="name" /><AuthInput icon="phone" value={phone} onChangeText={setPhone} placeholder="رقم WhatsApp" keyboardType="phone-pad" autoComplete="tel" /><AuthPrimaryButton title="إرسال طلب الاسترجاع" onPress={submitRecoveryRequest} loading={requestRecovery.isPending} /><AuthLink onPress={() => setStage("signin")}>العودة إلى تسجيل الدخول</AuthLink></AuthShell>;
  if (stage === "recoveryWaiting") return <AuthShell><AuthHeader title="استعادة الحساب" onBack={() => setStage("signin")} /><AuthIntro title="طلب الاسترجاع قيد المراجعة" copy={retrySeconds > 0 ? "أُلغي الرمز للحماية بعد ثلاث محاولات خاطئة. انتظر قبل طلب رمز جديد." : "بعد مطابقة بياناتك سترسل الإدارة رمزاً من ستة أرقام إلى WhatsApp."} />{retrySeconds > 0 ? <View style={styles.authRecoveryTimer}><Text style={styles.authRecoveryTimerLabel}>إعادة المحاولة بعد</Text><Text style={styles.authRecoveryTimerValue}>{`${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}`}</Text></View> : <Tag status>بانتظار إرسال الرمز</Tag>}<AuthPrimaryButton title={recoveryStatus.isFetching ? "جارٍ التحقق…" : "تحقق من وصول الرمز"} onPress={() => recoveryStatus.refetch()} loading={recoveryStatus.isFetching} /><AuthLink onPress={() => setStage("signin")}>العودة لتسجيل الدخول</AuthLink></AuthShell>;
  if (stage === "recoveryCode") return <AuthShell><AuthHeader title="استعادة الحساب" onBack={() => setStage("signin")} /><AuthIntro title="أدخل رمز الاسترجاع" copy="أدخل رمز WhatsApp ثم اختر كلمة مرور جديدة في الخطوة التالية." /><View style={[styles.authRecoveryTimer, codeExpired && styles.authRecoveryTimerExpired]}><Text style={styles.authRecoveryTimerLabel}>{codeExpired ? "انتهت الصلاحية" : "صلاحية الرمز"}</Text><Text style={[styles.authRecoveryTimerValue, codeExpired && styles.authRecoveryTimerValueExpired]}>{codeTimerLabel}</Text></View><AuthInput icon="dialpad" value={recoveryCode} onChangeText={(value) => setRecoveryCode(normalizeJarbou3Digits(value).slice(0, 6))} autoFocus keyboardType="number-pad" maxLength={6} placeholder="••••••" style={styles.authOtpInput} editable={!codeExpired} /><AuthPrimaryButton title="تحقق من الرمز" onPress={submitRecoveryCode} loading={verifyRecovery.isPending} disabled={codeExpired} /></AuthShell>;
  if (stage === "recoveryPassword") return <AuthShell><AuthHeader title="استعادة الحساب" onBack={() => setStage("signin")} /><AuthIntro title="كلمة مرور جديدة" copy="سيُلغى استخدام كلمة المرور السابقة فور التأكيد." /><AuthInput icon="lock-outline" value={accountPassword} onChangeText={setAccountPassword} placeholder="كلمة المرور الجديدة" secureTextEntry={!showAccountPassword} rightAction={<Pressable onPress={() => setShowAccountPassword((current) => !current)} hitSlop={8}><MaterialIcons name={showAccountPassword ? "visibility-off" : "visibility"} size={20} color="#829087" /></Pressable>} /><AuthInput icon="lock-outline" value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="أعد كتابة كلمة المرور" secureTextEntry={!showPasswordConfirm} rightAction={<Pressable onPress={() => setShowPasswordConfirm((current) => !current)} hitSlop={8}><MaterialIcons name={showPasswordConfirm ? "visibility-off" : "visibility"} size={20} color="#829087" /></Pressable>} /><AuthPrimaryButton title="تأكيد كلمة المرور الجديدة" onPress={saveRecoveredPassword} loading={completeRecovery.isPending} /></AuthShell>;
  const teamDriverReady = role === "driver" && Boolean(preapprovedDriver.data?.found);
  return <AuthShell><AuthHeader title={role === "driver" ? "تسجيل سائق" : "تسجيل عميل"} onBack={() => setStage("choose")} /><AuthIntro title={role === "driver" ? "بيانات السفير" : "بيانات العميل"} copy={teamDriverReady ? "أنت مضاف مسبقاً إلى فريق التوصيل. راجع بياناتك ثم فعّل الحساب." : role === "driver" ? "أكمل بياناتك ووثائقك للانضمام إلى شبكة سفراء حماة." : "أدخل بياناتك لإنشاء حسابك والبدء بطلب التوصيل."} /><AuthSection number="01" title="المعلومات الشخصية"><AuthInput icon="person-outline" value={name} onChangeText={setName} placeholder="الاسم الكامل" autoComplete="name" /><Text style={styles.authHelper}>اكتب اسمك الحقيقي كما يظهر في الهوية.</Text><AuthInput icon="phone" value={phone} onChangeText={setPhone} placeholder="رقم WhatsApp" keyboardType="phone-pad" autoComplete="tel" /></AuthSection>{role === "driver" ? <><AuthSection number="02" title="مركبة التوصيل"><VehicleOption icon="two-wheeler" title="دراجة نارية" selected={vehicleType === "motorcycle"} onPress={() => { haptic(); setVehicleType("motorcycle"); }} /><VehicleOption icon="electric-scooter" title="دراجة كهربائية" selected={vehicleType === "electric_scooter"} onPress={() => { haptic(); setVehicleType("electric_scooter"); }} /></AuthSection><AuthSection number="03" title="الوثائق والصورة">{teamDriverReady ? <View style={styles.authTeamNote}><MaterialIcons name="verified-user" size={20} color="#24755E" /><Text style={styles.authTeamText}>عضو فريق مُضاف مسبقاً — لا تحتاج إلى رفع الوثائق مرة أخرى.</Text></View> : <><AuthDocumentCard icon="person" title="الصورة الشخصية" detail="إضافة صورة واضحة للوجه" uri={onboardingPersonalPhoto} onPress={() => captureOnboardingDocument("personal")} /><AuthDocumentCard icon="badge" title="صورة الهوية" detail="إضافة صورة الهوية بوضوح" uri={onboardingIdentityPhoto} onPress={() => captureOnboardingDocument("identity")} /></>}</AuthSection></> : null}<AuthSection number={role === "driver" ? "04" : "02"} title="الموافقة"><AuthConsent accepted={policyAccepted} onToggle={() => setPolicyAccepted((current) => !current)} onPolicy={() => setPolicyVisible(true)} /></AuthSection><PrivacyPolicySheet visible={policyVisible} onClose={() => setPolicyVisible(false)} /><AuthPrimaryButton title={teamDriverReady ? "تفعيل حساب الفريق" : "إرسال للمراجعة"} onPress={submitForm} loading={submitOnboarding.isPending} disabled={submitOnboarding.isPending || !policyAccepted || !isJarbou3Phone(phone) || name.trim().length < 2 || (role === "driver" && !teamDriverReady && (!onboardingPersonalPhoto || !onboardingIdentityPhoto))} /><AuthLink onPress={() => { setAccountPassword(""); setStage("signin"); }}>لدي حساب بالفعل</AuthLink></AuthShell>;
}

const styles = StyleSheet.create({
  mapModeRow: { flexDirection: "row-reverse", gap: 8, marginHorizontal: 16, marginTop: 12 }, mapMode: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: "#D1D1D1", borderRadius: 13, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }, mapModeActive: { backgroundColor: gray, borderColor: gray }, mapModeText: { color: gray, fontSize: 11, fontWeight: "900" }, mapModeTextActive: { color: "#FFFFFF" }, mapHint: { color: "#727272", fontSize: 11, lineHeight: 17, textAlign: "right" }, addressSearch: { marginHorizontal: 16, marginTop: 12, flexDirection: "row-reverse", gap: 8, alignItems: "center" }, addressSearchInput: { flex: 1, minHeight: 48, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#D8D8D8", color: dark, paddingHorizontal: 13, fontWeight: "700", fontSize: 12 }, addressSearchButton: { minHeight: 48, minWidth: 62, backgroundColor: gray, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 11 }, addressSearchButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, searchFilters: { flexDirection: "row-reverse", gap: 7, marginHorizontal: 16, marginTop: 8 }, searchFilter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: "#E7E7E7" }, searchFilterActive: { backgroundColor: gray }, searchFilterText: { color: gray, fontSize: 11, fontWeight: "900" }, searchFilterTextActive: { color: "#FFFFFF" }, addressResults: { marginHorizontal: 16, marginTop: 7, gap: 6 }, searchEmpty: { marginHorizontal: 16, marginTop: 8, color: "#737373", fontSize: 11, lineHeight: 17, textAlign: "right" }, addressResult: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E0E0E0" }, addressResultText: { flex: 1, color: dark, fontSize: 11, textAlign: "right", lineHeight: 16, fontWeight: "700" }, resultKind: { color: "#767676", fontSize: 9, fontWeight: "900", backgroundColor: "#EEEEEE", borderRadius: 7, paddingHorizontal: 6, paddingVertical: 4 }, addressResultAction: { color: "#2F7A62", fontSize: 10, fontWeight: "900" }, discountBox: { backgroundColor: "#F3F3F3", borderRadius: 16, padding: 12, gap: 8 }, discountTitle: { color: dark, fontSize: 12, fontWeight: "900", textAlign: "right" }, discountRow: { flexDirection: "row-reverse", gap: 8 }, discountInput: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: "#FFFFFF", borderColor: "#D7D7D7", borderWidth: 1, paddingHorizontal: 11, color: dark, fontSize: 12, fontWeight: "800" }, discountButton: { minWidth: 65, minHeight: 44, borderRadius: 12, backgroundColor: gray, justifyContent: "center", alignItems: "center" }, discountButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, discountHint: { color: "#737373", fontSize: 10, textAlign: "right" }, discountSaving: { color: "#2F7A62", fontSize: 10, fontWeight: "900", textAlign: "right", marginTop: 3 },
  root: { flex: 1, backgroundColor: "#F7F9F8" }, authHelper: { color: "#829087", fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: -4, marginBottom: 8 }, authTeamNote: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "#EAF5EF", borderWidth: 1, borderColor: "#B8DCC8" }, authTeamText: { flex: 1, color: "#24755E", fontSize: 11, fontWeight: "800", lineHeight: 17, textAlign: "right" }, onboardingRoot: { flex: 1, backgroundColor: "#F7F9F8", justifyContent: "center", padding: 18, overflow: "hidden" }, onboardingScroll: { flexGrow: 1, justifyContent: "flex-start", padding: 18, paddingTop: 42 }, chooseScroll: { flexGrow: 1, justifyContent: "space-between", paddingTop: 26, paddingBottom: 28, gap: 28 }, chooseGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#E4F2EA", top: -120, left: -86, opacity: 0.85 }, chooseHeader: { alignItems: "center", gap: 4 }, chooseLogo: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF", marginBottom: 4 }, chooseBrand: { color: "#21342A", fontSize: 19, fontWeight: "900", letterSpacing: 1.4 }, chooseTagline: { color: "#7B8C82", fontSize: 10, fontWeight: "700" }, chooseIntro: { alignItems: "flex-end", paddingTop: 16, paddingHorizontal: 3 }, chooseKicker: { color: "#24755E", fontSize: 11, fontWeight: "900", marginBottom: 6 }, chooseTitle: { color: "#21342A", fontSize: 31, fontWeight: "900", textAlign: "right" }, chooseCopy: { color: "#78877F", fontSize: 13, fontWeight: "600", marginTop: 7, textAlign: "right" }, roleOptions: { gap: 11 }, roleOption: { minHeight: 82, flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: 21, backgroundColor: "#FFFFFF", shadowColor: "#1E3B2D", shadowOpacity: 0.07, shadowRadius: 13, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, roleIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF" }, roleIconDriver: { backgroundColor: "#EEF7F3" }, roleCopy: { flex: 1, alignItems: "flex-end" }, roleOptionTitle: { color: "#26382E", fontSize: 15, fontWeight: "900", textAlign: "right" }, roleOptionDescription: { color: "#839189", fontSize: 10, fontWeight: "600", marginTop: 4, textAlign: "right" }, choosePressed: { opacity: 0.8, transform: [{ scale: 0.985 }] }, chooseFooter: { color: "#9AA69F", fontSize: 10, fontWeight: "700", textAlign: "center" }, homeScroll: { flexGrow: 1, paddingHorizontal: 18, gap: 18 }, homeHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, homeIdentity: { flex: 1, alignItems: "flex-end" }, homeEyebrow: { color: "#24755E", fontSize: 10, fontWeight: "900", marginBottom: 5 }, homeGreeting: { color: "#21342A", fontSize: 23, fontWeight: "900", textAlign: "right" }, homeSubcopy: { color: "#7D8C84", fontSize: 11, fontWeight: "600", marginTop: 4, textAlign: "right" }, orderHero: { position: "relative", overflow: "hidden", borderRadius: 27, backgroundColor: "#EAF5EF", padding: 19, gap: 7 }, orderHeroGlow: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "#D5EBDD", top: -92, left: -45 }, orderKicker: { color: "#24755E", fontSize: 10, fontWeight: "900", textAlign: "right" }, orderTitle: { color: "#21342A", fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 2 }, orderCopy: { color: "#6F8177", fontSize: 11, lineHeight: 18, fontWeight: "600", textAlign: "right", marginBottom: 7 }, createOrderButton: { minHeight: 50, borderRadius: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#24755E", shadowColor: "#24755E", shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, createOrderText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, mapShortcut: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: "#FFFFFF99" }, mapShortcutIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF0E5" }, mapShortcutCopy: { flex: 1, alignItems: "flex-end" }, mapShortcutTitle: { color: "#345047", fontSize: 11, fontWeight: "900", textAlign: "right" }, mapShortcutText: { color: "#809087", fontSize: 9, fontWeight: "600", marginTop: 3, textAlign: "right" }, homeSectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 3 }, homeSectionTitle: { color: "#2C3D33", fontSize: 15, fontWeight: "900" }, homeSectionLink: { color: "#24755E", fontSize: 10, fontWeight: "900" }, recentEmpty: { minHeight: 82, flexDirection: "row-reverse", alignItems: "center", gap: 11, paddingHorizontal: 13, borderRadius: 19, backgroundColor: "#FFFFFF", shadowColor: "#1E3B2D", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, recentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF" }, recentCopy: { flex: 1, alignItems: "flex-end" }, recentTitle: { color: "#2D3D34", fontSize: 12, fontWeight: "900", textAlign: "right" }, recentText: { color: "#87958D", fontSize: 10, lineHeight: 16, fontWeight: "600", textAlign: "right", marginTop: 3 }, onboardingCard: { width: "100%", maxWidth: 470, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 28, padding: 22, gap: 13, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 }, landingCard: { width: "100%", maxWidth: 470, alignSelf: "center", backgroundColor: "#241B1F", borderRadius: 30, padding: 24, gap: 16, shadowColor: "#5B1830", shadowOpacity: 0.22, shadowRadius: 22, elevation: 5 }, landingBrand: { alignItems: "center", gap: 6, paddingTop: 4 }, landingBrandName: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: 2 }, landingBrandTagline: { color: "#E9C8D0", fontSize: 12, fontWeight: "800" }, landingDivider: { height: 1, backgroundColor: "#704453", marginVertical: 2 }, landingTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", textAlign: "right", marginTop: 2 }, landingCopy: { color: "#EADFE2", fontSize: 13, lineHeight: 21, textAlign: "right" }, onboardingTitle: { color: dark, fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 4 }, onboardingCopy: { color: "#737373", fontSize: 13, lineHeight: 21, textAlign: "right" }, onboardingNote: { color: "#7A7A7A", fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 2 }, verificationGuide: { backgroundColor: "#F2F2F2", borderRadius: 16, padding: 13, gap: 5 }, verificationGuideTitle: { color: dark, fontSize: 12, fontWeight: "900", textAlign: "right", marginBottom: 2 }, verificationGuideText: { color: "#666666", fontSize: 11, lineHeight: 18, textAlign: "right" }, verificationTimer: { backgroundColor: "#E7F3EC", borderColor: "#B7DEC8", borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, verificationTimerExpired: { backgroundColor: "#FBE9E8", borderColor: "#E6BBB7" }, verificationTimerLabel: { color: "#2F7A62", fontSize: 11, fontWeight: "900", textAlign: "right" }, verificationTimerValue: { color: "#276149", fontSize: 17, fontWeight: "900" }, verificationTimerValueExpired: { color: "#B42318" }, roleChoice: { backgroundColor: "#F2F2F2", padding: 16, borderRadius: 18, gap: 4 }, roleChoiceDark: { backgroundColor: "#292929" }, roleChoiceTitle: { color: dark, fontSize: 17, fontWeight: "900", textAlign: "right" }, roleChoiceTitleDark: { color: "#FFFFFF", fontSize: 17, fontWeight: "900", textAlign: "right" }, roleChoiceCopy: { color: "#707070", fontSize: 11, textAlign: "right" }, roleChoiceCopyDark: { color: "#D2D2D2", fontSize: 11, textAlign: "right" }, onboardingOtp: { minHeight: 60, backgroundColor: "#F5F5F5", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 18, paddingHorizontal: 14, color: dark, fontSize: 26, letterSpacing: 8, fontWeight: "900" }, vehicleChoices: { flexDirection: "row-reverse", gap: 9 }, vehicleChoice: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#D8D8D8", justifyContent: "center", alignItems: "center", backgroundColor: "#FAFAFA" }, vehicleChoiceSelected: { borderColor: gray, borderWidth: 2, backgroundColor: "#E9E9E9" }, vehicleChoiceText: { color: gray, fontSize: 11, fontWeight: "900" },   scroll: { paddingBottom: 30 }, sheetScroll: { paddingBottom: 28, gap: 10 },   fill: { flex: 1 }, keyboardAvoiding: { flex: 1 }, profilePage: { backgroundColor: "#F5F7F5" }, profileScroll: { flexGrow: 1, padding: 20, paddingTop: 12, paddingBottom: 32, gap: 16 }, profileHeader: { alignItems: "center", paddingTop: 8, paddingBottom: 8 }, profileBack: { alignSelf: "flex-start", width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#10231B", shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }, profileBackText: { color: dark, fontSize: 30, lineHeight: 30, transform: [{ rotate: "180deg" }] }, profileAvatar: { width: 82, height: 82, borderRadius: 28, backgroundColor: "#24755E", alignItems: "center", justifyContent: "center", marginTop: -2 }, profileAvatarText: { color: "#FFFFFF", fontSize: 34, fontWeight: "900" }, profileTitle: { color: dark, fontSize: 24, fontWeight: "900", marginTop: 12 }, profileSubtitle: { color: "#6D7C74", fontSize: 12, marginTop: 4 }, profileCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 16, shadowColor: "#10231B", shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }, profileSectionTitle: { color: dark, fontSize: 15, fontWeight: "900", textAlign: "right", marginBottom: 10 }, profileRow: { minHeight: 38, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12 }, profileLabel: { color: "#829087", fontSize: 11, fontWeight: "700" }, profileValue: { color: dark, fontSize: 13, fontWeight: "900", flexShrink: 1, textAlign: "right" }, profileDivider: { height: 1, backgroundColor: "#EEF2EF", marginVertical: 8 }, profileAction: { minHeight: 44, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, profileActionText: { color: dark, fontSize: 13, fontWeight: "800" }, profileChevron: { color: "#24755E", fontSize: 26, lineHeight: 26, transform: [{ rotate: "180deg" }] }, profileHint: { color: "#718078", fontSize: 11, lineHeight: 18, textAlign: "right" }, profileLogout: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: "#D9B3B3", alignItems: "center", justifyContent: "center", backgroundColor: "#FFF8F8" }, profileLogoutText: { color: "#A33E3E", fontSize: 14, fontWeight: "900" }, locationNotice: { marginHorizontal: 16, marginBottom: 4, borderRadius: 14, backgroundColor: "#FFF4E5", paddingHorizontal: 12, paddingVertical: 9 }, locationNoticeText: { color: "#815B20", fontSize: 11, lineHeight: 17, textAlign: "right" }, flex: { flex: 1 }, pressed: { opacity: 0.78, transform: [{ scale: 0.986 }] }, space: { paddingHorizontal: 16, paddingTop: 16, gap: 14 }, roleSwitch: { flexDirection: "row-reverse", gap: 4, marginHorizontal: 16, marginTop: 8, marginBottom: 8, backgroundColor: "#E4E4E4", padding: 4, borderRadius: 14 }, role: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" }, roleSelected: { backgroundColor: "#FFF" }, roleText: { color: "#747474", fontSize: 13, fontWeight: "800" }, roleTextSelected: { color: dark },
  accessBar: { marginHorizontal: 16, marginBottom: 2, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 10 }, accessCopy: { color: "#737373", fontSize: 10, fontWeight: "700", textAlign: "right", flex: 1 }, accessButton: { backgroundColor: "#FFFFFF", borderColor: "#D7D7D7", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, accessButtonText: { color: "#4A4A4A", fontSize: 10, fontWeight: "900" }, reportIssueButton: { backgroundColor: "#FFF4E6", borderColor: "#E7B97C", borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 }, reportIssueText: { color: "#854E0E", fontSize: 10, fontWeight: "900" }, runtimeBanner: { backgroundColor: "#FFF2D8", borderColor: "#EAB15C", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 16, marginTop: 8 }, runtimeBannerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 }, runtimeBannerText: { flex: 1, color: "#714B12", fontSize: 11, fontWeight: "800", lineHeight: 17, textAlign: "right" }, runtimeBannerButton: { backgroundColor: "#24755E", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 }, runtimeBannerButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, modalBackdrop: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }, authSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 12 }, problemSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 12 }, policySheet: { maxHeight: "88%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12 }, policyHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 }, policySheetTitle: { flex: 1, color: dark, fontSize: 18, fontWeight: "900", textAlign: "right" }, policyClose: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: "#F0F0F0" }, policyCloseText: { color: gray, fontSize: 11, fontWeight: "900" }, policyScroll: { maxHeight: 470 }, policyScrollContent: { paddingBottom: 8 }, policyText: { color: "#444444", fontSize: 12, lineHeight: 22, textAlign: "right" }, policyConsentRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, paddingVertical: 4 }, policyConsentText: { flex: 1, color: "#5E5E5E", fontSize: 11, lineHeight: 19, textAlign: "right" }, policyConsentLink: { color: "#9B1734", fontWeight: "900", textDecorationLine: "underline" }, policyCheckbox: { width: 25, height: 25, borderRadius: 7, borderWidth: 1.5, borderColor: "#B8B8B8", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }, policyCheckboxSelected: { backgroundColor: "#9B1734", borderColor: "#9B1734" }, policyCheckboxText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", lineHeight: 19 }, problemTitle: { color: dark, fontSize: 20, fontWeight: "900", textAlign: "right" }, problemCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "right" }, problemInput: { minHeight: 130, borderRadius: 16, backgroundColor: "#F5F5F5", borderColor: "#DDDDDD", borderWidth: 1, padding: 14, color: dark, fontSize: 13, fontWeight: "700" }, authTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right" }, authCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "right", marginBottom: 4 }, authInput: { minHeight: 52, borderRadius: 15, backgroundColor: "#F5F5F5", borderColor: "#DDDDDD", borderWidth: 1, paddingHorizontal: 14, color: dark, fontSize: 14, fontWeight: "700" }, authRecoveryTimer: { minHeight: 70, borderRadius: 18, backgroundColor: "#EAF5EF", alignItems: "center", justifyContent: "center", marginBottom: 12 }, authRecoveryTimerExpired: { backgroundColor: "#FFF4F2" }, authRecoveryTimerLabel: { color: "#7B8C82", fontSize: 10, fontWeight: "800" }, authRecoveryTimerValue: { color: "#24755E", fontSize: 22, fontWeight: "900", marginTop: 3 }, authRecoveryTimerValueExpired: { color: "#B42318" }, authOtpInput: { textAlign: "center", fontSize: 24, letterSpacing: 6, fontWeight: "900" }, authAction: { minHeight: 53, borderRadius: 16, backgroundColor: gray, alignItems: "center", justifyContent: "center" }, authActionDisabled: { opacity: 0.65 }, modeSwitch: { paddingVertical: 8, alignItems: "center" }, modeSwitchText: { color: gray, fontSize: 12, fontWeight: "900" },
  startedTripNotice: { color: "#9B1734", backgroundColor: "#FCEBED", borderRadius: 14, padding: 12, textAlign: "right", fontSize: 11, fontWeight: "800", lineHeight: 17 }, startTripTrack: { minHeight: 58, borderRadius: 18, backgroundColor: "#E9F4EF", borderWidth: 1, borderColor: "#9AC9B4", justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" }, startTripTrackDisabled: { opacity: 0.55 }, startTripText: { color: "#276149", fontSize: 13, fontWeight: "900" }, startTripKnob: { position: "absolute", left: 5, width: 48, height: 48, borderRadius: 15, backgroundColor: "#2F7A62", alignItems: "center", justifyContent: "center" }, startTripArrow: { color: "#FFFFFF", fontSize: 31, lineHeight: 34, fontWeight: "900" }, action: { minHeight: 53, borderRadius: 16, backgroundColor: gray, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 }, actionDark: { backgroundColor: "#FFF" }, actionOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#C9C9C9" }, actionText: { color: "#FFF", fontSize: 14, fontWeight: "900", textAlign: "center" }, actionOutlineText: { color: gray }, tag: { backgroundColor: "#E9E9E9", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, alignSelf: "flex-start" }, tagStatus: { backgroundColor: "#DDF2E9" }, tagText: { color: "#555", fontSize: 10, fontWeight: "900" }, tagStatusText: { color: "#276149" },
  mark: { width: 56, height: 56, borderRadius: 18, overflow: "hidden", backgroundColor: "#FFF", alignSelf: "center", marginBottom: 8 }, markSmall: { width: 34, height: 34, borderRadius: 11 }, markImage: { width: "100%", height: "100%" }, hero: { marginHorizontal: 16, padding: 19, borderRadius: 24, backgroundColor: "#FFF", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, heroTitle: { color: dark, fontSize: 24, fontWeight: "900", textAlign: "right" }, eyebrow: { color: "#747474", fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 4 }, copy: { color: "#737373", textAlign: "right", fontSize: 12, lineHeight: 19, marginTop: 4 }, copyRight: { color: "#737373", textAlign: "right", fontSize: 12, lineHeight: 19 },
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" }, mapCompact: { height: 188 }, nativeMap: { flex: 1 }, mapRoad: { position: "absolute", height: 4, left: -30, right: -30, backgroundColor: "#FFF", opacity: 0.75 }, mapName: { position: "absolute", top: 18, left: 20, color: "#747474", fontSize: 18, fontWeight: "900" }, dot: { position: "absolute", width: 12, height: 12, borderRadius: 8, borderWidth: 2, borderColor: "#FFF", backgroundColor: "#888" }, dotTarget: { width: 20, height: 20, borderRadius: 10, right: "12%", top: "20%", backgroundColor: "#2F7A62" }, mapDriver: { position: "absolute", top: "37%", left: "54%", borderWidth: 3, borderColor: "#FFF", borderRadius: 14 }, mapBadge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }, mapBadgeText: { color: gray, fontSize: 11, fontWeight: "900" },
  headingRow: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" }, heading: { color: dark, fontSize: 19, fontWeight: "900", textAlign: "right" }, aside: { color: "#737373", fontSize: 11, fontWeight: "800" }, note: { backgroundColor: "#E7E7E7", borderRadius: 18, padding: 14, flexDirection: "row-reverse", gap: 10, alignItems: "center" }, noteIcon: { color: "#FFF", backgroundColor: gray, width: 35, height: 35, borderRadius: 11, overflow: "hidden", textAlign: "center", textAlignVertical: "center", fontSize: 19, fontWeight: "900" }, noteTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, noteCopy: { color: "#737373", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 2 }, empty: { backgroundColor: "#FFF", borderRadius: 18, borderColor: "#D8D8D8", borderWidth: 1, borderStyle: "dashed", padding: 16 }, emptyText: { color: "#737373", fontSize: 12, textAlign: "right" },
  top: { height: 60, paddingHorizontal: 16, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, back: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" }, backText: { color: dark, fontSize: 30, marginTop: -6 }, backBlank: { width: 38 }, topTitle: { color: dark, fontSize: 17, fontWeight: "900" }, card: { backgroundColor: "#FFF", margin: 16, padding: 17, borderRadius: 23, gap: 11 }, label: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 3 }, favoriteSection: { backgroundColor: "#F4F4F4", borderRadius: 16, padding: 12, gap: 9 }, favoriteTitle: { color: dark, fontSize: 12, fontWeight: "900", textAlign: "right" }, favoriteRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, favoriteChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", borderColor: "#DADADA", borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 9, maxWidth: "100%" }, favoriteChipText: { color: gray, fontSize: 10, fontWeight: "900", maxWidth: 150 }, favoriteDelete: { color: "#B42318", fontSize: 16, lineHeight: 16, fontWeight: "900" }, favoriteEmpty: { color: "#767676", fontSize: 10, lineHeight: 16, textAlign: "right" }, saveFavoriteRow: { flexDirection: "row-reverse", gap: 7 }, favoriteInput: { flex: 1, minHeight: 42, backgroundColor: "#FFFFFF", borderRadius: 11, borderWidth: 1, borderColor: "#D9D9D9", paddingHorizontal: 10, color: dark, fontSize: 11, fontWeight: "700" }, saveFavoriteButton: { minWidth: 58, minHeight: 42, backgroundColor: gray, borderRadius: 11, alignItems: "center", justifyContent: "center" }, saveFavoriteButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, stops: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, stop: { borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, stopSelected: { borderColor: gray, backgroundColor: gray }, stopText: { color: "#717171", fontSize: 11, fontWeight: "800" }, stopTextSelected: { color: "#FFF" }, quote: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F0F0F0", borderRadius: 16, padding: 13 }, quoteLabel: { color: "#747474", fontSize: 10, fontWeight: "800", textAlign: "right" }, quoteValue: { color: dark, fontSize: 17, fontWeight: "900", marginTop: 3, textAlign: "right" }, quoteValueSmall: { color: gray, fontSize: 12, fontWeight: "800", marginTop: 3, textAlign: "right" }, quoteLine: { width: 1, height: 35, backgroundColor: "#D3D3D3" }, paymentRow: { flexDirection: "row-reverse", gap: 9 }, payment: { flex: 1, minHeight: 54, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 15 }, paymentSelected: { borderWidth: 2, borderColor: gray, backgroundColor: "#F1F1F1" }, paymentText: { color: gray, fontSize: 12, fontWeight: "900" },
  trackSheet: { flex: 1, padding: 19, paddingTop: 12, backgroundColor: "#FFF", marginTop: -18, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12 }, startedNotice: { position: "absolute", top: 242, left: 24, right: 24, zIndex: 5, backgroundColor: "#1473E6", padding: 13, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 }, startedNoticeTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", textAlign: "right" }, startedNoticeCopy: { color: "#E6F0FF", fontSize: 11, marginTop: 3, textAlign: "right" }, acceptedNotice: { position: "absolute", top: 242, left: 24, right: 24, zIndex: 5, backgroundColor: "#2F7A62", padding: 13, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 }, acceptedNoticeTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", textAlign: "right" }, acceptedNoticeCopy: { color: "#E3F5ED", fontSize: 11, marginTop: 3, textAlign: "right" }, handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D8D8D8", alignSelf: "center" }, split: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, muted: { color: "#737373", fontSize: 11, fontWeight: "700" }, trackTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right" }, driverBox: { backgroundColor: "#F2F2F2", borderRadius: 18, padding: 12, flexDirection: "row-reverse", gap: 10, alignItems: "center" }, driverPhoto: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#D8D8D8" }, avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: gray, alignItems: "center", justifyContent: "center" }, avatarText: { color: "#FFF", fontSize: 17, fontWeight: "900" }, driverName: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, mutedRight: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, minor: { backgroundColor: "#FFF", borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }, minorText: { color: gray, fontSize: 11, fontWeight: "900" }, timeline: { gap: 7, paddingRight: 6 }, done: { color: "#2F7A62", textAlign: "right", fontSize: 12, fontWeight: "800" }, live: { color: dark, textAlign: "right", fontSize: 12, fontWeight: "900" }, future: { color: "#AAA", textAlign: "right", fontSize: 12, fontWeight: "800" },
  centered: { padding: 28, alignItems: "center", gap: 15 }, otpBadge: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#E9E9E9", borderColor: "#FFF", borderWidth: 8, alignItems: "center", justifyContent: "center" }, otpBadgeText: { color: gray, fontSize: 18, fontWeight: "900" }, centerTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "center" }, centerCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "center" }, otp: { width: "100%", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 17, padding: 15, fontSize: 22, letterSpacing: 8, color: dark, fontWeight: "900" }, proofNotice: { width: "100%", backgroundColor: "#FFF", borderRadius: 17, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 11 }, proofNoticeIcon: { color: "#A6A6A6", fontSize: 28 }, proofNoticeTitle: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right" }, proofNoticeCopy: { color: "#737373", fontSize: 10, textAlign: "right", marginTop: 3 },
  driverHero: { backgroundColor: "#242424", marginHorizontal: 16, padding: 19, borderRadius: 23, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, driverEyebrow: { color: "#B5B5B5", fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 4 }, driverHeroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "right" }, driverHeroCopy: { color: "#CECECE", fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 4 }, setup: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, setupTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, setupCopy: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, orderCard: { backgroundColor: "#FFF", borderRadius: 21, padding: 17, gap: 10 }, orderPrice: { color: dark, fontSize: 17, fontWeight: "900" }, orderRoute: { color: dark, fontSize: 16, fontWeight: "900", textAlign: "right" }, offerTimer: { backgroundColor: "#EEF7F2", borderRadius: 14, borderColor: "#C8E5D5", borderWidth: 1, padding: 11, gap: 7 }, offerTimerTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, offerTimerLabel: { color: "#276149", fontSize: 11, fontWeight: "900" }, offerTimerValue: { color: "#1E5D45", fontSize: 20, fontWeight: "900" }, offerTimerTrack: { height: 7, backgroundColor: "#D5E8DE", borderRadius: 4, overflow: "hidden" }, offerTimerFill: { height: "100%", backgroundColor: "#2F7A62", borderRadius: 4 }, offerTimerHint: { color: "#527063", fontSize: 10, textAlign: "right" }, shift: { backgroundColor: "#E5E5E5", borderRadius: 18, padding: 15 }, shiftTitle: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right" }, shiftValue: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 4 }, settlementMethods: { flexDirection: "row-reverse", gap: 8, marginTop: 12 }, cashMethod: { flex: 1.5, backgroundColor: "#FFFFFF", borderColor: "#C8E5D5", borderWidth: 1, borderRadius: 13, padding: 10 }, cashMethodTitle: { color: "#276149", fontSize: 11, fontWeight: "900", textAlign: "right" }, cashMethodCopy: { color: "#527063", fontSize: 9, lineHeight: 14, textAlign: "right", marginTop: 3 }, upcomingMethod: { flex: 1, backgroundColor: "#D9D9D9", borderRadius: 13, padding: 10, justifyContent: "center" }, upcomingMethodTitle: { color: "#717171", fontSize: 11, fontWeight: "900", textAlign: "right" }, upcomingMethodCopy: { color: "#8A8A8A", fontSize: 10, fontWeight: "800", textAlign: "right", marginTop: 3 }, upload: { minHeight: 83, backgroundColor: "#FFF", borderRadius: 18, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 11 }, uploadPhoto: { width: 57, height: 57, borderRadius: 13 }, uploadPlaceholder: { width: 57, height: 57, borderRadius: 13, backgroundColor: "#EFEFEF", alignItems: "center", justifyContent: "center" }, uploadSymbol: { color: "#777", fontSize: 29 }, uploadTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, uploadDetail: { color: "#737373", fontSize: 10, textAlign: "right", marginTop: 4 }, input: { minHeight: 52, borderRadius: 16, backgroundColor: "#FFF", borderColor: "#D8D8D8", borderWidth: 1, color: dark, fontWeight: "900", fontSize: 16, paddingHorizontal: 13 },
  drive: { flex: 1, backgroundColor: "#171717", padding: 22, justifyContent: "space-between" }, driveNumber: { color: "#A8A8A8", fontSize: 11, fontWeight: "800" }, driveLabel: { color: "#ABABAB", fontSize: 14, textAlign: "right", fontWeight: "800", marginTop: 30 }, street: { color: "#FFF", fontSize: 34, fontWeight: "900", textAlign: "right", marginTop: 3 }, distance: { color: "#FFF", fontSize: 78, lineHeight: 86, fontWeight: "900", textAlign: "center", marginTop: 24 }, distanceLabel: { color: "#C6C6C6", fontSize: 14, textAlign: "center", fontWeight: "800" }, progress: { height: 11, backgroundColor: "#444", borderRadius: 6, overflow: "hidden", marginTop: 24 }, progressFill: { width: "68%", height: "100%", borderRadius: 6, backgroundColor: "#E5E5E5" }, driveHint: { color: "#C6C6C6", fontSize: 12, textAlign: "center", marginTop: 17 }, gpsQuality: { color: "#E2E2E2", fontSize: 10, textAlign: "center", marginTop: 6 }, driveBottom: { gap: 13 }, utilityRow: { flexDirection: "row-reverse", gap: 10 }, utility: { flex: 1, height: 55, borderRadius: 17, borderWidth: 1, borderColor: "#5B5B5B", justifyContent: "center", alignItems: "center" }, utilityText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  deliveryStep: { flexDirection: "row-reverse", alignItems: "center", gap: 11 }, stepNumber: { width: 33, height: 33, borderRadius: 17, backgroundColor: gray, color: "#FFF", fontWeight: "900", textAlign: "center", textAlignVertical: "center" }, stepTitle: { color: dark, fontSize: 14, fontWeight: "900", textAlign: "right" }, stepDetail: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, cameraBox: { height: 174, backgroundColor: "#FFF", borderColor: "#C8C8C8", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 21, overflow: "hidden", justifyContent: "center", alignItems: "center", gap: 6 }, cameraIcon: { fontSize: 34, color: "#777" }, cameraText: { color: gray, fontSize: 12, fontWeight: "900" }, photo: { width: "100%", height: "100%" },
  adminHero: { marginHorizontal: 16, backgroundColor: "#FFF", padding: 18, borderRadius: 23, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, adminTitle: { color: dark, fontSize: 19, fontWeight: "900", textAlign: "right" }, metrics: { margin: 16, marginBottom: 0, flexDirection: "row-reverse", gap: 7 }, metric: { flex: 1, backgroundColor: "#E8E8E8", borderRadius: 15, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" }, metricValue: { color: dark, fontSize: 16, fontWeight: "900", textAlign: "center" }, metricLabel: { color: "#737373", fontSize: 9, fontWeight: "800", marginTop: 4, textAlign: "center" }, task: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, taskAvatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E3E3E3", alignItems: "center", justifyContent: "center" }, taskAvatarText: { color: gray, fontSize: 16, fontWeight: "900" }, taskTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, taskCopy: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, smallAction: { backgroundColor: gray, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 }, smallActionText: { color: "#FFF", fontSize: 10, fontWeight: "900" }, settle: { backgroundColor: "#252525", borderRadius: 20, padding: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, settleLabel: { color: "#BEBEBE", fontSize: 10, fontWeight: "800", textAlign: "right" }, settleValue: { color: "#FFF", fontSize: 21, fontWeight: "900", textAlign: "right", marginTop: 3 }, settleDetail: { color: "#BEBEBE", fontSize: 10, textAlign: "right", marginTop: 3 }, closeButton: { borderWidth: 1, borderColor: "#747474", padding: 9, borderRadius: 11, maxWidth: 88 }, closeText: { color: "#FFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, report: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, pdf: { width: 45, height: 45, borderRadius: 14, backgroundColor: "#E9E9E9", alignItems: "center", justifyContent: "center" }, pdfText: { color: gray, fontSize: 10, fontWeight: "900" }, reportTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, reportCopy: { color: "#737373", fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 3 },
});
