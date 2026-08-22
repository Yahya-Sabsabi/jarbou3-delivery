import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "@/lib/trpc";
import { jarbou3Session } from "@/lib/jarbou3-session";
import { HAMA_CENTER, formatSyp, type MapPoint } from "@/shared/jarbou3";
import { HamaMap } from "@/components/hama-map";
import { getCurrentHamaLocation, watchHamaLocation } from "@/lib/jarbou3-location";
import { getOsrmRoute, type RouteEstimate } from "@/lib/osrm";
import { subscribeToDriverLocation, unsubscribeFromDriverLocation } from "@/lib/jarbou3-realtime";

type Role = "customer" | "driver" | "admin";
type CustomerPage = "home" | "order" | "track" | "otp";
type DriverPage = "home" | "verify" | "drive" | "deliver";

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

function Tag({ children, status = false }: { children: string; status?: boolean }) {
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
  return <View style={styles.roleSwitch}>{(["customer", "driver", "admin"] as Role[]).map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.role, role === option && styles.roleSelected]}><Text style={[styles.roleText, role === option && styles.roleTextSelected]}>{option === "customer" ? "عميل" : option === "driver" ? "سائق" : "إدارة"}</Text></Pressable>)}</View>;
}

function Customer() {
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
  const createOrder = trpc.jarbou3.createOrder.useMutation({ onSuccess: () => setPage("track"), onError: (error) => Alert.alert("تعذر إنشاء الطلب", error.message) });
  const currentTracking = trpc.jarbou3.currentCustomerTracking.useQuery({ accessToken: accessToken ?? "pending-session-token-000" }, { enabled: page === "track" && Boolean(accessToken), refetchInterval: 8_000 });
  const driverLocationQuery = trpc.jarbou3.currentDriverLocation.useQuery({ accessToken: accessToken ?? "pending-session-token-000", driverId: currentTracking.data?.driver_id ?? "00000000-0000-0000-0000-000000000000" }, { enabled: page === "track" && Boolean(accessToken) && Boolean(currentTracking.data?.driver_id), refetchInterval: 5_000 });

  useEffect(() => { jarbou3Session.getAccessToken().then(setAccessToken); }, []);

  useEffect(() => {
    if (!source || !destination) return;
    let active = true;
    setRouteLoading(true);
    getOsrmRoute(source, destination).then((next) => { if (active) setRoute(next); }).catch(() => { if (active) setRoute(null); }).finally(() => { if (active) setRouteLoading(false); });
    return () => { active = false; };
  }, [source, destination]);

  useEffect(() => {
    if (page !== "track" || !currentTracking.data?.driver_id) return;
    const channel = subscribeToDriverLocation(currentTracking.data.driver_id, setDriverLocation);
    return () => { unsubscribeFromDriverLocation(channel); };
  }, [page, currentTracking.data?.driver_id]);

  useEffect(() => {
    const location = driverLocationQuery.data;
    if (location?.last_location_lat == null || location.last_location_lng == null) return;
    setDriverLocation({ latitude: Number(location.last_location_lat), longitude: Number(location.last_location_lng) });
  }, [driverLocationQuery.data]);

  const setMapPoint = (point: MapPoint) => { if (selecting === "source") setSource(point); else setDestination(point); };
  const useMyLocation = async () => { try { const point = await getCurrentHamaLocation(); setMapPoint(point); } catch (error) { Alert.alert("تعذر استخدام الموقع", error instanceof Error && error.message === "OUTSIDE_HAMA_SERVICE_RADIUS" ? "موقعك خارج نطاق خدمة حماة البالغ ٧ كم." : "اسمح بالوصول إلى الموقع ثم حاول مجدداً."); } };
  const submitOrder = async () => {
    if (!source || !destination || !route) return Alert.alert("اختر النقطتين", "ضع دبوس الاستلام ودبوس التسليم داخل دائرة حماة أولاً.");
    const accessToken = await jarbou3Session.getAccessToken();
    if (!accessToken) return Alert.alert("سجّل الدخول أولاً", "يلزم الدخول الآمن لإنشاء طلب محفوظ ومتابعة السائق.");
    createOrder.mutate({ accessToken, sourceAddress: "نقطة الاستلام المحددة على الخريطة، حماة", destinationAddress: "وجهة التسليم المحددة على الخريطة، حماة", source, destination, estimatedPrice: route.price, paymentMethod: payment === "نقدي" ? "cash" : "sham_cash", distanceM: route.distanceM });
  };

  if (page === "order") return <ScrollView contentContainerStyle={styles.scroll}><Top title="طلب توصيل" back={() => setPage("home")} /><View style={styles.mapModeRow}><Pressable onPress={() => setSelecting("source")} style={[styles.mapMode, selecting === "source" && styles.mapModeActive]}><Text style={[styles.mapModeText, selecting === "source" && styles.mapModeTextActive]}>١. دبوس الاستلام</Text></Pressable><Pressable onPress={() => setSelecting("destination")} style={[styles.mapMode, selecting === "destination" && styles.mapModeActive]}><Text style={[styles.mapModeText, selecting === "destination" && styles.mapModeTextActive]}>٢. دبوس الوجهة</Text></Pressable></View><HamaMap source={source} destination={destination} selecting={selecting} onSelect={setMapPoint} /><View style={styles.card}><Heading eyebrow="تحديد حر داخل حماة" title="اضغط الخريطة لوضع الدبوس" /><Text style={styles.mapHint}>الدائرة الرمادية هي نطاق الخدمة. لا يمكن حفظ نقطة تبعد أكثر من ٧ كم عن مركز حماة.</Text><Action title="استخدم موقعي الحالي" kind="outline" onPress={useMyLocation} /><View style={styles.quote}><View><Text style={styles.quoteLabel}>السعر التقديري</Text><Text style={styles.quoteValue}>{route ? formatSyp(route.price) : "—"}</Text></View><View style={styles.quoteLine} /><View><Text style={styles.quoteLabel}>المسافة والوقت</Text><Text style={styles.quoteValueSmall}>{routeLoading ? "يُحسب المسار…" : route ? `${(route.distanceM / 1000).toFixed(1)} كم · ${Math.max(1, Math.round(route.durationSeconds / 60))} دقيقة` : "اختر الدبوسين"}</Text></View></View><Text style={styles.label}>طريقة الدفع</Text><View style={styles.paymentRow}>{(["نقدي", "شام كاش"] as const).map((method) => <Pressable key={method} onPress={() => setPayment(method)} style={[styles.payment, payment === method && styles.paymentSelected]}><Text style={styles.paymentText}>{method}</Text></Pressable>)}</View><Action title={createOrder.isPending ? "جارٍ إنشاء الطلب…" : `تأكيد الطلب · ${route ? formatSyp(route.price) : "—"}`} onPress={submitOrder} /></View></ScrollView>;

  if (page === "track") return <View style={styles.fill}><HamaMap source={source} destination={destination} driverLocation={driverLocation} readOnly /><View style={styles.trackSheet}><View style={styles.handle} /><View style={styles.split}><Tag status>السائق في الطريق</Tag><Text style={styles.muted}>طلب قيد المتابعة</Text></View><Text style={styles.trackTitle}>سليم متجه إلى المصدر</Text><Text style={styles.copy}>يتحول دبوس الجربوع الرمادي إلى تحديث حي فور قبول السائق للطلب.</Text><View style={styles.driverBox}><View style={styles.avatar}><Text style={styles.avatarText}>س</Text></View><View style={styles.flex}><Text style={styles.driverName}>سليم ع.</Text><Text style={styles.mutedRight}>سائق جربوع موثّق · ٤٫٩</Text></View><Pressable onPress={() => Alert.alert("اتصال", "سيُفتح الاتصال المباشر بالسائق عند تشغيل أرقام الخدمة.")} style={styles.minor}><Text style={styles.minorText}>اتصال</Text></Pressable></View><View style={styles.timeline}><Text style={styles.done}>● تم قبول طلبك</Text><Text style={styles.live}>● السائق متجه إلى المصدر</Text><Text style={styles.future}>○ استلام رمز التسليم</Text></View><Action title="لدي رمز الاستلام" onPress={() => setPage("otp")} /><Action title="العودة للرئيسية" kind="outline" onPress={() => setPage("home")} /></View></View>;

  if (page === "otp") return <View style={styles.fill}><Top title="تأكيد الاستلام" back={() => setPage("track")} /><View style={styles.centered}><View style={styles.otpBadge}><Text style={styles.otpBadgeText}>OTP</Text></View><Text style={styles.centerTitle}>أدخل رمز الاستلام</Text><Text style={styles.centerCopy}>يشاركك السائق الرمز عند وصول الطلب. لا تؤكده قبل الاستلام.</Text><TextInput style={styles.otp} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={4} placeholder="••••" placeholderTextColor="#AAA" textAlign="center" /><Action title="تأكيد الرمز" onPress={() => otp.length === 4 ? Alert.alert("تم التأكيد", "سيطلب من السائق الآن تصوير إثبات التسليم.") : Alert.alert("الرمز غير مكتمل", "أدخل أربعة أرقام.")} /><View style={styles.proofNotice}><Text style={styles.proofNoticeIcon}>▧</Text><View style={styles.flex}><Text style={styles.proofNoticeTitle}>صورة إثبات التسليم</Text><Text style={styles.proofNoticeCopy}>ستظهر هنا فور رفعها من السائق.</Text></View></View></View></View>;

  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.hero}><View><Text style={styles.eyebrow}>جربوع في حماة</Text><Text style={styles.heroTitle}>أهلاً، رامي</Text><Text style={styles.copy}>توصيل قريب وواضح وبالليرة السورية الجديدة.</Text></View><Mark /></View><HamaMap compact source={source} destination={destination} readOnly /><View style={styles.space}><Heading eyebrow="الخدمة متاحة" title="إلى أين نوصلك اليوم؟" /><Action title="إنشاء طلب توصيل" onPress={() => setPage("order")} /><View style={styles.note}><Text style={styles.noteIcon}>↗</Text><View style={styles.flex}><Text style={styles.noteTitle}>اختر نقاطك بحرية داخل حماة</Text><Text style={styles.noteCopy}>اضغط الخريطة لوضع دبوس الاستلام ودبوس التسليم ضمن دائرة ٧ كم.</Text></View></View><Heading eyebrow="آخر الطلبات" title="لا توجد طلبات نشطة" aside="عرض السجل" /><View style={styles.empty}><Text style={styles.emptyText}>ستظهر حالة طلبك وتفاصيل السائق هنا فور التأكيد.</Text></View></View></ScrollView>;
}

