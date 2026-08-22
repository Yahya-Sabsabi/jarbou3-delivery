import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "@/lib/trpc";
import { jarbou3Session } from "@/lib/jarbou3-session";
import { HAMA_CENTER, formatSyp, type MapPoint } from "@/shared/jarbou3";
import { HamaMap } from "@/components/hama-map";
import { getCurrentHamaLocation, watchHamaLocation } from "@/lib/jarbou3-location";
import { startJarbou3BackgroundTracking, stopJarbou3BackgroundTracking } from "@/lib/jarbou3-background-location";
import { getOsrmRoute, type RouteEstimate } from "@/lib/osrm";
import { configureJarbou3Realtime, subscribeToCustomerOrder, subscribeToOrderLiveLocation, unsubscribeRealtime } from "@/lib/jarbou3-realtime";
import { registerJarbou3PushToken } from "@/lib/jarbou3-notifications";

type Role = "customer" | "driver";
type CustomerPage = "home" | "order" | "track" | "otp";
type DriverPage = "home" | "verify" | "drive" | "deliver";
type DriverOrderPreview = { id: string; source_address: string; source_lat: number | string; source_lng: number | string; destination_address: string; destination_lat: number | string; destination_lng: number | string; estimated_price: number; payment_method: "cash" | "sham_cash"; distance_m: number };
type HamaAddressResult = { label: string; latitude: number; longitude: number; kind: "shop" | "street" | "place" };

const dark = "#1E1E1E";
const gray = "#4A4A4A";

function haptic() {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

function Heading({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: string }) {
  return (
    <View style={styles.headingRow}>
      <View>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.heading}>{title}</Text></View>
      {aside ? <Text style={styles.aside}>{aside}</Text> : null}
    </View>
  );
}

function RoleSwitch({ role, onSelect }: { role: Role; onSelect: (role: Role) => void }) {
  return <View style={styles.roleSwitch}>{(["customer", "driver"] as Role[]).map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.role, role === option && styles.roleSelected]}><Text style={[styles.roleText, role === option && styles.roleTextSelected]}>{option === "customer" ? "عميل" : "سائق"}</Text></Pressable>)}</View>;
}

