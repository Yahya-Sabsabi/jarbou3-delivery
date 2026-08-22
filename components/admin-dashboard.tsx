import { useReducer, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { adminReducer, initialAdminState, type AdminView } from "@/lib/admin-dashboard-state";

const navigation: Array<{ id: AdminView; label: string }> = [
  { id: "overview", label: "نظرة عامة" },
  { id: "orders", label: "الطلبات" },
  { id: "drivers", label: "السائقون" },
  { id: "finance", label: "التسويات" },
  { id: "reports", label: "التقارير" },
];

function AdminButton({
  label,
  onPress,
  tone = "dark",
}: {
  label: string;
  onPress: () => void;
  tone?: "dark" | "light" | "success" | "danger";
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, styles[`button_${tone}`], pressed && styles.pressed]}>
      <Text style={[styles.buttonText, styles[`buttonText_${tone}`]]}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "dark" }) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

function MetricCard({ value, label, detail, tone = "dark" }: { value: string; label: string; detail: string; tone?: "dark" | "green" | "amber" }) {
  return (
    <View style={[styles.metric, styles[`metric_${tone}`]]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionHeading}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function AdminDashboard() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const [state, dispatch] = useReducer(adminReducer, initialAdminState);
  const { view, driverDecision, orderAssigned, shiftClosed, reportDownloaded } = state;

  const pendingCount = driverDecision === "pending" ? 2 : 1;
  const orderState = orderAssigned ? "قيد التوصيل" : "بانتظار التعيين";

  const approveDriver = () => {
    dispatch({ type: "approve_driver" });
    Alert.alert("تمت الموافقة", "أصبح كود التفعيل جاهزاً لإرساله إلى السائق.");
  };

  const rejectDriver = () => {
    dispatch({ type: "reject_driver" });
    Alert.alert("تم تسجيل الرفض", "يمكن مراجعة الوثائق وإعادة فتح الطلب عند وصول تحديث.");
  };

  const assignOrder = () => {
    dispatch({ type: "assign_order" });
    Alert.alert("تم تعيين السائق", "أصبح الطلب #J-2056 مرئياً للسائق فادي م.");
  };

  const closeShift = () => {
    dispatch({ type: "close_shift" });
    Alert.alert("أُغلقت الوردية", "تم تسجيل التسوية النقدية في سجل الوردية المحلي.");
  };

  const downloadReport = () => {
    dispatch({ type: "confirm_report_download" });
    Alert.alert("تم توثيق التنزيل", "لن يبدأ إجراء الأرشفة إلا بعد هذا التأكيد المسجّل.");
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>ج</Text></View>
          <View>
            <Text style={styles.brandName}>جربوع</Text>
            <Text style={styles.brandSubtitle}>مركز العمليات</Text>
          </View>
        </View>
        <View style={styles.sessionChip}>
          <View style={styles.onlineDot} />
          <Text style={styles.sessionText}>إدارة متصلة</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navigation}>
        {navigation.map((item) => (
          <Pressable key={item.id} onPress={() => dispatch({ type: "set_view", view: item.id })} style={({ pressed }) => [styles.navItem, view === item.id && styles.navItemActive, pressed && styles.pressed]}>
            <Text style={[styles.navText, view === item.id && styles.navTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.content, isWide && styles.contentWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.eyebrow}>تشغيل اليوم</Text>
            <Text style={styles.welcomeTitle}>{view === "overview" ? "صباح الخير، مدير جربوع" : navigation.find((item) => item.id === view)?.label}</Text>
            <Text style={styles.welcomeText}>راجع الحالات التي تحتاج قراراً، وتابع حركة الطلبات داخل حماة.</Text>
          </View>
          <View style={styles.dateCard}>
            <Text style={styles.dateDay}>الثلاثاء</Text>
            <Text style={styles.dateValue}>٢٢ آب</Text>
          </View>
        </View>

        <View style={[styles.metricsGrid, isWide && styles.metricsGridWide]}>
          <MetricCard value="١٨" label="طلباً اليوم" detail="٣ في الطريق" />
          <MetricCard value="٤" label="سائقون نشطون" detail="١ بانتظار التفعيل" tone="green" />
          <MetricCard value="١٩٨٬٠٠٠ ل.س" label="إيراد اليوم" detail="٦ ورديات مفتوحة" tone="amber" />
        </View>

        {view === "overview" ? (
          <>
            <View style={[styles.twoColumn, isWide && styles.twoColumnWide]}>
              <View style={[styles.mapCard, isWide && styles.mapCardWide]}>
                <SectionTitle eyebrow="المتابعة المباشرة" title="حركة الأسطول" action={<StatusPill label="٤ متصلون" tone="success" />} />
                <View style={styles.mapCanvas}>
                  <View style={[styles.mapRoad, styles.roadHorizontal]} />
                  <View style={[styles.mapRoad, styles.roadVertical]} />
                  <View style={[styles.mapRoad, styles.roadDiagonal]} />
                  <Text style={styles.mapCaption}>حماة</Text>
                  <View style={[styles.mapPin, styles.pinOne]}><Text style={styles.pinText}>س</Text></View>
                  <View style={[styles.mapPin, styles.pinTwo]}><Text style={styles.pinText}>ف</Text></View>
                  <View style={[styles.mapPin, styles.pinThree]}><Text style={styles.pinText}>م</Text></View>
                  <View style={styles.mapLegend}><View style={styles.legendDot} /><Text style={styles.legendText}>تحديث الموقع نشط</Text></View>
                </View>
                <View style={styles.mapFooter}>
                  <Text style={styles.mapFooterText}>آخر تحديث منذ لحظات</Text>
                  <Pressable onPress={() => dispatch({ type: "set_view", view: "orders" })}><Text style={styles.linkText}>عرض تفاصيل الطلبات</Text></Pressable>
                </View>
              </View>

              <View style={styles.queueCard}>
                <SectionTitle eyebrow="قائمة الإجراءات" title="تحتاج قراراً" action={<StatusPill label={`${pendingCount} مفتوحة`} tone="warning" />} />
                <View style={styles.queueItem}>
                  <View style={[styles.itemAvatar, styles.avatarAmber]}><Text style={styles.itemAvatarText}>م</Text></View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>مراجعة وثائق محمد خ.</Text>
                    <Text style={styles.itemDetail}>{driverDecision === "pending" ? "رفع صورة شخصية وهوية حديثاً" : driverDecision === "approved" ? "تمت الموافقة وكود التفعيل جاهز" : "تم تسجيل طلب تحديث للوثائق"}</Text>
                  </View>
                  {driverDecision === "pending" ? <Pressable onPress={() => dispatch({ type: "set_view", view: "drivers" })}><Text style={styles.linkText}>مراجعة</Text></Pressable> : <StatusPill label={driverDecision === "approved" ? "موافق" : "مرفوض"} tone={driverDecision === "approved" ? "success" : "danger"} />}
                </View>
                <View style={styles.divider} />
                <View style={styles.queueItem}>
                  <View style={[styles.itemAvatar, styles.avatarDark]}><Text style={styles.itemAvatarText}>٢</Text></View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>طلب #J-2056 دون سائق</Text>
                    <Text style={styles.itemDetail}>{orderState} · نقطة الاستلام في حي المرابط</Text>
                  </View>
                  <Pressable onPress={() => dispatch({ type: "set_view", view: "orders" })}><Text style={styles.linkText}>تعيين</Text></Pressable>
                </View>
                <View style={styles.divider} />
                <View style={styles.queueItem}>
                  <View style={[styles.itemAvatar, styles.avatarGreen]}><Text style={styles.itemAvatarText}>ل.س</Text></View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>تسوية وردية سليم ع.</Text>
                    <Text style={styles.itemDetail}>{shiftClosed ? "أُغلقت وردية اليوم" : "٦ طلبات مكتملة · تسوية نقدية"}</Text>
                  </View>
                  <Pressable onPress={() => dispatch({ type: "set_view", view: "finance" })}><Text style={styles.linkText}>{shiftClosed ? "عرض" : "تسوية"}</Text></Pressable>
                </View>
              </View>
            </View>

            <SectionTitle eyebrow="سجل اليوم" title="آخر حركة للطلبات" action={<Pressable onPress={() => dispatch({ type: "set_view", view: "orders" })}><Text style={styles.linkText}>جميع الطلبات</Text></Pressable>} />
            <View style={styles.activityCard}>
              <ActivityRow dot="green" title="الطلب #J-2048 في الطريق إلى العميل" detail="سليم ع. · آخر تحديث ١٠:٣٤" />
              <ActivityRow dot="amber" title="الطلب #J-2056 بانتظار تعيين سائق" detail="تم الإنشاء قبل ٧ دقائق" />
              <ActivityRow dot="gray" title="تم تسليم الطلب #J-2042" detail="تمت مطابقة رمز الاستلام وإضافة صورة الإثبات" isLast />
            </View>
          </>
        ) : null}

        {view === "orders" ? (
          <View style={styles.panelCard}>
            <SectionTitle eyebrow="إدارة الطلبات" title="الطلبات التي تحتاج متابعة" />
            <OrderRow id="#J-2056" customer="رامي ك." route="حي المرابط ← طريق حلب" status={orderState} tone={orderAssigned ? "success" : "warning"} action={orderAssigned ? "تم التعيين" : "تعيين سائق"} onPress={assignOrder} disabled={orderAssigned} />
            <OrderRow id="#J-2048" customer="ميساء م." route="شارع النواعير ← حي جنوب الملعب" status="قيد التوصيل" tone="success" action="متابعة" onPress={() => Alert.alert("تفاصيل الطلب", "السائق سليم ع. في طريقه إلى وجهة العميل.")} />
            <OrderRow id="#J-2042" customer="عادل ن." route="سوق الطويل ← حي القصور" status="مكتمل" tone="neutral" action="عرض السجل" onPress={() => Alert.alert("سجل الطلب", "تم التسليم وتوثيق صورة الإثبات.")} isLast />
          </View>
        ) : null}

        {view === "drivers" ? (
          <View style={styles.panelCard}>
            <SectionTitle eyebrow="التحقق من السائقين" title="محمد خ. ينتظر قرارك" action={<StatusPill label="وثيقتان" tone="warning" />} />
            <View style={styles.driverReview}>
              <View style={styles.driverPortrait}><Text style={styles.driverPortraitText}>م</Text></View>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>محمد خليل</Text>
                <Text style={styles.itemDetail}>طلب تفعيل جديد · تم رفع الصورة الشخصية والهوية</Text>
              </View>
            </View>
            <View style={styles.documentGrid}>
              <View style={styles.document}><Text style={styles.documentIcon}>▧</Text><Text style={styles.documentTitle}>الصورة الشخصية</Text><Text style={styles.documentDetail}>مرفوعة للمراجعة</Text></View>
              <View style={styles.document}><Text style={styles.documentIcon}>▤</Text><Text style={styles.documentTitle}>وثيقة الهوية</Text><Text style={styles.documentDetail}>مرفوعة للمراجعة</Text></View>
            </View>
            {driverDecision === "pending" ? <View style={styles.actionRow}><View style={styles.actionFlex}><AdminButton label="موافقة وإصدار كود" tone="success" onPress={approveDriver} /></View><View style={styles.actionFlex}><AdminButton label="طلب تحديث" tone="light" onPress={rejectDriver} /></View></View> : <View style={styles.decisionNotice}><StatusPill label={driverDecision === "approved" ? "تمت الموافقة" : "بانتظار وثائق محدثة"} tone={driverDecision === "approved" ? "success" : "danger"} /><Text style={styles.decisionText}>{driverDecision === "approved" ? "كود التفعيل جاهز للسائق محمد خ." : "تم حفظ القرار ويمكن متابعة الطلب عند رفع وثائق جديدة."}</Text></View>}
          </View>
        ) : null}

        {view === "finance" ? (
          <View style={styles.panelCard}>
            <SectionTitle eyebrow="تسوية الوردية" title="وردية سليم ع." action={<StatusPill label={shiftClosed ? "مغلقة" : "مفتوحة"} tone={shiftClosed ? "success" : "warning"} />} />
            <View style={styles.settlementTotal}>
              <Text style={styles.settlementLabel}>إجمالي المستحقات</Text>
              <Text style={styles.settlementValue}>٧٦٬٠٠٠ ل.س</Text>
              <Text style={styles.settlementDetail}>٦ طلبات مكتملة · تحصيل نقدي</Text>
            </View>
            <View style={styles.breakdown}><BreakdownRow label="إجمالي التحصيل" value="٩٢٬٠٠٠ ل.س" /><BreakdownRow label="عمولة المنصة" value="١٦٬٠٠٠ ل.س" /><BreakdownRow label="صافي السائق" value="٧٦٬٠٠٠ ل.س" strong /></View>
            {shiftClosed ? <View style={styles.decisionNotice}><StatusPill label="تم استلام التسوية" tone="success" /><Text style={styles.decisionText}>أُغلق سجل الوردية ويمكن عرضه ضمن التقرير الشهري.</Text></View> : <AdminButton label="تأكيد الاستلام وإغلاق الوردية" onPress={closeShift} />}
          </View>
        ) : null}

        {view === "reports" ? (
          <View style={styles.panelCard}>
            <SectionTitle eyebrow="أرشفة شهرية" title="تقرير تموز ٢٠٢٦" action={<View style={styles.pdfBadge}><Text style={styles.pdfText}>PDF</Text></View>} />
            <View style={styles.reportSummary}><View><Text style={styles.reportBig}>٢٨٤</Text><Text style={styles.reportLabel}>طلباً خلال الشهر</Text></View><View style={styles.reportDivider} /><View><Text style={styles.reportBig}>١٧</Text><Text style={styles.reportLabel}>طلباً ملغى</Text></View><View style={styles.reportDivider} /><View><Text style={styles.reportBig}>٣١</Text><Text style={styles.reportLabel}>وردية موثقة</Text></View></View>
            <Text style={styles.reportInfo}>يتضمن التقرير تفاصيل الطلبات والورديات وسجل الأرشفة. لا يُسمح بالحذف المؤجل قبل تأكيد التنزيل.</Text>
            {reportDownloaded ? <View style={styles.decisionNotice}><StatusPill label="تنزيل مؤكد" tone="success" /><Text style={styles.decisionText}>سُجّل التأكيد؛ ستبقى البيانات متاحة للمراجعة وفق سياسة الأرشفة.</Text></View> : <AdminButton label="تأكيد تنزيل التقرير" onPress={downloadReport} />}
          </View>
        ) : null}

        <Text style={styles.localNote}>عرض تشغيلي محلي لتجربة واجهة الإدارة؛ يتصل الإنتاج الفعلي ببيانات وصلاحيات الخادم.</Text>
      </ScrollView>
    </View>
  );
}

function ActivityRow({ dot, title, detail, isLast = false }: { dot: "green" | "amber" | "gray"; title: string; detail: string; isLast?: boolean }) {
  return <View style={[styles.activityRow, !isLast && styles.activityBorder]}><View style={[styles.activityDot, styles[`activityDot_${dot}`]]} /><View style={styles.itemCopy}><Text style={styles.activityTitle}>{title}</Text><Text style={styles.activityDetail}>{detail}</Text></View></View>;
}

function OrderRow({ id, customer, route, status, tone, action, onPress, disabled = false, isLast = false }: { id: string; customer: string; route: string; status: string; tone: "success" | "warning" | "neutral"; action: string; onPress: () => void; disabled?: boolean; isLast?: boolean }) {
  return <View style={[styles.orderRow, !isLast && styles.orderBorder]}><View style={styles.orderMeta}><Text style={styles.orderId}>{id}</Text><Text style={styles.orderCustomer}>{customer}</Text><Text style={styles.orderRoute}>{route}</Text></View><View style={styles.orderAction}><StatusPill label={status} tone={tone} /><Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.inlineButton, disabled && styles.inlineButtonDisabled, pressed && !disabled && styles.pressed]}><Text style={styles.inlineButtonText}>{action}</Text></Pressable></View></View>;
}

function BreakdownRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.breakdownRow}><Text style={[styles.breakdownValue, strong && styles.breakdownStrong]}>{value}</Text><Text style={[styles.breakdownLabel, strong && styles.breakdownStrong]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F5F5" },
  topBar: { paddingHorizontal: 18, paddingVertical: 13, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E6E6E6" },
  brandRow: { flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  logo: { width: 37, height: 37, borderRadius: 12, backgroundColor: "#171717", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  brandName: { color: "#171717", fontSize: 15, fontWeight: "900", textAlign: "right" },
  brandSubtitle: { color: "#777777", fontSize: 10, fontWeight: "700", marginTop: 1, textAlign: "right" },
  sessionChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#F1F7F4", borderRadius: 20 },
  onlineDot: { width: 7, height: 7, backgroundColor: "#2F7A62", borderRadius: 7 },
  sessionText: { color: "#2F7A62", fontSize: 10, fontWeight: "900" },
  navigation: { gap: 7, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row-reverse" },
  navItem: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: "#E7E7E7" },
  navItemActive: { backgroundColor: "#4A4A4A" },
  navText: { color: "#6E6E6E", fontSize: 11, fontWeight: "900" },
  navTextActive: { color: "#FFFFFF" },
  content: { paddingHorizontal: 16, paddingBottom: 34, gap: 15 },
  contentWide: { paddingHorizontal: 26, maxWidth: 1180, width: "100%", alignSelf: "center" },
  welcomeRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 14, paddingTop: 4 },
  welcomeCopy: { flex: 1 },
  eyebrow: { color: "#888888", fontSize: 10, fontWeight: "900", textAlign: "right", marginBottom: 4 },
  welcomeTitle: { color: "#171717", fontSize: 23, fontWeight: "900", lineHeight: 30, textAlign: "right" },
  welcomeText: { color: "#747474", fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: "right" },
  dateCard: { minWidth: 69, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 15, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E2E2", alignItems: "center" },
  dateDay: { color: "#777777", fontSize: 10, fontWeight: "800" },
  dateValue: { color: "#171717", fontSize: 12, fontWeight: "900", marginTop: 2 },
  metricsGrid: { gap: 9 },
  metricsGridWide: { flexDirection: "row-reverse" },
  metric: { borderRadius: 18, padding: 15, flex: 1 },
  metric_dark: { backgroundColor: "#414141" },
  metric_green: { backgroundColor: "#2F7A62" },
  metric_amber: { backgroundColor: "#AA721D" },
  metricValue: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", textAlign: "right" },
  metricLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 2 },
  metricDetail: { color: "#FFFFFFCC", fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 5 },
  twoColumn: { gap: 14 },
  twoColumnWide: { flexDirection: "row-reverse", alignItems: "stretch" },
  mapCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 15, gap: 12 },
  mapCardWide: { flex: 1.25 },
  queueCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 15, gap: 12, flex: 1 },
  sectionTitle: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  sectionHeading: { flex: 1 },
  heading: { color: "#171717", fontSize: 17, fontWeight: "900", textAlign: "right" },
  pill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, alignSelf: "flex-start" },
  pill_neutral: { backgroundColor: "#ECECEC" },
  pill_success: { backgroundColor: "#DDF2E9" },
  pill_warning: { backgroundColor: "#F9EAD3" },
  pill_danger: { backgroundColor: "#FBE5E4" },
  pill_dark: { backgroundColor: "#E2E2E2" },
  pillText: { fontSize: 9, fontWeight: "900" },
  pillText_neutral: { color: "#666666" },
  pillText_success: { color: "#276149" },
  pillText_warning: { color: "#9A5D0B" },
  pillText_danger: { color: "#A6332F" },
  pillText_dark: { color: "#333333" },
  mapCanvas: { height: 194, borderRadius: 17, overflow: "hidden", backgroundColor: "#E6E8E3", position: "relative" },
  mapRoad: { position: "absolute", backgroundColor: "#FFFFFF", opacity: 0.92, borderRadius: 4 },
  roadHorizontal: { height: 7, left: -20, right: -20, top: 88, transform: [{ rotate: "-8deg" }] },
  roadVertical: { width: 6, top: -18, bottom: -18, right: "39%", transform: [{ rotate: "21deg" }] },
  roadDiagonal: { height: 5, left: -28, right: -28, top: 142, transform: [{ rotate: "23deg" }] },
  mapCaption: { position: "absolute", top: 18, right: 21, color: "#929292", fontSize: 18, fontWeight: "900" },
  mapPin: { position: "absolute", width: 29, height: 29, borderRadius: 15, backgroundColor: "#4A4A4A", borderWidth: 3, borderColor: "#FFFFFF", justifyContent: "center", alignItems: "center" },
  pinOne: { top: "48%", right: "26%" },
  pinTwo: { top: "23%", left: "25%", backgroundColor: "#2F7A62" },
  pinThree: { bottom: "15%", right: "13%", backgroundColor: "#AA721D" },
  pinText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  mapLegend: { position: "absolute", left: 10, bottom: 10, backgroundColor: "#FFFFFFE8", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, flexDirection: "row-reverse", gap: 5, alignItems: "center" },
  legendDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: "#2F7A62" },
  legendText: { color: "#555555", fontSize: 9, fontWeight: "800" },
  mapFooter: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  mapFooterText: { color: "#8A8A8A", fontSize: 10, fontWeight: "700" },
  linkText: { color: "#4A4A4A", fontSize: 10, fontWeight: "900", textDecorationLine: "underline" },
  queueItem: { flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  itemAvatar: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  avatarAmber: { backgroundColor: "#F1D7B2" },
  avatarDark: { backgroundColor: "#DCDCDC" },
  avatarGreen: { backgroundColor: "#DDF2E9" },
  itemAvatarText: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
  itemCopy: { flex: 1 },
  itemTitle: { color: "#252525", fontSize: 12, fontWeight: "900", textAlign: "right" },
  itemDetail: { color: "#777777", fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#ECECEC" },
  activityCard: { backgroundColor: "#FFFFFF", borderRadius: 22, paddingHorizontal: 15 },
  activityRow: { minHeight: 66, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: "#ECECEC" },
  activityDot: { width: 9, height: 9, borderRadius: 9 },
  activityDot_green: { backgroundColor: "#2F7A62" },
  activityDot_amber: { backgroundColor: "#B45309" },
  activityDot_gray: { backgroundColor: "#A6A6A6" },
  activityTitle: { color: "#323232", fontSize: 12, fontWeight: "900", textAlign: "right" },
  activityDetail: { color: "#858585", fontSize: 10, textAlign: "right", marginTop: 3 },
  panelCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 16, gap: 14 },
  orderRow: { minHeight: 88, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12 },
  orderBorder: { borderBottomWidth: 1, borderBottomColor: "#ECECEC" },
  orderMeta: { flex: 1, gap: 3 },
  orderId: { color: "#4A4A4A", fontSize: 11, fontWeight: "900", textAlign: "right" },
  orderCustomer: { color: "#232323", fontSize: 13, fontWeight: "900", textAlign: "right" },
  orderRoute: { color: "#777777", fontSize: 10, textAlign: "right" },
  orderAction: { alignItems: "flex-end", gap: 7 },
  inlineButton: { paddingHorizontal: 8, paddingVertical: 4 },
  inlineButtonDisabled: { opacity: 0.5 },
  inlineButtonText: { color: "#4A4A4A", fontSize: 10, fontWeight: "900", textDecorationLine: "underline" },
  driverReview: { flexDirection: "row-reverse", alignItems: "center", gap: 11, padding: 13, borderRadius: 16, backgroundColor: "#F7F7F7" },
  driverPortrait: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#D6D6D6", alignItems: "center", justifyContent: "center" },
  driverPortraitText: { color: "#444444", fontSize: 16, fontWeight: "900" },
  documentGrid: { flexDirection: "row-reverse", gap: 9 },
  document: { flex: 1, minHeight: 106, borderWidth: 1, borderColor: "#E2E2E2", borderRadius: 16, padding: 12, alignItems: "flex-end", justifyContent: "center" },
  documentIcon: { color: "#A6A6A6", fontSize: 25 },
  documentTitle: { color: "#333333", fontSize: 11, fontWeight: "900", marginTop: 4, textAlign: "right" },
  documentDetail: { color: "#818181", fontSize: 9, marginTop: 3, textAlign: "right" },
  actionRow: { flexDirection: "row-reverse", gap: 9 },
  actionFlex: { flex: 1 },
  button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  button_dark: { backgroundColor: "#4A4A4A" },
  button_light: { backgroundColor: "#F1F1F1", borderWidth: 1, borderColor: "#D9D9D9" },
  button_success: { backgroundColor: "#2F7A62" },
  button_danger: { backgroundColor: "#B42318" },
  buttonText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  buttonText_dark: { color: "#FFFFFF" },
  buttonText_light: { color: "#4A4A4A" },
  buttonText_success: { color: "#FFFFFF" },
  buttonText_danger: { color: "#FFFFFF" },
  decisionNotice: { borderRadius: 16, padding: 13, backgroundColor: "#F6F6F6", gap: 7, alignItems: "flex-end" },
  decisionText: { color: "#686868", fontSize: 11, lineHeight: 16, textAlign: "right" },
  settlementTotal: { backgroundColor: "#414141", borderRadius: 19, padding: 19, alignItems: "flex-end" },
  settlementLabel: { color: "#E1E1E1", fontSize: 11, fontWeight: "800" },
  settlementValue: { color: "#FFFFFF", fontSize: 27, fontWeight: "900", marginTop: 3 },
  settlementDetail: { color: "#FFFFFFB3", fontSize: 10, marginTop: 6 },
  breakdown: { gap: 9, paddingHorizontal: 3 },
  breakdownRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  breakdownLabel: { color: "#777777", fontSize: 11, fontWeight: "700" },
  breakdownValue: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
  breakdownStrong: { color: "#171717", fontWeight: "900" },
  pdfBadge: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#FBE5E4", alignItems: "center", justifyContent: "center" },
  pdfText: { color: "#B42318", fontSize: 10, fontWeight: "900" },
  reportSummary: { backgroundColor: "#F6F6F6", borderRadius: 17, paddingVertical: 15, flexDirection: "row-reverse", justifyContent: "space-around", alignItems: "center" },
  reportBig: { color: "#252525", fontSize: 19, fontWeight: "900", textAlign: "center" },
  reportLabel: { color: "#777777", fontSize: 9, marginTop: 4, textAlign: "center" },
  reportDivider: { width: 1, height: 32, backgroundColor: "#DDDDDD" },
  reportInfo: { color: "#747474", fontSize: 11, lineHeight: 17, textAlign: "right" },
  localNote: { color: "#8A8A8A", fontSize: 9, lineHeight: 15, textAlign: "center", paddingHorizontal: 10, paddingTop: 1 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