function Driver() {
  const [page, setPage] = useState<DriverPage>("home");
  const [personal, setPersonal] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [livePoint, setLivePoint] = useState<MapPoint | null>(null);
  const updateLocation = trpc.jarbou3.updateDriverLocation.useMutation();
  const camera = async (which: "personal" | "identity" | "proof") => { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return Alert.alert("إذن الكاميرا مطلوب", "يلزم الإذن لالتقاط الصور المطلوبة."); const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 }); if (result.canceled) return; const uri = result.assets[0].uri; if (which === "personal") setPersonal(uri); if (which === "identity") setIdentity(uri); if (which === "proof") setProof(uri); };

  useEffect(() => { jarbou3Session.getAccessToken().then(setAccessToken); }, []);
  useEffect(() => {
    if (page !== "drive" || !accessToken) return;
    let active = true;
    let remove: (() => void) | undefined;
    watchHamaLocation((point) => {
      if (!active) return;
      setLivePoint(point);
      updateLocation.mutate({ accessToken, location: point });
    }).then((subscription) => { remove = () => subscription.remove(); }).catch(() => Alert.alert("تعذر مشاركة الموقع", "اسمح بتحديد الموقع لمتابعة الرحلة داخل حماة."));
    return () => { active = false; remove?.(); };
  }, [page, accessToken]);

  if (page === "verify") return <ScrollView contentContainerStyle={styles.scroll}><Top title="تفعيل السائق" back={() => setPage("home")} /><View style={styles.space}><Tag>خطوة أمان مطلوبة</Tag><Heading title="وثّق ملفك قبل القيادة" /><Text style={styles.copyRight}>تُراجع الصور من الإدارة، ولا يراها أي سائق آخر أو عميل.</Text><Upload title="صورة شخصية" detail={personal ? "تم الالتقاط" : "التقط صورة واضحة للوجه"} uri={personal} onPress={() => camera("personal")} /><Upload title="صورة الهوية" detail={identity ? "تم الالتقاط" : "تُخزّن في مساحة خاصة"} uri={identity} onPress={() => camera("identity")} /><Text style={styles.label}>كود التفعيل من الإدارة</Text><TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="أدخل الكود" placeholderTextColor="#AAA" keyboardType="number-pad" textAlign="center" /><Action title="تأكيد التفعيل" onPress={() => !personal || !identity || code.length < 4 ? Alert.alert("بانتظار التفعيل", "ارفع الوثيقتين ثم أدخل كود التفعيل من الإدارة.") : (setPage("home"), Alert.alert("تم التفعيل", "أصبحت جاهزاً لرؤية الطلبات القريبة."))} /></View></ScrollView>;

  if (page === "drive") return <View style={styles.drive}><View style={styles.split}><Tag status>رحلة نشطة</Tag><Text style={styles.driveNumber}>#J-2048</Text></View><HamaMap compact driverLocation={livePoint} readOnly /><View><Text style={styles.driveLabel}>الشارع التالي</Text><Text style={styles.street}>شارع النواعير</Text><Text style={styles.distance}>١٫٣</Text><Text style={styles.distanceLabel}>كم متبقية</Text><View style={styles.progress}><View style={styles.progressFill} /></View><Text style={styles.driveHint}>{livePoint ? "يُرسل موقعك الحي كل ٥ ثوانٍ." : "اسمح بالموقع لتحديث العميل أثناء الرحلة."}</Text></View><View style={styles.driveBottom}><View style={styles.utilityRow}><Pressable onPress={() => Alert.alert("اتصال", "سيُفتح اتصال العميل عند ربط أرقام الخدمة.")} style={styles.utility}><Text style={styles.utilityText}>اتصال</Text></Pressable><Pressable onPress={() => Alert.alert("دردشة", "ستظهر محادثة الطلب النصية هنا.")} style={styles.utility}><Text style={styles.utilityText}>دردشة</Text></Pressable></View><Action title="تم التوصيل" kind="dark" onPress={() => setPage("deliver")} /></View></View>;

  if (page === "deliver") return <ScrollView contentContainerStyle={styles.scroll}><Top title="إتمام التسليم" back={() => setPage("drive")} /><View style={styles.space}><DeliveryStep number="١" title="تحقق من رمز العميل" detail="لا تلتقط الصورة قبل مطابقة الرمز." /><TextInput style={styles.input} value={otp} onChangeText={setOtp} maxLength={4} keyboardType="number-pad" placeholder="رمز من ٤ أرقام" placeholderTextColor="#AAA" textAlign="center" /><DeliveryStep number="٢" title="صورة عند الباب" detail="تُرسل للعميل كإثبات التسليم فقط." /><Pressable onPress={() => camera("proof")} style={styles.cameraBox}>{proof ? <Image source={{ uri: proof }} style={styles.photo} contentFit="cover" /> : <><Text style={styles.cameraIcon}>◉</Text><Text style={styles.cameraText}>التقط صورة إثبات التسليم</Text></>}</Pressable><Action title="تأكيد التسليم ورفع الصورة" onPress={() => otp.length !== 4 || !proof ? Alert.alert("ينقصك إجراء", "تحقق من الرمز والتقط صورة الإثبات.") : (setPage("home"), Alert.alert("تم التسليم", "أُضيف الطلب إلى ورديتك اليوم."))} /></View></ScrollView>;

  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.driverHero}><View><Text style={styles.driverEyebrow}>وضع السائق</Text><Text style={styles.driverHeroTitle}>جاهز للانطلاق؟</Text><Text style={styles.driverHeroCopy}>طلبات واضحة وأزرار كبيرة أثناء القيادة.</Text></View><Tag status>متصل</Tag></View><HamaMap compact driverLocation={livePoint} readOnly /><View style={styles.space}><View style={styles.setup}><View style={styles.flex}><Text style={styles.setupTitle}>ملف التفعيل</Text><Text style={styles.setupCopy}>ارفع الوثائق ثم أدخل كود الإدارة.</Text></View><Action title="الوثائق" kind="outline" onPress={() => setPage("verify")} /></View><Heading eyebrow="طلبات قريبة" title="طلب واحد متاح" /><View style={styles.orderCard}><View style={styles.split}><Tag>٢٫١ كم</Tag><Text style={styles.orderPrice}>{formatSyp(12000)}</Text></View><Text style={styles.orderRoute}>نقطة محددة على الخريطة ← وجهة العميل</Text><Text style={styles.copyRight}>المسافة تُحسب عبر OSRM · استلام الآن</Text><Action title="قبول الطلب وبدء الرحلة" onPress={() => setPage("drive")} /></View><View style={styles.shift}><Text style={styles.shiftTitle}>وردية اليوم</Text><Text style={styles.shiftValue}>{formatSyp(0)}</Text><Text style={styles.setupCopy}>تظهر التسوية عند إغلاق الوردية من الإدارة.</Text></View></View></ScrollView>;
}

