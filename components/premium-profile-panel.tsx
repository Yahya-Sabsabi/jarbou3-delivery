import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PremiumCustomerNav } from "@/components/premium-order-sheet";

type ProfileAction = { icon: keyof typeof MaterialIcons.glyphMap; title: string; description: string; onPress?: () => void; disabled?: boolean };

export function PremiumProfilePanel({ name, phone, onBack, onLogout, onOrders, onHome, onPolicy }: { name: string; phone?: string; onBack: () => void; onLogout: () => void; onOrders: () => void; onHome: () => void; onPolicy: () => void }) {
  const insets = useSafeAreaInsets();
  const actions: ProfileAction[] = [
    { icon: "receipt-long", title: "طلباتي", description: "عرض سجل طلباتك", onPress: onOrders },
    { icon: "bookmark-border", title: "العناوين المفضلة", description: "منزلك وعناوينك المحفوظة", disabled: true },
    { icon: "local-offer", title: "كوبونات الخصم", description: "الكوبونات المتاحة لحسابك", disabled: true },
    { icon: "notifications-none", title: "الإشعارات", description: "التنبيهات وتحديثات الطلبات", disabled: true },
    { icon: "support-agent", title: "الدعم والمساعدة", description: "نحن هنا لمساعدتك", onPress: onPolicy },
    { icon: "tune", title: "الإعدادات", description: "الخصوصية وشروط الاستخدام", onPress: onPolicy },
  ];
  return <View style={styles.root}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 104, 124) }]}>
      <View style={styles.headerRow}><Pressable accessibilityLabel="العودة من الملف الشخصي" onPress={onBack} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialIcons name="arrow-forward" size={21} color="#26332D" /></Pressable><Text style={styles.headerTitle}>الحساب</Text><View style={styles.headerSpacer} /></View>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.trim().charAt(0) || "م"}</Text></View>
        <View style={styles.identity}><Text numberOfLines={1} style={styles.name}>{name || "مستخدم OPTIMUS X"}</Text><Text numberOfLines={1} style={styles.contact}>{phone || "رقم الهاتف محفوظ في الحساب"}</Text><Text style={styles.role}>عميل OPTIMUS X</Text></View>
        <Pressable accessibilityLabel="تعديل الملف الشخصي" onPress={onPolicy} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}><MaterialIcons name="edit" size={17} color="#24755E" /></Pressable>
      </View>
      <View style={styles.statsRow}><Stat value="—" label="الطلبات" /><View style={styles.statDivider} /><Stat value="—" label="مكتملة" /><View style={styles.statDivider} /><Stat value="—" label="التقييم" /></View>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>مساحتك</Text><Text style={styles.sectionHint}>إدارة سريعة</Text></View>
      <View style={styles.menuGroup}>{actions.map((action, index) => <Pressable key={action.title} disabled={action.disabled} onPress={action.onPress} style={({ pressed }) => [styles.menuRow, action.disabled && styles.menuRowDisabled, pressed && !action.disabled && styles.menuPressed]}><View style={styles.menuIcon}><MaterialIcons name={action.icon} size={20} color={action.disabled ? "#AAB5AF" : "#24755E"} /></View><View style={styles.menuCopy}><Text style={[styles.menuTitle, action.disabled && styles.disabledText]}>{action.title}</Text><Text style={[styles.menuDescription, action.disabled && styles.disabledText]}>{action.description}</Text></View>{action.disabled ? <Text style={styles.soon}>قريباً</Text> : <MaterialIcons name="chevron-left" size={20} color="#A6B1AB" />}</Pressable>)}</View>
      <View style={styles.accountSection}><Text style={styles.sectionTitle}>الحساب</Text><Pressable onPress={onLogout} style={({ pressed }) => [styles.logoutRow, pressed && styles.menuPressed]}><View style={styles.logoutIcon}><MaterialIcons name="logout" size={19} color="#B42318" /></View><View style={styles.menuCopy}><Text style={styles.logoutTitle}>تسجيل الخروج</Text><Text style={styles.menuDescription}>مسح الجلسة من هذا الجهاز</Text></View><MaterialIcons name="chevron-left" size={20} color="#D1A19C" /></Pressable></View>
    </ScrollView>
    <PremiumCustomerNav active="profile" onHome={onHome} onOrders={onOrders} onProfile={() => undefined} />
  </View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F9F8" },
  content: { paddingHorizontal: 18, gap: 16 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#202B27", fontSize: 21, fontWeight: "900" },
  headerSpacer: { width: 42 },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", shadowColor: "#10231B", shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  hero: { position: "relative", overflow: "hidden", flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 17, borderRadius: 24, backgroundColor: "#EAF5EF" },
  heroGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75, top: -68, left: -28, backgroundColor: "#D3EBDD" },
  avatar: { width: 66, height: 66, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#24755E", borderWidth: 4, borderColor: "#FFFFFF" },
  avatarText: { color: "#FFFFFF", fontSize: 27, fontWeight: "900" },
  identity: { flex: 1, alignItems: "flex-end" },
  name: { maxWidth: "100%", color: "#1E2D26", fontSize: 18, fontWeight: "900" },
  contact: { maxWidth: "100%", color: "#687970", fontSize: 11, fontWeight: "700", marginTop: 3 },
  role: { color: "#24755E", fontSize: 10, fontWeight: "900", marginTop: 6 },
  editButton: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  statsRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 13, borderRadius: 18, backgroundColor: "#FFFFFF", shadowColor: "#10231B", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { color: "#26332D", fontSize: 17, fontWeight: "900" },
  statLabel: { color: "#87958E", fontSize: 10, fontWeight: "800" },
  statDivider: { width: 1, height: 26, backgroundColor: "#E7EDE9" },
  sectionHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  sectionTitle: { color: "#2D3B34", fontSize: 14, fontWeight: "900", textAlign: "right" },
  sectionHint: { color: "#8C9993", fontSize: 10, fontWeight: "700" },
  menuGroup: { overflow: "hidden", borderRadius: 19, backgroundColor: "#FFFFFF" },
  menuRow: { minHeight: 67, flexDirection: "row-reverse", alignItems: "center", gap: 11, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: "#EEF2EF" },
  menuRowDisabled: { opacity: 0.72 },
  menuPressed: { backgroundColor: "#F1F7F4" },
  menuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF" },
  menuCopy: { flex: 1, alignItems: "flex-end" },
  menuTitle: { color: "#2B3932", fontSize: 12, fontWeight: "900", textAlign: "right" },
  menuDescription: { color: "#8B9891", fontSize: 10, fontWeight: "600", textAlign: "right", marginTop: 3 },
  disabledText: { color: "#8F9A94" },
  soon: { color: "#A0ABA5", fontSize: 9, fontWeight: "800" },
  accountSection: { gap: 10, marginTop: 2 },
  logoutRow: { minHeight: 63, flexDirection: "row-reverse", alignItems: "center", gap: 11, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "#FFF8F7" },
  logoutIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FDEAE7" },
  logoutTitle: { color: "#B42318", fontSize: 12, fontWeight: "900", textAlign: "right" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