function Customer({ name }: { name: string }) {
  const [page, setPage] = useState<CustomerPage>("home");
  const [source, setSource] = useState<MapPoint | null>({ latitude: 35.1319, longitude: 36.7547 });
  const [destination, setDestination] = useState<MapPoint | null>({ latitude: 35.1511, longitude: 36.7304 });
  const [selecting, setSelecting] = useState<"source" | "destination">("source");
  const [route, setRoute] = useState<RouteEstimate | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [driverLocation, setDriverLocation] = useState<MapPoint | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [payment, setPayment] = useState<"نقدي" | "شام كاش">("نقدي");
  const [otp, setOtp] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<HamaAddressResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [pickupEtaSeconds, setPickupEtaSeconds] = useState<number | null>(null);
  const [acceptedNotice, setAcceptedNotice] = useState(false);
  const [previousDriverId, setPreviousDriverId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("جارٍ فتح التحديث المباشر…");
  const [searchFilter, setSearchFilter] = useState<"all" | "shops" | "streets">("all");
  const [favoriteLabel, setFavoriteLabel] = useState("");
  const createOrder = trpc.jarbou3.createOrder.useMutation({ onSuccess: () => setPage("track"), onError: (error) => Alert.alert("تعذر إنشاء الطلب", error.message) });
  const currentTracking = trpc.jarbou3.currentCustomerTracking.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: page === "track" && Boolean(accessToken) });
  const addressSearch = trpc.jarbou3.searchHamaAddresses.useQuery({ query: addressQuery.trim().length >= 2 ? addressQuery.trim() : "حماة", filter: searchFilter }, { enabled: false });
  const favoriteAddresses = trpc.jarbou3.listFavoriteAddresses.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken) });
  const saveFavorite = trpc.jarbou3.saveFavoriteAddress.useMutation({ onSuccess: () => { favoriteAddresses.refetch(); setFavoriteLabel(""); Alert.alert("تم الحفظ", "أصبح العنوان ضمن عناوينك المفضلة."); }, onError: (error) => Alert.alert("تعذر الحفظ", error.message) });
  const deleteFavorite = trpc.jarbou3.deleteFavoriteAddress.useMutation({ onSuccess: () => favoriteAddresses.refetch() });
  const registerPushToken = trpc.jarbou3.registerPushToken.useMutation();

  useEffect(() => { jarbou3Session.getAccessToken().then(setAccessToken); }, []);
  useEffect(() => {
    if (!accessToken) return;
    configureJarbou3Realtime(accessToken);
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken) return;
    registerJarbou3PushToken().then((expoPushToken) => {
      if (!expoPushToken || Platform.OS === "web") return;
      registerPushToken.mutate({ accessToken, expoPushToken, platform: Platform.OS === "ios" ? "ios" : "android" });
    });
  }, [accessToken]);

  useEffect(() => {
    if (!source || !destination) return;
    let active = true;
    setRouteLoading(true);
    getOsrmRoute(source, destination).then((next) => { if (active) setRoute(next); }).catch(() => { if (active) setRoute(null); }).finally(() => { if (active) setRouteLoading(false); });
    return () => { active = false; };
  }, [source, destination]);

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

  const setMapPoint = (point: MapPoint) => { if (selecting === "source") setSource(point); else setDestination(point); };
  const searchAddress = async () => {
    if (addressQuery.trim().length < 2) return Alert.alert("اكتب العنوان", "اكتب اسم شارع أو حي أو متجر داخل حماة ثم اضغط بحث.");
    setSearchingAddress(true);
    try {
      const result = await addressSearch.refetch();
      setAddressResults((result.data ?? []) as HamaAddressResult[]);
      if (!result.data?.length) Alert.alert("لا توجد نتائج", "جرّب كتابة اسم الحي أو الشارع متبوعاً بكلمة حماة.");
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
  const useMyLocation = async () => { try { const point = await getCurrentHamaLocation(); setMapPoint(point); } catch (error) { Alert.alert("تعذر استخدام الموقع", error instanceof Error && error.message === "OUTSIDE_HAMA_SERVICE_RADIUS" ? "موقعك خارج نطاق خدمة حماة البالغ ٧ كم." : "اسمح بالوصول إلى الموقع ثم حاول مجدداً."); } };
  const submitOrder = async () => {
    if (!source || !destination || !route) return Alert.alert("اختر النقطتين", "ضع دبوس الاستلام ودبوس التسليم داخل دائرة حماة أولاً.");
    const accessToken = await jarbou3Session.getAccessToken();
    if (!accessToken) return Alert.alert("سجّل الدخول أولاً", "يلزم الدخول الآمن لإنشاء طلب محفوظ ومتابعة السائق.");
    createOrder.mutate({ accessToken, sourceAddress: "نقطة الاستلام المحددة على الخريطة، حماة", destinationAddress: "وجهة التسليم المحددة على الخريطة، حماة", source, destination, estimatedPrice: route.price, paymentMethod: payment === "نقدي" ? "cash" : "sham_cash", distanceM: route.distanceM });
  };

  if (page === "order") return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Top title="طلب توصيل" back={() => setPage("home")} />
      <View style={styles.mapModeRow}>
        <Pressable onPress={() => setSelecting("source")} style={[styles.mapMode, selecting === "source" && styles.mapModeActive]}><Text style={[styles.mapModeText, selecting === "source" && styles.mapModeTextActive]}>١. دبوس الاستلام</Text></Pressable>
        <Pressable onPress={() => setSelecting("destination")} style={[styles.mapMode, selecting === "destination" && styles.mapModeActive]}><Text style={[styles.mapModeText, selecting === "destination" && styles.mapModeTextActive]}>٢. دبوس الوجهة</Text></Pressable>
      </View>
      <View style={styles.addressSearch}>
        <TextInput value={addressQuery} onChangeText={setAddressQuery} onSubmitEditing={searchAddress} returnKeyType="search" placeholder="ابحث عن حي أو شارع أو متجر داخل حماة" placeholderTextColor="#8D8D8D" style={styles.addressSearchInput} textAlign="right" />
        <Pressable onPress={searchAddress} style={styles.addressSearchButton}><Text style={styles.addressSearchButtonText}>{searchingAddress ? "…" : "بحث"}</Text></Pressable>
      </View>
      <View style={styles.searchFilters}>{([{ key: "all", label: "الكل" }, { key: "shops", label: "متاجر" }, { key: "streets", label: "شوارع" }] as const).map((filter) => <Pressable key={filter.key} onPress={() => { setSearchFilter(filter.key); setAddressResults([]); }} style={[styles.searchFilter, searchFilter === filter.key && styles.searchFilterActive]}><Text style={[styles.searchFilterText, searchFilter === filter.key && styles.searchFilterTextActive]}>{filter.label}</Text></Pressable>)}</View>
      {addressResults.length ? <View style={styles.addressResults}>{addressResults.map((result) => <Pressable key={`${result.latitude}-${result.longitude}`} onPress={() => chooseAddress(result)} style={styles.addressResult}><Text numberOfLines={2} style={styles.addressResultText}>{result.label}</Text><Text style={styles.resultKind}>{result.kind === "shop" ? "متجر" : result.kind === "street" ? "شارع" : "مكان"}</Text><Text style={styles.addressResultAction}>وضع الدبوس</Text></Pressable>)}</View> : null}
      <HamaMap source={source} destination={destination} routePath={route?.path} selecting={selecting} onSelect={setMapPoint} onOutsideRange={() => Alert.alert("خارج نطاق الخدمة", "اختر نقطة داخل دائرة حماة المسموح بها، حتى ٧ كم من مركز المدينة.")} />
      <View style={styles.card}>
        <Heading eyebrow="تحديد حر داخل حماة" title="ابحث أو اضغط الخريطة لوضع الدبوس" />
        <Text style={styles.mapHint}>البحث يدوي ويعيد نتائج داخل حماة فقط. الخط الرمادي هو مسار الرحلة المقترح والدائرة الرمادية هي نطاق الخدمة.</Text>
        <Action title="استخدم موقعي الحالي" kind="outline" onPress={useMyLocation} />
        <View style={styles.favoriteSection}>
          <Text style={styles.favoriteTitle}>عناويني المفضلة</Text>
          {accessToken ? <><View style={styles.favoriteRow}>{(favoriteAddresses.data ?? []).length ? favoriteAddresses.data?.map((favorite) => <Pressable key={favorite.id} onPress={() => chooseFavorite(favorite)} style={styles.favoriteChip}><Text numberOfLines={1} style={styles.favoriteChipText}>{favorite.label}</Text><Pressable onPress={() => deleteFavorite.mutate({ accessToken, favoriteId: favorite.id })} hitSlop={8}><Text style={styles.favoriteDelete}>×</Text></Pressable></Pressable>) : <Text style={styles.favoriteEmpty}>احفظ الدبوس الحالي ليظهر هنا.</Text>}</View><View style={styles.saveFavoriteRow}><TextInput value={favoriteLabel} onChangeText={setFavoriteLabel} placeholder="اسم اختياري، مثل المنزل" placeholderTextColor="#909090" style={styles.favoriteInput} textAlign="right" /><Pressable onPress={saveCurrentFavorite} style={styles.saveFavoriteButton}><Text style={styles.saveFavoriteButtonText}>{saveFavorite.isPending ? "…" : "حفظ"}</Text></Pressable></View></> : <Text style={styles.favoriteEmpty}>سجّل الدخول لحفظ العناوين واستعمالها في الطلبات القادمة.</Text>}
        </View>
        <View style={styles.quote}><View><Text style={styles.quoteLabel}>السعر التقديري</Text><Text style={styles.quoteValue}>{route ? formatSyp(route.price) : "—"}</Text></View><View style={styles.quoteLine} /><View><Text style={styles.quoteLabel}>المسافة والوقت</Text><Text style={styles.quoteValueSmall}>{routeLoading ? "يُحسب المسار…" : route ? `${(route.distanceM / 1000).toFixed(1)} كم · ${Math.max(1, Math.round(route.durationSeconds / 60))} دقيقة` : "اختر الدبوسين"}</Text></View></View>
        <Text style={styles.label}>طريقة الدفع</Text>
        <View style={styles.paymentRow}>{(["نقدي", "شام كاش"] as const).map((method) => <Pressable key={method} onPress={() => setPayment(method)} style={[styles.payment, payment === method && styles.paymentSelected]}><Text style={styles.paymentText}>{method}</Text></Pressable>)}</View>
        <Action title={createOrder.isPending ? "جارٍ إنشاء الطلب…" : `تأكيد الطلب · ${route ? formatSyp(route.price) : "—"}`} onPress={submitOrder} />
      </View>
    </ScrollView>
  );

  if (page === "track") return <View style={styles.fill}><HamaMap source={source} destination={destination} routePath={route?.path} driverLocation={driverLocation} readOnly />{acceptedNotice ? <View style={styles.acceptedNotice}><Text style={styles.acceptedNoticeTitle}>تم قبول طلبك</Text><Text style={styles.acceptedNoticeCopy}>تم تعيين سائق جربوع وبدأت متابعة موقعه.</Text></View> : null}<View style={styles.trackSheet}><View style={styles.handle} /><View style={styles.split}><Tag status>{currentTracking.data?.driver_id ? "تم تعيين سائق" : "بانتظار سائق"}</Tag><Text style={styles.muted}>طلب قيد المتابعة</Text></View><Text style={styles.trackTitle}>{currentTracking.data?.driver_id ? "السائق متجه إلى المصدر" : "سنعيّن سائقاً قريباً قريباً"}</Text><Text style={styles.copy}>{currentTracking.data?.driver_id ? "يتحرك دبوس الجربوع الرمادي من موقع السائق المعيّن للطلب." : "ستظهر حركة السائق فور قبوله طلبك."}</Text><View style={styles.driverBox}><View style={styles.avatar}><Text style={styles.avatarText}>ج</Text></View><View style={styles.flex}><Text style={styles.driverName}>{currentTracking.data?.driver_id ? "سائق جربوع معيّن" : "بانتظار قبول السائق"}</Text><Text style={styles.mutedRight}>{pickupEtaSeconds != null ? `يصل إلى الاستلام خلال ${Math.max(1, Math.ceil(pickupEtaSeconds / 60))} دقائق تقريباً` : driverLocation ? "يجري حساب وقت الوصول…" : "سيظهر وقت الوصول عند بدء مشاركة الموقع"}</Text></View><Pressable onPress={() => Alert.alert("اتصال", "سيُفتح الاتصال المباشر بالسائق عند تشغيل أرقام الخدمة.")} style={styles.minor}><Text style={styles.minorText}>اتصال</Text></Pressable></View><View style={styles.timeline}><Text style={styles.done}>● تم إنشاء طلبك</Text><Text style={currentTracking.data?.driver_id ? styles.live : styles.future}>{currentTracking.data?.driver_id ? "● السائق متجه إلى المصدر" : "○ بانتظار قبول سائق"}</Text><Text style={styles.future}>○ استلام رمز التسليم</Text></View><Action title="لدي رمز الاستلام" onPress={() => setPage("otp")} /><Action title="العودة للرئيسية" kind="outline" onPress={() => setPage("home")} /></View></View>;

  if (page === "otp") return <View style={styles.fill}><Top title="تأكيد الاستلام" back={() => setPage("track")} /><View style={styles.centered}><View style={styles.otpBadge}><Text style={styles.otpBadgeText}>OTP</Text></View><Text style={styles.centerTitle}>أدخل رمز الاستلام</Text><Text style={styles.centerCopy}>يشاركك السائق الرمز عند وصول الطلب. لا تؤكده قبل الاستلام.</Text><TextInput style={styles.otp} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={4} placeholder="••••" placeholderTextColor="#AAA" textAlign="center" /><Action title="تأكيد الرمز" onPress={() => otp.length === 4 ? Alert.alert("تم التأكيد", "سيطلب من السائق الآن تصوير إثبات التسليم.") : Alert.alert("الرمز غير مكتمل", "أدخل أربعة أرقام.")} /><View style={styles.proofNotice}><Text style={styles.proofNoticeIcon}>▧</Text><View style={styles.flex}><Text style={styles.proofNoticeTitle}>صورة إثبات التسليم</Text><Text style={styles.proofNoticeCopy}>ستظهر هنا فور رفعها من السائق.</Text></View></View></View></View>;

  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.hero}><View><Text style={styles.eyebrow}>جربوع في حماة</Text><Text style={styles.heroTitle}>أهلاً، {name}</Text><Text style={styles.copy}>توصيل قريب وواضح وبالليرة السورية الجديدة.</Text></View><Mark /></View><HamaMap compact source={source} destination={destination} routePath={route?.path} readOnly /><View style={styles.space}><Heading eyebrow="الخدمة متاحة" title="إلى أين نوصلك اليوم؟" /><Action title="إنشاء طلب توصيل" onPress={() => setPage("order")} /><View style={styles.note}><Text style={styles.noteIcon}>↗</Text><View style={styles.flex}><Text style={styles.noteTitle}>اختر نقاطك بحرية داخل حماة</Text><Text style={styles.noteCopy}>اضغط الخريطة لوضع دبوس الاستلام ودبوس التسليم ضمن دائرة ٧ كم.</Text></View></View><Heading eyebrow="آخر الطلبات" title="لا توجد طلبات نشطة" aside="عرض السجل" /><View style={styles.empty}><Text style={styles.emptyText}>ستظهر حالة طلبك وتفاصيل السفير هنا فور التأكيد.</Text></View></View></ScrollView>;
}