function Upload({ title, detail, uri, onPress }: { title: string; detail: string; uri: string | null; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.upload}>{uri ? <Image source={{ uri }} style={styles.uploadPhoto} contentFit="cover" /> : <View style={styles.uploadPlaceholder}><Text style={styles.uploadSymbol}>＋</Text></View>}<View style={styles.flex}><Text style={styles.uploadTitle}>{title}</Text><Text style={styles.uploadDetail}>{detail}</Text></View></Pressable>; }
function DeliveryStep({ number, title, detail }: { number: string; title: string; detail: string }) { return <View style={styles.deliveryStep}><Text style={styles.stepNumber}>{number}</Text><View><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDetail}>{detail}</Text></View></View>; }

function Admin() {
  const [approved, setApproved] = useState(false); const [closed, setClosed] = useState(false); const [downloaded, setDownloaded] = useState(false);
  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.adminHero}><View><Text style={styles.eyebrow}>لوحة الإدارة</Text><Text style={styles.adminTitle}>صباح الخير، مدير جربوع</Text><Text style={styles.copy}>مراقبة التشغيل والتسويات من مكان واحد.</Text></View><Mark /></View><View style={styles.metrics}><Metric value="١٨" label="طلباً اليوم" /><Metric value="٤" label="سائقون نشطون" /><Metric value={formatSyp(198000)} label="إيراد اليوم" /></View><View style={styles.space}><Heading eyebrow="المتابعة المباشرة" title="الخريطة الحية" aside="٤ سائقين" /><HamaMap compact driverLocation={{ latitude: 35.142, longitude: 36.744 }} readOnly /><Heading eyebrow="تحتاج قراراً" title="طلبات تحقق السائقين" /><View style={styles.task}><View style={styles.taskAvatar}><Text style={styles.taskAvatarText}>م</Text></View><View style={styles.flex}><Text style={styles.taskTitle}>محمد خ.</Text><Text style={styles.taskCopy}>{approved ? "تمت الموافقة · كود التفعيل جاهز" : "رفع صورة شخصية وهوية الآن"}</Text></View>{approved ? <Tag status>موافق</Tag> : <Pressable onPress={() => { setApproved(true); Alert.alert("تمت الموافقة", "تم إنشاء كود تفعيل للسائق في حسابه."); }} style={styles.smallAction}><Text style={styles.smallActionText}>موافقة</Text></Pressable>}</View><Heading eyebrow="التسوية اليومية" title="وردية سليم ع." /><View style={styles.settle}><View><Text style={styles.settleLabel}>إجمالي المستحقات</Text><Text style={styles.settleValue}>{formatSyp(76000)}</Text><Text style={styles.settleDetail}>{closed ? "أغلقت · شام كاش" : "نقدي · ٦ طلبات مكتملة"}</Text></View>{closed ? <Tag status>مغلقة</Tag> : <Pressable onPress={() => { setClosed(true); Alert.alert("أغلقت الوردية", "سُجّل الاستلام عبر شام كاش."); }} style={styles.closeButton}><Text style={styles.closeText}>إغلاق الوردية</Text></Pressable>}</View><Heading eyebrow="أرشفة شهرية" title="تقرير تموز ٢٠٢٦" /><View style={styles.report}><View style={styles.pdf}><Text style={styles.pdfText}>PDF</Text></View><View style={styles.flex}><Text style={styles.reportTitle}>{downloaded ? "تم تأكيد التنزيل" : "جاهز للتنزيل"}</Text><Text style={styles.reportCopy}>{downloaded ? "الحذف المؤجل لن يبدأ إلا بعد هذا التأكيد المسجّل." : "٢٨٤ طلباً · ١٧ ملغى · تفصيل الورديات"}</Text></View>{downloaded ? <Tag status>مؤكد</Tag> : <Pressable onPress={() => { setDownloaded(true); Alert.alert("تم تأكيد التنزيل", "ستقرأ المهمة الشهرية هذا التأكيد قبل حذف بيانات الشهر."); }} style={styles.smallAction}><Text style={styles.smallActionText}>تنزيل</Text></Pressable>}</View></View></ScrollView>;
}

function Metric({ value, label }: { value: string; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Top({ title, back }: { title: string; back: () => void }) { return <View style={styles.top}><Pressable onPress={back} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.topTitle}>{title}</Text><View style={styles.backBlank} /></View>; }

export function Jarbou3App() {
  const [role, setRole] = useState<Role>("customer");
  const [accessOpen, setAccessOpen] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => { jarbou3Session.getAccessToken().then((token) => setHasSession(Boolean(token))); }, []);

  const signIn = trpc.jarbou3.signIn.useMutation({
    onSuccess: async (result) => {
      await jarbou3Session.save(result.accessToken, result.refreshToken);
      setHasSession(true);
      setRole(result.user.role);
      setAccessOpen(false);
      setPassword("");
      Alert.alert("تم تسجيل الدخول", `أهلاً ${result.user.name}`);
    },
    onError: (error) => Alert.alert("تعذر تسجيل الدخول", error.message),
  });
  const signUp = trpc.jarbou3.signUpCustomer.useMutation({
    onSuccess: (result) => {
      setMode("sign-in");
      setPassword("");
      Alert.alert("تم إنشاء الحساب", result.requiresPhoneConfirmation ? "تحقق من رسالة التأكيد على رقمك ثم سجّل الدخول." : "يمكنك تسجيل الدخول الآن.");
    },
    onError: (error) => Alert.alert("تعذر إنشاء الحساب", error.message),
  });
  const submitAccess = () => {
    if (!/^\+?[0-9]{8,16}$/.test(phone) || password.length < 8 || (mode === "sign-up" && name.trim().length < 2)) {
      Alert.alert("تحقق من البيانات", "أدخل اسماً من حرفين على الأقل ورقم هاتف صحيحاً وكلمة مرور من ٨ أحرف.");
      return;
    }
    if (mode === "sign-in") signIn.mutate({ phone, password });
    else signUp.mutate({ name: name.trim(), phone, password });
  };
  const busy = signIn.isPending || signUp.isPending;

  return <View style={styles.root}>
    <RoleSwitch role={role} onSelect={setRole} />
    <View style={styles.accessBar}><Text style={styles.accessCopy}>{hasSession ? "جلسة محفوظة على هذا الجهاز" : "سجّل الدخول لربط طلباتك وبياناتك بأمان"}</Text><Pressable onPress={() => setAccessOpen(true)} style={styles.accessButton}><Text style={styles.accessButtonText}>{hasSession ? "الحساب" : "دخول آمن"}</Text></Pressable></View>
    {role === "customer" ? <Customer /> : role === "driver" ? <Driver /> : <Admin />}
    <Modal visible={accessOpen} transparent animationType="slide" onRequestClose={() => setAccessOpen(false)}>
      <View style={styles.modalBackdrop}><View style={styles.authSheet}>
        <View style={styles.handle} />
        <Text style={styles.authTitle}>{mode === "sign-in" ? "دخول آمن" : "إنشاء حساب عميل"}</Text>
        <Text style={styles.authCopy}>{mode === "sign-in" ? "استخدم رقم هاتفك وكلمة المرور للوصول إلى طلباتك." : "سيُحفظ رقمك ضمن مصادقة جربوع ولن يظهر للسائقين."}</Text>
        {mode === "sign-up" ? <TextInput value={name} onChangeText={setName} placeholder="الاسم" placeholderTextColor="#999" style={styles.authInput} textAlign="right" /> : null}
        <TextInput value={phone} onChangeText={setPhone} placeholder="رقم الهاتف، مثال +963..." placeholderTextColor="#999" keyboardType="phone-pad" style={styles.authInput} textAlign="right" />
        <TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور" placeholderTextColor="#999" secureTextEntry style={styles.authInput} textAlign="right" />
        <Pressable onPress={submitAccess} disabled={busy} style={[styles.authAction, busy && styles.authActionDisabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>{mode === "sign-in" ? "تسجيل الدخول" : "إنشاء الحساب"}</Text>}</Pressable>
        <Pressable onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} style={styles.modeSwitch}><Text style={styles.modeSwitchText}>{mode === "sign-in" ? "ليس لديك حساب؟ أنشئ حساب عميل" : "لديك حساب بالفعل؟ سجّل الدخول"}</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  mapModeRow: { flexDirection: "row-reverse", gap: 8, marginHorizontal: 16, marginTop: 12 }, mapMode: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: "#D1D1D1", borderRadius: 13, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }, mapModeActive: { backgroundColor: gray, borderColor: gray }, mapModeText: { color: gray, fontSize: 11, fontWeight: "900" }, mapModeTextActive: { color: "#FFFFFF" }, mapHint: { color: "#727272", fontSize: 11, lineHeight: 17, textAlign: "right" },
  root: { flex: 1, backgroundColor: "#F5F5F5" }, scroll: { paddingBottom: 30 }, fill: { flex: 1 }, flex: { flex: 1 }, pressed: { opacity: 0.78, transform: [{ scale: 0.986 }] }, space: { paddingHorizontal: 16, paddingTop: 16, gap: 14 }, roleSwitch: { flexDirection: "row-reverse", gap: 4, marginHorizontal: 16, marginTop: 8, marginBottom: 8, backgroundColor: "#E4E4E4", padding: 4, borderRadius: 14 }, role: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" }, roleSelected: { backgroundColor: "#FFF" }, roleText: { color: "#747474", fontSize: 13, fontWeight: "800" }, roleTextSelected: { color: dark },
  accessBar: { marginHorizontal: 16, marginBottom: 2, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 10 }, accessCopy: { color: "#737373", fontSize: 10, fontWeight: "700", textAlign: "right", flex: 1 }, accessButton: { backgroundColor: "#FFFFFF", borderColor: "#D7D7D7", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, accessButtonText: { color: "#4A4A4A", fontSize: 10, fontWeight: "900" }, modalBackdrop: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }, authSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 12 }, authTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right" }, authCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "right", marginBottom: 4 }, authInput: { minHeight: 52, borderRadius: 15, backgroundColor: "#F5F5F5", borderColor: "#DDDDDD", borderWidth: 1, paddingHorizontal: 14, color: dark, fontSize: 14, fontWeight: "700" }, authAction: { minHeight: 53, borderRadius: 16, backgroundColor: gray, alignItems: "center", justifyContent: "center" }, authActionDisabled: { opacity: 0.65 }, modeSwitch: { paddingVertical: 8, alignItems: "center" }, modeSwitchText: { color: gray, fontSize: 12, fontWeight: "900" },
  action: { minHeight: 53, borderRadius: 16, backgroundColor: gray, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 }, actionDark: { backgroundColor: "#FFF" }, actionOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#C9C9C9" }, actionText: { color: "#FFF", fontSize: 14, fontWeight: "900", textAlign: "center" }, actionOutlineText: { color: gray }, tag: { backgroundColor: "#E9E9E9", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, alignSelf: "flex-start" }, tagStatus: { backgroundColor: "#DDF2E9" }, tagText: { color: "#555", fontSize: 10, fontWeight: "900" }, tagStatusText: { color: "#276149" },
  mark: { width: 56, height: 56, borderRadius: 18, overflow: "hidden", backgroundColor: "#FFF" }, markSmall: { width: 34, height: 34, borderRadius: 11 }, markImage: { width: "100%", height: "100%" }, hero: { marginHorizontal: 16, padding: 19, borderRadius: 24, backgroundColor: "#FFF", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, heroTitle: { color: dark, fontSize: 24, fontWeight: "900", textAlign: "right" }, eyebrow: { color: "#747474", fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 4 }, copy: { color: "#737373", textAlign: "right", fontSize: 12, lineHeight: 19, marginTop: 4 }, copyRight: { color: "#737373", textAlign: "right", fontSize: 12, lineHeight: 19 },
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" }, mapCompact: { height: 188 }, nativeMap: { flex: 1 }, mapRoad: { position: "absolute", height: 4, left: -30, right: -30, backgroundColor: "#FFF", opacity: 0.75 }, mapName: { position: "absolute", top: 18, left: 20, color: "#747474", fontSize: 18, fontWeight: "900" }, dot: { position: "absolute", width: 12, height: 12, borderRadius: 8, borderWidth: 2, borderColor: "#FFF", backgroundColor: "#888" }, dotTarget: { width: 20, height: 20, borderRadius: 10, right: "12%", top: "20%", backgroundColor: "#2F7A62" }, mapDriver: { position: "absolute", top: "37%", left: "54%", borderWidth: 3, borderColor: "#FFF", borderRadius: 14 }, mapBadge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }, mapBadgeText: { color: gray, fontSize: 11, fontWeight: "900" },
  headingRow: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" }, heading: { color: dark, fontSize: 19, fontWeight: "900", textAlign: "right" }, aside: { color: "#737373", fontSize: 11, fontWeight: "800" }, note: { backgroundColor: "#E7E7E7", borderRadius: 18, padding: 14, flexDirection: "row-reverse", gap: 10, alignItems: "center" }, noteIcon: { color: "#FFF", backgroundColor: gray, width: 35, height: 35, borderRadius: 11, overflow: "hidden", textAlign: "center", textAlignVertical: "center", fontSize: 19, fontWeight: "900" }, noteTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, noteCopy: { color: "#737373", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 2 }, empty: { backgroundColor: "#FFF", borderRadius: 18, borderColor: "#D8D8D8", borderWidth: 1, borderStyle: "dashed", padding: 16 }, emptyText: { color: "#737373", fontSize: 12, textAlign: "right" },
  top: { height: 60, paddingHorizontal: 16, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, back: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" }, backText: { color: dark, fontSize: 30, marginTop: -6 }, backBlank: { width: 38 }, topTitle: { color: dark, fontSize: 17, fontWeight: "900" }, card: { backgroundColor: "#FFF", margin: 16, padding: 17, borderRadius: 23, gap: 11 }, label: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 3 }, stops: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, stop: { borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, stopSelected: { borderColor: gray, backgroundColor: gray }, stopText: { color: "#717171", fontSize: 11, fontWeight: "800" }, stopTextSelected: { color: "#FFF" }, quote: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F0F0F0", borderRadius: 16, padding: 13 }, quoteLabel: { color: "#747474", fontSize: 10, fontWeight: "800", textAlign: "right" }, quoteValue: { color: dark, fontSize: 17, fontWeight: "900", marginTop: 3, textAlign: "right" }, quoteValueSmall: { color: gray, fontSize: 12, fontWeight: "800", marginTop: 3, textAlign: "right" }, quoteLine: { width: 1, height: 35, backgroundColor: "#D3D3D3" }, paymentRow: { flexDirection: "row-reverse", gap: 9 }, payment: { flex: 1, minHeight: 54, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 15 }, paymentSelected: { borderWidth: 2, borderColor: gray, backgroundColor: "#F1F1F1" }, paymentText: { color: gray, fontSize: 12, fontWeight: "900" },
  trackSheet: { flex: 1, padding: 19, paddingTop: 12, backgroundColor: "#FFF", marginTop: -18, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12 }, handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D8D8D8", alignSelf: "center" }, split: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, muted: { color: "#737373", fontSize: 11, fontWeight: "700" }, trackTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right" }, driverBox: { backgroundColor: "#F2F2F2", borderRadius: 18, padding: 12, flexDirection: "row-reverse", gap: 10, alignItems: "center" }, avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: gray, alignItems: "center", justifyContent: "center" }, avatarText: { color: "#FFF", fontSize: 17, fontWeight: "900" }, driverName: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, mutedRight: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, minor: { backgroundColor: "#FFF", borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }, minorText: { color: gray, fontSize: 11, fontWeight: "900" }, timeline: { gap: 7, paddingRight: 6 }, done: { color: "#2F7A62", textAlign: "right", fontSize: 12, fontWeight: "800" }, live: { color: dark, textAlign: "right", fontSize: 12, fontWeight: "900" }, future: { color: "#AAA", textAlign: "right", fontSize: 12, fontWeight: "800" },
  centered: { padding: 28, alignItems: "center", gap: 15 }, otpBadge: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#E9E9E9", borderColor: "#FFF", borderWidth: 8, alignItems: "center", justifyContent: "center" }, otpBadgeText: { color: gray, fontSize: 18, fontWeight: "900" }, centerTitle: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "center" }, centerCopy: { color: "#737373", fontSize: 12, lineHeight: 19, textAlign: "center" }, otp: { width: "100%", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D8D8D8", borderRadius: 17, padding: 15, fontSize: 22, letterSpacing: 8, color: dark, fontWeight: "900" }, proofNotice: { width: "100%", backgroundColor: "#FFF", borderRadius: 17, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 11 }, proofNoticeIcon: { color: "#A6A6A6", fontSize: 28 }, proofNoticeTitle: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right" }, proofNoticeCopy: { color: "#737373", fontSize: 10, textAlign: "right", marginTop: 3 },
  driverHero: { backgroundColor: "#242424", marginHorizontal: 16, padding: 19, borderRadius: 23, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, driverEyebrow: { color: "#B5B5B5", fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 4 }, driverHeroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "right" }, driverHeroCopy: { color: "#CECECE", fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 4 }, setup: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, setupTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, setupCopy: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, orderCard: { backgroundColor: "#FFF", borderRadius: 21, padding: 17, gap: 10 }, orderPrice: { color: dark, fontSize: 17, fontWeight: "900" }, orderRoute: { color: dark, fontSize: 16, fontWeight: "900", textAlign: "right" }, shift: { backgroundColor: "#E5E5E5", borderRadius: 18, padding: 15 }, shiftTitle: { color: gray, fontSize: 12, fontWeight: "900", textAlign: "right" }, shiftValue: { color: dark, fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 4 }, upload: { minHeight: 83, backgroundColor: "#FFF", borderRadius: 18, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 11 }, uploadPhoto: { width: 57, height: 57, borderRadius: 13 }, uploadPlaceholder: { width: 57, height: 57, borderRadius: 13, backgroundColor: "#EFEFEF", alignItems: "center", justifyContent: "center" }, uploadSymbol: { color: "#777", fontSize: 29 }, uploadTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, uploadDetail: { color: "#737373", fontSize: 10, textAlign: "right", marginTop: 4 }, input: { minHeight: 52, borderRadius: 16, backgroundColor: "#FFF", borderColor: "#D8D8D8", borderWidth: 1, color: dark, fontWeight: "900", fontSize: 16, paddingHorizontal: 13 },
  drive: { flex: 1, backgroundColor: "#171717", padding: 22, justifyContent: "space-between" }, driveNumber: { color: "#A8A8A8", fontSize: 11, fontWeight: "800" }, driveLabel: { color: "#ABABAB", fontSize: 14, textAlign: "right", fontWeight: "800", marginTop: 30 }, street: { color: "#FFF", fontSize: 34, fontWeight: "900", textAlign: "right", marginTop: 3 }, distance: { color: "#FFF", fontSize: 78, lineHeight: 86, fontWeight: "900", textAlign: "center", marginTop: 24 }, distanceLabel: { color: "#C6C6C6", fontSize: 14, textAlign: "center", fontWeight: "800" }, progress: { height: 11, backgroundColor: "#444", borderRadius: 6, overflow: "hidden", marginTop: 24 }, progressFill: { width: "68%", height: "100%", borderRadius: 6, backgroundColor: "#E5E5E5" }, driveHint: { color: "#C6C6C6", fontSize: 12, textAlign: "center", marginTop: 17 }, driveBottom: { gap: 13 }, utilityRow: { flexDirection: "row-reverse", gap: 10 }, utility: { flex: 1, height: 55, borderRadius: 17, borderWidth: 1, borderColor: "#5B5B5B", justifyContent: "center", alignItems: "center" }, utilityText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  deliveryStep: { flexDirection: "row-reverse", alignItems: "center", gap: 11 }, stepNumber: { width: 33, height: 33, borderRadius: 17, backgroundColor: gray, color: "#FFF", fontWeight: "900", textAlign: "center", textAlignVertical: "center" }, stepTitle: { color: dark, fontSize: 14, fontWeight: "900", textAlign: "right" }, stepDetail: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, cameraBox: { height: 174, backgroundColor: "#FFF", borderColor: "#C8C8C8", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 21, overflow: "hidden", justifyContent: "center", alignItems: "center", gap: 6 }, cameraIcon: { fontSize: 34, color: "#777" }, cameraText: { color: gray, fontSize: 12, fontWeight: "900" }, photo: { width: "100%", height: "100%" },
  adminHero: { marginHorizontal: 16, backgroundColor: "#FFF", padding: 18, borderRadius: 23, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, adminTitle: { color: dark, fontSize: 19, fontWeight: "900", textAlign: "right" }, metrics: { margin: 16, marginBottom: 0, flexDirection: "row-reverse", gap: 7 }, metric: { flex: 1, backgroundColor: "#E8E8E8", borderRadius: 15, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" }, metricValue: { color: dark, fontSize: 16, fontWeight: "900", textAlign: "center" }, metricLabel: { color: "#737373", fontSize: 9, fontWeight: "800", marginTop: 4, textAlign: "center" }, task: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, taskAvatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E3E3E3", alignItems: "center", justifyContent: "center" }, taskAvatarText: { color: gray, fontSize: 16, fontWeight: "900" }, taskTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, taskCopy: { color: "#737373", fontSize: 10, marginTop: 3, textAlign: "right" }, smallAction: { backgroundColor: gray, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 }, smallActionText: { color: "#FFF", fontSize: 10, fontWeight: "900" }, settle: { backgroundColor: "#252525", borderRadius: 20, padding: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, settleLabel: { color: "#BEBEBE", fontSize: 10, fontWeight: "800", textAlign: "right" }, settleValue: { color: "#FFF", fontSize: 21, fontWeight: "900", textAlign: "right", marginTop: 3 }, settleDetail: { color: "#BEBEBE", fontSize: 10, textAlign: "right", marginTop: 3 }, closeButton: { borderWidth: 1, borderColor: "#747474", padding: 9, borderRadius: 11, maxWidth: 88 }, closeText: { color: "#FFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, report: { backgroundColor: "#FFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, pdf: { width: 45, height: 45, borderRadius: 14, backgroundColor: "#E9E9E9", alignItems: "center", justifyContent: "center" }, pdfText: { color: gray, fontSize: 10, fontWeight: "900" }, reportTitle: { color: dark, fontSize: 13, fontWeight: "900", textAlign: "right" }, reportCopy: { color: "#737373", fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 3 },
});