function Driver({ name }: { name: string }) {
  const [page, setPage] = useState<DriverPage>("home");
  const [personal, setPersonal] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [livePoint, setLivePoint] = useState<MapPoint | null>(null);
  const [gpsQuality, setGpsQuality] = useState("بانتظار إشارة GPS عالية الدقة");
  const [activeOrder, setActiveOrder] = useState<DriverOrderPreview | null>(null);
  const updateLocation = trpc.jarbou3.updateDriverLocation.useMutation();
  const availableOrders = trpc.jarbou3.availableDriverOrders.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: Boolean(accessToken), refetchInterval: 8_000 });
  const acceptOrder = trpc.jarbou3.acceptOrder.useMutation({ onSuccess: (_result, variables) => { const order = (availableOrders.data as DriverOrderPreview[] | undefined)?.find((item) => item.id === variables.orderId) ?? null; setActiveOrder(order); setPage("drive"); }, onError: (error) => Alert.alert("تعذر قبول الطلب", error.message) });
  const declineOrder = trpc.jarbou3.declineOrder.useMutation({ onSuccess: () => { availableOrders.refetch(); Alert.alert("تم رفض العرض", "لن يظهر هذا الطلب لك مجدداً، وسيبقى متاحاً لبقية السفراء."); }, onError: (error) => Alert.alert("تعذر رفض الطلب", error.message) });
  const camera = async (which: "personal" | "identity" | "proof") => { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return Alert.alert("إذن الكاميرا مطلوب", "يلزم الإذن لالتقاط الصور المطلوبة."); const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 }); if (result.canceled) return; const uri = result.assets[0].uri; if (which === "personal") setPersonal(uri); if (which === "identity") setIdentity(uri); if (which === "proof") setProof(uri); };

  useEffect(() => { jarbou3Session.getAccessToken().then(setAccessToken); }, []);
  useEffect(() => {
    if (page !== "drive" || !accessToken) return;
    let active = true;
    let remove: (() => void) | undefined;
    let backgroundStarted = false;
    startJarbou3BackgroundTracking().then((status) => {
      if (!active) return;
      backgroundStarted = status === "started";
      setGpsQuality(status === "started" ? "تتبع الرحلة بالخلفية نشط" : status === "unavailable" ? "تتبع الخلفية يحتاج بناء تطبيق على جهاز فعلي" : status === "background_denied" ? "اسمح بتتبع الموقع دائماً أثناء الرحلة" : status === "services_disabled" ? "فعّل خدمات GPS لاستمرار التتبع" : "يلزم السماح بالموقع لبدء التتبع");
    }).catch(() => { if (active) setGpsQuality("تعذر بدء التتبع الخلفي؛ سيستمر التحديث أثناء فتح التطبيق"); });
    watchHamaLocation((point) => {
      if (!active) return;
      setLivePoint(point);
      if (!backgroundStarted) updateLocation.mutate({ accessToken, location: point });
    }, (quality) => setGpsQuality(quality === "good" ? "GPS عالي الدقة متصل" : quality === "poor_accuracy" ? "إشارة GPS ضعيفة؛ لا نرسل قراءة غير دقيقة" : quality === "mocked" ? "تم رفض موقع غير موثوق" : quality === "unrealistic_jump" ? "تم رفض قفزة موقع غير واقعية" : "الموقع خارج نطاق حماة")).then((subscription) => { remove = () => subscription.remove(); }).catch(() => Alert.alert("تعذر مشاركة الموقع", "فعّل خدمات الموقع واسمح بالتحديد أثناء استخدام التطبيق لمتابعة الرحلة داخل حماة."));
    return () => { active = false; remove?.(); stopJarbou3BackgroundTracking().catch(() => undefined); };
  }, [page, accessToken]);

  if (page === "verify") return <ScrollView contentContainerStyle={styles.scroll}><Top title="تفعيل السائق" back={() => setPage("home")} /><View style={styles.space}><Tag>خطوة أمان مطلوبة</Tag><Heading title="وثّق ملفك قبل القيادة" /><Text style={styles.copyRight}>تُراجع الصور من الإدارة، ولا يراها أي سائق آخر أو عميل.</Text><Upload title="صورة شخصية" detail={personal ? "تم الالتقاط" : "التقط صورة واضحة للوجه"} uri={personal} onPress={() => camera("personal")} /><Upload title="صورة الهوية" detail={identity ? "تم الالتقاط" : "تُخزّن في مساحة خاصة"} uri={identity} onPress={() => camera("identity")} /><Text style={styles.label}>كود التفعيل من الإدارة</Text><TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="أدخل الكود" placeholderTextColor="#AAA" keyboardType="number-pad" textAlign="center" /><Action title="تأكيد التفعيل" onPress={() => !personal || !identity || code.length < 4 ? Alert.alert("بانتظار التفعيل", "ارفع الوثيقتين ثم أدخل كود التفعيل من الإدارة.") : (setPage("home"), Alert.alert("تم التفعيل", "أصبحت جاهزاً لرؤية الطلبات القريبة."))} /></View></ScrollView>;

  if (page === "drive") return <View style={styles.drive}><View style={styles.split}><Tag status>رحلة نشطة</Tag><Text style={styles.driveNumber}>#{activeOrder?.id.slice(0, 6) ?? "—"}</Text></View><HamaMap compact source={activeOrder ? { latitude: Number(activeOrder.source_lat), longitude: Number(activeOrder.source_lng) } : null} destination={activeOrder ? { latitude: Number(activeOrder.destination_lat), longitude: Number(activeOrder.destination_lng) } : null} driverLocation={livePoint} readOnly /><View><Text style={styles.driveLabel}>الشارع التالي</Text><Text style={styles.street}>نقطة الاستلام</Text><Text style={styles.distance}>{activeOrder ? (activeOrder.distance_m / 1000).toFixed(1) : "—"}</Text><Text style={styles.distanceLabel}>كم للرحلة</Text><View style={styles.progress}><View style={styles.progressFill} /></View><Text style={styles.driveHint}>{livePoint ? "يُرسل موقعك الحي كل ٥ ثوانٍ إلى العميل المعيّن." : "اسمح بالموقع لتحديث العميل أثناء الرحلة."}</Text><Text style={styles.gpsQuality}>{gpsQuality}</Text></View><View style={styles.driveBottom}><View style={styles.utilityRow}><Pressable onPress={() => Alert.alert("اتصال", "سيُفتح اتصال العميل عند ربط أرقام الخدمة.")} style={styles.utility}><Text style={styles.utilityText}>اتصال</Text></Pressable><Pressable onPress={() => Alert.alert("دردشة", "ستظهر محادثة الطلب النصية هنا.")} style={styles.utility}><Text style={styles.utilityText}>دردشة</Text></Pressable></View><Action title="تم التوصيل" kind="dark" onPress={() => setPage("deliver")} /></View></View>;

  if (page === "deliver") return <ScrollView contentContainerStyle={styles.scroll}><Top title="إتمام التسليم" back={() => setPage("drive")} /><View style={styles.space}><DeliveryStep number="١" title="تحقق من رمز العميل" detail="لا تلتقط الصورة قبل مطابقة الرمز." /><TextInput style={styles.input} value={otp} onChangeText={setOtp} maxLength={4} keyboardType="number-pad" placeholder="رمز من ٤ أرقام" placeholderTextColor="#AAA" textAlign="center" /><DeliveryStep number="٢" title="صورة عند الباب" detail="تُرسل للعميل كإثبات التسليم فقط." /><Pressable onPress={() => camera("proof")} style={styles.cameraBox}>{proof ? <Image source={{ uri: proof }} style={styles.photo} contentFit="cover" /> : <><Text style={styles.cameraIcon}>◉</Text><Text style={styles.cameraText}>التقط صورة إثبات التسليم</Text></>}</Pressable><Action title="تأكيد التسليم ورفع الصورة" onPress={() => otp.length !== 4 || !proof ? Alert.alert("ينقصك إجراء", "تحقق من الرمز والتقط صورة الإثبات.") : (setPage("home"), Alert.alert("تم التسليم", "أُضيف الطلب إلى ورديتك اليوم."))} /></View></ScrollView>;

  const nextOrder = (availableOrders.data as DriverOrderPreview[] | undefined)?.[0];
  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.driverHero}><View><Text style={styles.driverEyebrow}>وضع السفير</Text><Text style={styles.driverHeroTitle}>أهلاً، {name || "سفير جربوع"}</Text><Text style={styles.driverHeroCopy}>طلبات واضحة وأزرار كبيرة أثناء القيادة.</Text></View><Tag status>متصل</Tag></View><HamaMap compact driverLocation={livePoint} readOnly /><View style={styles.space}><View style={styles.setup}><View style={styles.flex}><Text style={styles.setupTitle}>ملف الاعتماد</Text><Text style={styles.setupCopy}>ارفع الوثائق ثم انتظر مراجعة الإدارة.</Text></View><Action title="الوثائق" kind="outline" onPress={() => setPage("verify")} /></View><Heading eyebrow="طلبات قريبة" title={nextOrder ? "طلب فعلي متاح" : "لا توجد طلبات متاحة"} />{nextOrder ? <View style={styles.orderCard}><View style={styles.split}><Tag>{(nextOrder.distance_m / 1000).toFixed(1)} كم</Tag><Text style={styles.orderPrice}>{formatSyp(nextOrder.estimated_price)}</Text></View><Text style={styles.orderRoute}>نقطة استلام ← وجهة العميل</Text><Text style={styles.copyRight}>{nextOrder.payment_method === "cash" ? "نقدي" : "شام كاش"} · طلب محفوظ وجاهز للتعيين</Text><Action title={acceptOrder.isPending ? "جارٍ تعيينك…" : "قبول الطلب وبدء الرحلة"} onPress={() => accessToken && acceptOrder.mutate({ accessToken, orderId: nextOrder.id })} /><Action title={declineOrder.isPending ? "جارٍ الرفض…" : "رفض هذا الطلب"} kind="outline" onPress={() => accessToken && declineOrder.mutate({ accessToken, orderId: nextOrder.id })} /></View> : <View style={styles.empty}><Text style={styles.emptyText}>{availableOrders.isLoading ? "جارٍ تحميل الطلبات القريبة…" : "ستظهر هنا الطلبات التي أنشأها العملاء بعد موافقة الإدارة على تفعيلك."}</Text></View>}<View style={styles.shift}><Text style={styles.shiftTitle}>وردية اليوم</Text><Text style={styles.shiftValue}>{formatSyp(0)}</Text><Text style={styles.setupCopy}>تظهر التسوية عند إغلاق الوردية من الإدارة.</Text></View></View></ScrollView>;
}

function Upload({ title, detail, uri, onPress }: { title: string; detail: string; uri: string | null; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.upload}>{uri ? <Image source={{ uri }} style={styles.uploadPhoto} contentFit="cover" /> : <View style={styles.uploadPlaceholder}><Text style={styles.uploadSymbol}>＋</Text></View>}<View style={styles.flex}><Text style={styles.uploadTitle}>{title}</Text><Text style={styles.uploadDetail}>{detail}</Text></View></Pressable>; }
function DeliveryStep({ number, title, detail }: { number: string; title: string; detail: string }) { return <View style={styles.deliveryStep}><Text style={styles.stepNumber}>{number}</Text><View><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDetail}>{detail}</Text></View></View>; }

function Top({ title, back }: { title: string; back: () => void }) { return <View style={styles.top}><Pressable onPress={back} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.topTitle}>{title}</Text><View style={styles.backBlank} /></View>; }

export function Jarbou3App() {
  const [role, setRole] = useState<Role>("customer");
  const [stage, setStage] = useState<"loading" | "choose" | "form" | "waiting" | "code" | "signin" | "workspace">("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState<"motorcycle" | "electric_scooter">("motorcycle");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [codeClock, setCodeClock] = useState(Date.now());
  const [savedToken, setSavedToken] = useState<string | null | undefined>(undefined);
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    jarbou3Session.getAccessToken().then(setSavedToken);
    jarbou3Session.getOnboarding().then((saved) => {
      if (!saved) return;
      setRole(saved.role);
      setName(saved.name);
      setPhone(saved.phone);
      setRequestId(saved.requestId);
      setCodeExpiresAt(saved.codeExpiresAt);
      setStage(saved.stage);
    });
  }, []);
  const savedSession = trpc.jarbou3.sessionProfile.useQuery({ accessToken: savedToken ?? "pending-session-token-000" }, { enabled: Boolean(savedToken), retry: false });
  const onboardingStatus = trpc.jarbou3.onboardingStatus.useQuery({ requestId: requestId ?? "00000000-0000-0000-0000-000000000000", phone }, { enabled: Boolean(requestId) && Boolean(phone) && (stage === "waiting" || stage === "code"), refetchInterval: stage === "waiting" ? 4_000 : false, retry: false });
  useEffect(() => {
    if (savedToken === undefined) return;
    if (!savedToken) { setStage("choose"); return; }
    if (savedSession.data) {
      setRole(savedSession.data.role);
      setWorkspaceName(savedSession.data.name);
      setStage("workspace");
    } else if (savedSession.isError) {
      jarbou3Session.clear().finally(() => { setSavedToken(null); setStage("choose"); });
    }
  }, [savedToken, savedSession.data, savedSession.isError]);
  useEffect(() => {
    const next = onboardingStatus.data;
    if (!next) return;
    if (next.codeExpiresAt) setCodeExpiresAt(next.codeExpiresAt);
    if (next.status === "code_sent" && stage === "waiting") setStage("code");
  }, [onboardingStatus.data, stage]);
  useEffect(() => {
    if (stage !== "code" || !codeExpiresAt) return;
    setCodeClock(Date.now());
    const interval = setInterval(() => setCodeClock(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [stage, codeExpiresAt]);

  useEffect(() => {
    if (stage === "form" || stage === "waiting" || stage === "code") {
      jarbou3Session.saveOnboarding({ role, stage, name, phone, requestId, codeExpiresAt }).catch(() => undefined);
    }
  }, [role, stage, name, phone, requestId, codeExpiresAt]);

  const remainingSeconds = codeExpiresAt ? Math.max(0, Math.ceil((new Date(codeExpiresAt).getTime() - codeClock) / 1_000)) : null;
  const codeExpired = remainingSeconds === 0;
  const codeTimerLabel = remainingSeconds == null ? "بانتظار إرسال الرمز" : codeExpired ? "انتهت صلاحية الرمز" : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")} متبقية`;

  const submitOnboarding = trpc.jarbou3.submitOnboarding.useMutation({
    onSuccess: async (result) => {
      setRequestId(result.requestId);
      setRole(result.requestedRole);
      setCodeExpiresAt(result.codeExpiresAt ?? null);
      setStage(result.status === "code_sent" ? "code" : "waiting");
    },
    onError: (error) => Alert.alert("تعذر إرسال الطلب", error.message === "ONBOARDING_RATE_LIMITED" ? "تم إيقاف المحاولات مؤقتاً لحماية الحساب. حاول بعد قليل." : "راجع البيانات ثم حاول مرة أخرى."),
  });
  const verifyOnboarding = trpc.jarbou3.verifyOnboardingCode.useMutation({
    onSuccess: async (result) => {
      await jarbou3Session.save(result.accessToken, result.refreshToken);
      setSavedToken(result.accessToken);
      setRole(result.user.role);
      setWorkspaceName(result.user.name);
      setVerificationCode("");
      await jarbou3Session.clearOnboarding();
      setStage("workspace");
      Alert.alert("تم التحقق", `أهلاً ${result.user.name}`);
    },
    onError: (error) => Alert.alert("تعذر التحقق", error.message === "INVALID_OR_EXPIRED_CODE" ? "الرمز غير صحيح أو انتهت صلاحيته. راجع المدير لطلب رمز جديد." : "تعذر التحقق الآن. حاول لاحقاً."),
  });
  const signIn = trpc.jarbou3.signIn.useMutation({
    onSuccess: async (result) => {
      await jarbou3Session.save(result.accessToken, result.refreshToken);
      setSavedToken(result.accessToken);
      setRole(result.user.role);
      setWorkspaceName(result.user.name);
      setStage("workspace");
    },
    onError: () => Alert.alert("تعذر الدخول", "تحقق من الرقم وكلمة المرور ثم أعد المحاولة."),
  });
  const submitForm = () => {
    if (!/^\+?[0-9]{8,16}$/.test(phone) || name.trim().length < 2) {
      Alert.alert("تحقق من البيانات", "أدخل اسماً من حرفين على الأقل ورقم WhatsApp بصيغة دولية صحيحة.");
      return;
    }
    submitOnboarding.mutate({ fullName: name.trim(), phone, requestedRole: role, vehicleType: role === "driver" ? vehicleType : undefined });
  };
  const verifyCode = () => {
    if (codeExpired) return Alert.alert("انتهت صلاحية الرمز", "اطلب من المدير إنشاء رمز WhatsApp جديد ثم تحقق منه." );
    if (!requestId || verificationCode.replace(/\D/g, "").length !== 6) return Alert.alert("الرمز غير مكتمل", "أدخل رمز التحقق المكوّن من ستة أرقام.");
    if (accountPassword.length < 8 || accountPassword !== passwordConfirm) return Alert.alert("تحقق من كلمة المرور", "اكتب كلمة مرور من ثمانية أحرف على الأقل وأعد كتابتها مطابقة.");
    verifyOnboarding.mutate({ requestId, phone, code: verificationCode.replace(/\D/g, ""), password: accountPassword });
  };
  const submitSignIn = () => {
    if (!/^\+?[0-9]{8,16}$/.test(phone) || accountPassword.length < 8) return Alert.alert("تحقق من البيانات", "أدخل رقم WhatsApp وكلمة المرور.");
    signIn.mutate({ phone, password: accountPassword });
  };
  const logout = async () => { await Promise.all([jarbou3Session.clear(), jarbou3Session.clearOnboarding()]); setSavedToken(null); setRequestId(null); setVerificationCode(""); setCodeExpiresAt(null); setName(""); setPhone(""); setStage("choose"); };

  if (stage === "loading") return <View style={styles.onboardingRoot}><ActivityIndicator color={gray} size="large" /></View>;
  if (stage === "workspace") return <View style={styles.root}><View style={styles.accessBar}><Text style={styles.accessCopy}>{role === "driver" ? "مساحة السفير" : "مساحة العميل"} · جلسة محمية على هذا الجهاز</Text><Pressable onPress={logout} style={styles.accessButton}><Text style={styles.accessButtonText}>تسجيل الخروج</Text></Pressable></View>{role === "customer" ? <Customer name={workspaceName} /> : <Driver name={workspaceName} />}</View>;
  if (stage === "choose") return <ScrollView contentContainerStyle={styles.onboardingScroll}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>اختر نوع الحساب</Text><Pressable onPress={() => { setRole("customer"); setStage("form"); }} style={styles.roleChoice}><Text style={styles.roleChoiceTitle}>أنا عميل</Text></Pressable><Pressable onPress={() => { setRole("driver"); setStage("form"); }} style={[styles.roleChoice, styles.roleChoiceDark]}><Text style={styles.roleChoiceTitleDark}>أنا سفير</Text></Pressable></View></ScrollView>;
  if (stage === "waiting") return <View style={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>تم إرسال طلبك</Text><Text style={styles.onboardingCopy}>يراجع المدير بياناتك ثم يرسل رمزاً من ستة أرقام إلى WhatsApp على الرقم المسجّل.</Text><Tag status>بانتظار مراجعة الإدارة</Tag><View style={styles.verificationGuide}><Text style={styles.verificationGuideTitle}>ماذا سيحدث الآن؟</Text><Text style={styles.verificationGuideText}>١. أبقِ رقم WhatsApp متاحاً.</Text><Text style={styles.verificationGuideText}>٢. ستنتقل تلقائياً إلى إدخال الرمز عند إرساله من الإدارة.</Text><Text style={styles.verificationGuideText}>٣. لا تشارك الرمز مع أي شخص؛ يستخدم للدخول إلى حسابك فقط.</Text></View><Action title={onboardingStatus.isFetching ? "جارٍ التحقق…" : "تحقق من وصول الرمز"} onPress={() => onboardingStatus.refetch()} /><Pressable onPress={() => setStage("form")} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>تعديل البيانات</Text></Pressable></View></View>;
  if (stage === "code") return <View style={styles.onboardingRoot}><View style={styles.onboardingCard}><Mark /><Text style={styles.onboardingTitle}>أدخل رمز التحقق</Text><Text style={styles.onboardingCopy}>أدخل الرمز الذي وصلك ثم اختر كلمة مرور لحسابك.</Text><View style={[styles.verificationTimer, codeExpired && styles.verificationTimerExpired]}><Text style={styles.verificationTimerLabel}>{codeExpired ? "الرمز غير صالح الآن" : "صلاحية الرمز"}</Text><Text style={[styles.verificationTimerValue, codeExpired && styles.verificationTimerValueExpired]}>{codeTimerLabel}</Text></View><TextInput value={verificationCode} onChangeText={(value) => setVerificationCode(value.replace(/\D/g, ""))} autoFocus keyboardType="number-pad" maxLength={6} placeholder="••••••" placeholderTextColor="#A0A0A0" style={styles.onboardingOtp} textAlign="center" editable={!codeExpired} /><TextInput value={accountPassword} onChangeText={setAccountPassword} placeholder="كلمة المرور" placeholderTextColor="#999" secureTextEntry style={styles.authInput} textAlign="right" /><TextInput value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="أعد كتابة كلمة المرور" placeholderTextColor="#999" secureTextEntry style={styles.authInput} textAlign="right" /><Pressable onPress={verifyCode} disabled={verifyOnboarding.isPending || codeExpired} style={[styles.authAction, (verifyOnboarding.isPending || codeExpired) && styles.authActionDisabled]}>{verifyOnboarding.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>{codeExpired ? "اطلب رمزاً جديداً من المدير" : "تحقق والدخول"}</Text>}</Pressable><Pressable onPress={() => setStage("waiting")} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>لم يصل الرمز بعد؟ تحقق من حالته</Text></Pressable></View></View>;
  if (stage === "signin") return <ScrollView contentContainerStyle={styles.onboardingScroll}><View style={styles.onboardingCard}><Top title={role === "driver" ? "دخول سفير" : "دخول عميل"} back={() => setStage("choose")} /><Text style={styles.onboardingTitle}>تسجيل الدخول</Text><TextInput value={phone} onChangeText={setPhone} placeholder="رقم WhatsApp" placeholderTextColor="#999" keyboardType="phone-pad" style={styles.authInput} textAlign="right" /><TextInput value={accountPassword} onChangeText={setAccountPassword} placeholder="كلمة المرور" placeholderTextColor="#999" secureTextEntry style={styles.authInput} textAlign="right" /><Pressable onPress={submitSignIn} disabled={signIn.isPending} style={[styles.authAction, signIn.isPending && styles.authActionDisabled]}>{signIn.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>تسجيل الدخول</Text>}</Pressable></View></ScrollView>;
  return <ScrollView contentContainerStyle={styles.onboardingScroll}><View style={styles.onboardingCard}><Top title={role === "driver" ? "تسجيل سفير" : "تسجيل عميل"} back={() => setStage("choose")} /><Text style={styles.onboardingTitle}>{role === "driver" ? "بيانات السفير" : "بيانات العميل"}</Text><Text style={styles.onboardingCopy}>{role === "driver" ? "أدخل بياناتك لإرسال طلبك للمراجعة." : "أدخل بياناتك لإكمال التسجيل."}</Text><TextInput value={name} onChangeText={setName} placeholder="الاسم الكامل" placeholderTextColor="#999" style={styles.authInput} textAlign="right" /><TextInput value={phone} onChangeText={setPhone} placeholder="رقم WhatsApp، مثال +9639…" placeholderTextColor="#999" keyboardType="phone-pad" style={styles.authInput} textAlign="right" />{role === "driver" ? <View style={styles.vehicleChoices}>{([{ key: "motorcycle", label: "دراجة نارية" }, { key: "electric_scooter", label: "دراجة كهربائية" }] as const).map((vehicle) => <Pressable key={vehicle.key} onPress={() => setVehicleType(vehicle.key)} style={[styles.vehicleChoice, vehicleType === vehicle.key && styles.vehicleChoiceSelected]}><Text style={styles.vehicleChoiceText}>{vehicle.label}</Text></Pressable>)}</View> : null}<Pressable onPress={submitForm} disabled={submitOnboarding.isPending} style={[styles.authAction, submitOnboarding.isPending && styles.authActionDisabled]}>{submitOnboarding.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>إنشاء حساب</Text>}</Pressable><Pressable onPress={() => setStage("signin")} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>لدي حساب بالفعل</Text></Pressable></View></ScrollView>;
}

const styles = StyleSheet.create({
  mapModeRow: { flexDirection: "row-reverse", gap: 8, marginHorizontal: 16, marginTop: 12 }, mapMode: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: "#D1D1D1", borderRadius: 13, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }, mapModeActive: { backgroundColor: gray, borderColor: gray }, mapModeText: { color: gray, fontSize: 11, fontWeight: "900" }, mapModeTextActive: { color: "#FFFFFF" }, mapHint: { color: "#727272", fontSize: 11, lineHeight: 17, textAlign: "right" }, addressSearch: { marginHorizontal: 16, marginTop: 12, flexDirection: "row-reverse", gap: 8, alignItems: "center" }, addressSearchInput: { flex: 1, minHeight: 48, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#D8D8D8", color: dark, paddingHorizontal: 13, fontWeight: "700", fontSize: 12 }, addressSearchButton: { minHeight: 48, minWidth: 62, backgroundColor: gray, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 11 }, addressSearchButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, searchFilters: { flexDirection: "row-reverse", gap: 7, marginHorizontal: 16, marginTop: 8 }, searchFilter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: "#E7E7E7" }, searchFilterActive: { backgroundColor: gray }, searchFilterText: { color: gray, fontSize: 11, fontWeight: "900" }, searchFilterTextActive: { color: "#FFFFFF" }, addressResults: { marginHorizontal: 16, marginTop: 7, gap: 6 }, addressResult: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E0E0E0" }, addressResultText: { flex: 1, color: dark, fontSize: 11, textAlign: "right", lineHeight: 16, fontWeight: "700" }, resultKind: { color: "#767676", fontSize: 9, fontWeight: "900", backgroundColor: "#EEEEEE", borderRadius: 7, paddingHorizontal: 6, paddingVertical: 4 }, addressResultAction: { color: "#2F7A62", fontSize: 10, fontWeight: "900" },
  root: { flex: 1, backgroundColor: "#F5F5F5" }, onboardingRoot: { flex: 1, backgroundColor: "#F5F5F5", justifyContent: "center", padding: 18 }, onboardingScroll: { flexGrow: 1, justifyContent: "center", padding: 18 }, onboardingCard: { width: "100%", maxWidth: 470, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 28, padding: 22, gap: 13, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 }, onboardingTitle: { color: dark, fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 4 }, onboardingCopy: { color: "#737373", fontSize: 13, lineHeight: 21, textAlign: "right" }, onboardingNote: { color: "#7A7A7A", fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 2 }, verificationGuide: { backgroundColor: "#F2F2F2", borderRadius: 16, padding: 13, gap: 5 }, verificationGuideTitle: { color: dark, fontSize: 12, fontWeight: "900", textAlign: "right", marginBottom: 2 }, verificationGuideText: { color: "#666666", fontSize: 11, lineHeight: 18, textAlign: "right" }, verificationTimer: { backgroundColor: "#E7F3EC", borderColor: "#B7DEC8", borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, verificationTimerExpired: { backgroundColor: "#FBE9E8", borderColor: "#E6BBB7" }, verificationTimerLabel: { color: "#2F7A62", fontSize: 11, fontWeight: "900", textAlign: "right" }, verificationTimerValue: { color: "#276149", fontSize: 17, fontWeight: "900" }, verificationTimerValueExpired: { color: "#B42318" }, roleChoice: { backgroundColor: "#F2F2F2", padding: 16, borderRadius: 18, gap: 4 }, roleChoiceDark: { backgroundColor: "#292929" }, roleChoiceTitle: { color: dark, fontSize: 17, fontWeight: "900", textAlign: "right" }, roleChoiceTitleDark: { color: "#FFFFFF", fontSize: 17, fontWeight: "900", textAlign: "right" }, roleChoiceCopy: { color: "#707070", fontSize: 11, textAlign: "right" }, roleChoiceCopyDark: { color: "#D2D2D2", fontSize: 11, textAlign: "right" }, onboardingOtp: { minHeight: 60, backgroundColor: "#F5F5F5", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 18, paddingHorizontal: 14, color: dark, fontSize: 26, letterSpacing: 8, fontWeight: "900" }, vehicleChoices: { flexDirection: "row-reverse", gap: 9 }, vehicleChoice: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#D8D8D8", justifyContent: "center", alignItems: "center", backgroundColor: "#FAFAFA" }, vehicleChoiceSelected: { borderColor: gray, borderWidth: 2, backgroundColor: "#E9E9E9" }, vehicleChoiceText: { color: gray, fontSize: 11, fontWeight: "900" }, scroll: { paddingBottom: 30 }, fill: { flex: 1 }, flex: { flex: 1 }, pressed: { opacity: 0.78, transform: [{ scale: 0.986 }] }, space: { paddingHorizontal: 16, paddingTop: 16, gap: 14 }, roleSwitch: { flexDirection: "row-reverse", gap: 4, marginHorizontal: 16, marginTop: 8, marginBottom: 8, backgroundColor: "#E4E4E4", padding: 4, borderRadius: 14 }, role: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" }, roleSelected: { backgroundColor: "#FFF" }, roleText: { color: "#747474", fontSize: 13, fontWeight: "800" }, roleTextSelected: { color: dark },
  accessBar: { marginHorizontal: 16, marginBottom: 2, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 10 }, accessCopy: { color: "#737373", fontSize: 10, fontWeight: "700", textAlign: "right", flex: 1 }, accessButton: { backgroundColor: "#FFFFFF", borderColor: "#D7D7D7", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, accessButtonText: { color: "#4A4A4A", fontSize: 10, fontWeight: "900" }, modalBackdrop: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }, authSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 12 }, authTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right" }, authCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "right", marginBottom: 4 }, authInput: { minHeight: 52, borderRadius: 15, backgroundColor: "#F5F5F5", borderColor: "#DDDDDD", borderWidth: 1, paddingHorizontal: 14, color: dark, fontSize: 14, fontWeight: "700" }, authAction: { minHeight: 53, borderRadius: 16, backgroundColor: gray, alignItems: "center", justifyContent: "center" }, authActionDisabled: { opacity: 0.65 }, modeSwitch: { paddingVertical: 8, alignItems: "center" }, modeSwitchText: { color: gray, fontSize: 12, fontWeight: "900" },
  action: { minHeight: 53, borderRadius: 16, backgroundColor: gray, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 }, actionDark: { backgroundColor: "#FFF" }, actionOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#C9C9C9" }, actionText: { color: "#FFF", fontSize: 14, fontWeight: "900", textAlign: "center" }, actionOutlineText: { color: gray }, tag: { backgroundColor: "#E9E9E9", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, alignSelf: "flex-start" }, tagStatus: { backgroundColor: "#DDF2E9" }, tagText: { color: "#555", fontSize: 10, fontWeight: "900" }, tagStatusText: { color: "#276149" },
  mark: { width: 56, height: 56, borderRadius: 18, overflow: "hidden", backgroundColor: "#FFF" }, markSmall: { width: 34, height: 34, borderRadius: 11 }, markImage: { width: "100%", height: "100%" }, hero: { marginHorizontal: 16, padding: 19, borderRadius: 24, backgroundColor: "#FFF", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, heroTitle: { color: dark, fontSize: 24, fontWeight: "900", textAlign: "right" }, eyebrow: { color: "#747474", fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 4 }, copy: { color: "#737373", textAlign: "right", fontSize: 12, lineHeight: 19, marginTop: 4 }, copyRight: { color: "#737373", textAlign: "right", fontSize: 12, lineHeight: 19 },
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" }, mapCompact: { height: 188 }, nativeMap: { flex: 1 }, mapRoad: { position: "absolute", height: 4, left: -30, right: -30, backgroundColor: "#FFF", opacity: 0.75 }, mapName: { position: "absolute", top: 18, left: 20, color: "#747474", fontSize: 18, fontWeight: "900" }, dot: { position: "absolute", width: 12, height: 12, borderRadius: 8, borderWidth: 2, borderColor: "#FFF", backgroundColor: "#888" }, dotTarget: { width: 20, height: 20, borderRadius: 10, right: "12%", top: "20%", backgroundColor: "#2F7A62" }, mapDriver: { position: "absolute", top: "37%", left: "54%", borderWidth: 3, borderColor: "#FFF", borderRadius: 14 }, mapBadge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }, mapBadgeText: { color: gray, fontSize: 11, fontWeight: "900" },
  headingRow: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" }, heading: { color: dark, fontSize: 19, fontWeight: "900", textAlign: "right" }, aside: { color: "#737373", fontSize: 11, fontWeight: "800" }, note: { backgroundColor: "#E7E7E7", borderRadius: 18, padding: 14, flexDirection: "row-reverse", gap: 10, alignItems: "center" }, noteIcon: { color: "#FFF", backgroundColor: gray, width: 35, height: 35, borderRadius: 11, overflow: "hidden", textAlign: "center", textAlignVertical: "center", fontSize: 19, fontWeight: "900" }, noteTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, noteCopy: { color: "#737373", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 2 }, empty: { backgroundColor: "#FFF", borderRadius: 18, borderColor: "#D8D8D8", borderWidth: 1, borderStyle: "dashed", padding: 16 }, emptyText: { color: "#737373", fontSize: 12, textAlign: "right" },
  top: { height: 60, paddingHorizontal: 16, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, back: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" }, backText: { color: dark, fontSize: 30, marginTop: -6 }, backBlank: { width: 38 }, topTitle: { color: dark, fontSize: 17, fontWeight: "900" }, card: { backgroundColor: "#FFF", margin: 16, padding: 17, borderRadius: 23, gap: 11 }, label: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 3 }, favoriteSection: { backgroundColor: "#F4F4F4", borderRadius: 16, padding: 12, gap: 9 }, favoriteTitle: { color: dark, fontSize: 12, fontWeight: "900", textAlign: "right" }, favoriteRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, favoriteChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", borderColor: "#DADADA", borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 9, maxWidth: "100%" }, favoriteChipText: { color: gray, fontSize: 10, fontWeight: "900", maxWidth: 150 }, favoriteDelete: { color: "#B42318", fontSize: 16, lineHeight: 16, fontWeight: "900" }, favoriteEmpty: { color: "#767676", fontSize: 10, lineHeight: 16, textAlign: "right" }, saveFavoriteRow: { flexDirection: "row-reverse", gap: 7 }, favoriteInput: { flex: 1, minHeight: 42, backgroundColor: "#FFFFFF", borderRadius: 11, borderWidth: 1, borderColor: "#D9D9D9", paddingHorizontal: 10, color: dark, fontSize: 11, fontWeight: "700" }, saveFavoriteButton: { minWidth: 58, minHeight: 42, backgroundColor: gray, borderRadius: 11, alignItems: "center", justifyContent: "center" }, saveFavoriteButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, stops: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, stop: { borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, stopSelected: { borderColor: gray, backgroundColor: gray }, stopText: { color: "#717171", fontSize: 11, fontWeight: "800" }, stopTextSelected: { color: "#FFF" }, quote: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F0F0F0", borderRadius: 16, padding: 13 }, quoteLabel: { color: "#747474", fontSize: 10, fontWeight: "800", textAlign: "right" }, quoteValue: { color: dark, fontSize: 17, fontWeight: "900", marginTop: 3, textAlign: "right" }, quoteValueSmall: { color: gray, fontSize: 12, fontWeight: "800", marginTop: 3, textAlign: "right" }, quoteLine: { width: 1, height: 35, backgroundColor: "#D3D3D3" }, paymentRow: { flexDirection: "row-reverse", gap: 9 }, payment: { flex: 1, minHeight: 54, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 15 }, paymentSelected: { borderWidth: 2, borderColor: gray, backgroundColor: "#F1F1F1" }, paymentText: { color: gray, fontSize: 12, fontWeight: "900" },
  trackSheet: { flex: 1, padding: 19, paddingTop: 12, backgroundColor: "#FFF", marginTop: -18, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12 }, acceptedNotice: { position: "absolute", top: 242, left: 24, right: 24, zIndex: 5, backgroundColor: "#2F7A62", padding: 13, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 }, acceptedNoticeTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", textAlign: "right" }, acceptedNoticeCopy: { color: "#E3F5ED", fontSize: 11, marginTop: 3, textAlign: "right" }, handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D8D8D8", alignSelf: "center" }, split: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, muted: { color: "#737373", fontSize: 11, fontWeight: "700" }, trackTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right" }, driverBox: { backgroundColor: "#F2F2F2", borderRadius: 18, padding: 12, flexDirection: "row-reverse", gap: 10, alignItems: "center" }, avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: gray, alignItems: "center", justifyContent: "center" }, avatarText: { color: "#FFF", fontSize: 17, fontWeight: "900" }, driverName: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, mutedRight: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, minor: { backgroundColor: "#FFF", borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }, minorText: { color: gray, fontSize: 11, fontWeight: "900" }, timeline: { gap: 7, paddingRight: 6 }, done: { color: "#2F7A62", textAlign: "right", fontSize: 12, fontWeight: "800" }, live: { color: dark, textAlign: "right", fontSize: 12, fontWeight: "900" }, future: { color: "#AAA", textAlign: "right", fontSize: 12, fontWeight: "800" },
  centered: { padding: 28, alignItems: "center", gap: 15 }, otpBadge: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#E9E9E9", borderColor: "#FFF", borderWidth: 8, alignItems: "center", justifyContent: "center" }, otpBadgeText: { color: gray, fontSize: 18, fontWeight: "900" }, centerTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "center" }, centerCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "center" }, otp: { width: "100%", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 17, padding: 15, fontSize: 22, letterSpacing: 8, color: dark, fontWeight: "900" }, proofNotice: { width: "100%", backgroundColor: "#FFF", borderRadius: 17, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 11 }, proofNoticeIcon: { color: "#A6A6A6", fontSize: 28 }, proofNoticeTitle: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right" }, proofNoticeCopy: { color: "#737373", fontSize: 10, textAlign: "right", marginTop: 3 },
  driverHero: { backgroundColor: "#242424", marginHorizontal: 16, padding: 19, borderRadius: 23, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, driverEyebrow: { color: "#B5B5B5", fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 4 }, driverHeroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "right" }, driverHeroCopy: { color: "#CECECE", fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 4 }, setup: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, setupTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, setupCopy: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, orderCard: { backgroundColor: "#FFF", borderRadius: 21, padding: 17, gap: 10 }, orderPrice: { color: dark, fontSize: 17, fontWeight: "900" }, orderRoute: { color: dark, fontSize: 16, fontWeight: "900", textAlign: "right" }, shift: { backgroundColor: "#E5E5E5", borderRadius: 18, padding: 15 }, shiftTitle: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right" }, shiftValue: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 4 }, upload: { minHeight: 83, backgroundColor: "#FFF", borderRadius: 18, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 11 }, uploadPhoto: { width: 57, height: 57, borderRadius: 13 }, uploadPlaceholder: { width: 57, height: 57, borderRadius: 13, backgroundColor: "#EFEFEF", alignItems: "center", justifyContent: "center" }, uploadSymbol: { color: "#777", fontSize: 29 }, uploadTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, uploadDetail: { color: "#737373", fontSize: 10, textAlign: "right", marginTop: 4 }, input: { minHeight: 52, borderRadius: 16, backgroundColor: "#FFF", borderColor: "#D8D8D8", borderWidth: 1, color: dark, fontWeight: "900", fontSize: 16, paddingHorizontal: 13 },
  drive: { flex: 1, backgroundColor: "#171717", padding: 22, justifyContent: "space-between" }, driveNumber: { color: "#A8A8A8", fontSize: 11, fontWeight: "800" }, driveLabel: { color: "#ABABAB", fontSize: 14, textAlign: "right", fontWeight: "800", marginTop: 30 }, street: { color: "#FFF", fontSize: 34, fontWeight: "900", textAlign: "right", marginTop: 3 }, distance: { color: "#FFF", fontSize: 78, lineHeight: 86, fontWeight: "900", textAlign: "center", marginTop: 24 }, distanceLabel: { color: "#C6C6C6", fontSize: 14, textAlign: "center", fontWeight: "800" }, progress: { height: 11, backgroundColor: "#444", borderRadius: 6, overflow: "hidden", marginTop: 24 }, progressFill: { width: "68%", height: "100%", borderRadius: 6, backgroundColor: "#E5E5E5" }, driveHint: { color: "#C6C6C6", fontSize: 12, textAlign: "center", marginTop: 17 }, gpsQuality: { color: "#E2E2E2", fontSize: 10, textAlign: "center", marginTop: 6 }, driveBottom: { gap: 13 }, utilityRow: { flexDirection: "row-reverse", gap: 10 }, utility: { flex: 1, height: 55, borderRadius: 17, borderWidth: 1, borderColor: "#5B5B5B", justifyContent: "center", alignItems: "center" }, utilityText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  deliveryStep: { flexDirection: "row-reverse", alignItems: "center", gap: 11 }, stepNumber: { width: 33, height: 33, borderRadius: 17, backgroundColor: gray, color: "#FFF", fontWeight: "900", textAlign: "center", textAlignVertical: "center" }, stepTitle: { color: dark, fontSize: 14, fontWeight: "900", textAlign: "right" }, stepDetail: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, cameraBox: { height: 174, backgroundColor: "#FFF", borderColor: "#C8C8C8", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 21, overflow: "hidden", justifyContent: "center", alignItems: "center", gap: 6 }, cameraIcon: { fontSize: 34, color: "#777" }, cameraText: { color: gray, fontSize: 12, fontWeight: "900" }, photo: { width: "100%", height: "100%" },
  adminHero: { marginHorizontal: 16, backgroundColor: "#FFF", padding: 18, borderRadius: 23, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, adminTitle: { color: dark, fontSize: 19, fontWeight: "900", textAlign: "right" }, metrics: { margin: 16, marginBottom: 0, flexDirection: "row-reverse", gap: 7 }, metric: { flex: 1, backgroundColor: "#E8E8E8", borderRadius: 15, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" }, metricValue: { color: dark, fontSize: 16, fontWeight: "900", textAlign: "center" }, metricLabel: { color: "#737373", fontSize: 9, fontWeight: "800", marginTop: 4, textAlign: "center" }, task: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, taskAvatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E3E3E3", alignItems: "center", justifyContent: "center" }, taskAvatarText: { color: gray, fontSize: 16, fontWeight: "900" }, taskTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, taskCopy: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, smallAction: { backgroundColor: gray, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 }, smallActionText: { color: "#FFF", fontSize: 10, fontWeight: "900" }, settle: { backgroundColor: "#252525", borderRadius: 20, padding: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, settleLabel: { color: "#BEBEBE", fontSize: 10, fontWeight: "800", textAlign: "right" }, settleValue: { color: "#FFF", fontSize: 21, fontWeight: "900", textAlign: "right", marginTop: 3 }, settleDetail: { color: "#BEBEBE", fontSize: 10, textAlign: "right", marginTop: 3 }, closeButton: { borderWidth: 1, borderColor: "#747474", padding: 9, borderRadius: 11, maxWidth: 88 }, closeText: { color: "#FFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, report: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, pdf: { width: 45, height: 45, borderRadius: 14, backgroundColor: "#E9E9E9", alignItems: "center", justifyContent: "center" }, pdfText: { color: gray, fontSize: 10, fontWeight: "900" }, reportTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, reportCopy: { color: "#737373", fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 3 },
});
