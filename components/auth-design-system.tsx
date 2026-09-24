import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View } from "react-native";
import { KeyboardAwareScrollView } from "@/components/keyboard-aware";
import { useColors } from "@/hooks/use-colors";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

export function AuthShell({ children }: PropsWithChildren) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const compact = width < 360;
  // contentContainerStyle={styles.scroll} is intentionally retained through the responsive array below.
  return <KeyboardAwareScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.scroll, { backgroundColor: colors.background, paddingHorizontal: compact ? 14 : 18, paddingTop: Math.max(14, Math.min(28, height * 0.025)), paddingBottom: Math.max(28, height * 0.04) }]}>{children}</KeyboardAwareScrollView>;
}

export function AuthHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const colors = useColors();
  return <View style={styles.header}>
    <Pressable accessibilityLabel="رجوع" onPress={onBack} style={({ pressed }) => [styles.back, { backgroundColor: colors.surface, shadowColor: colors.foreground }, pressed && styles.pressed]} hitSlop={8}><MaterialIcons name="arrow-forward" size={20} color={colors.foreground} /></Pressable>
    <View style={styles.headerBrand}><Image source={require("@/assets/images/icon.png")} style={styles.logoImage} contentFit="contain" /><View><Text style={[styles.brandName, { color: colors.primary }]}>OPTIMUS X</Text><Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text></View></View>
    <View style={styles.headerSpacer} />
  </View>;
}

export function AuthIntro({ title, copy }: { title: string; copy: string }) {
  const colors = useColors();
  return <View style={styles.intro}><Text style={[styles.kicker, { color: colors.primary }]}>OPTIMUS X</Text><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text><Text style={[styles.copy, { color: colors.muted }]}>{copy}</Text></View>;
}

export function AuthInput({ icon, error, rightAction, style, ...props }: TextInputProps & { icon: IconName; error?: string; rightAction?: React.ReactNode }) {
  const colors = useColors();
  return <View style={styles.fieldWrap}><View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }, error && styles.fieldError]}><MaterialIcons name={icon} size={20} color={error ? colors.error : colors.primary} /><TextInput {...props} textAlign="right" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground }, style]} />{rightAction}</View>{error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}</View>;
}

export function AuthPrimaryButton({ title, onPress, loading = false, disabled = false }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, shadowColor: colors.primary }, (disabled || loading) && styles.primaryDisabled, pressed && !disabled && styles.pressed]}>{loading ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryText, { color: colors.background }]}>{title}</Text>}</Pressable>;
}

export function AuthLink({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) {
  const colors = useColors();
  return <Pressable onPress={onPress} hitSlop={7} style={({ pressed }) => [styles.link, pressed && styles.pressed]}><Text style={[styles.linkText, { color: colors.primary }]}>{children}</Text></Pressable>;
}

export function AuthSection({ number, title, children }: PropsWithChildren<{ number: string; title: string }>) {
  const colors = useColors();
  return <View style={styles.section}><View style={styles.sectionHeader}><Text style={[styles.sectionNumber, { color: colors.primary }]}>{number}</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>{children}</View>;
}

export function VehicleOption({ icon, title, selected, onPress }: { icon: IconName; title: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.vehicle, { borderColor: colors.border, backgroundColor: colors.surface }, selected && { borderColor: colors.primary, backgroundColor: colors.primary + "22" }, pressed && styles.pressed]}><View style={[styles.vehicleIcon, { backgroundColor: colors.background }]}><MaterialIcons name={icon} size={22} color={colors.primary} /></View><Text style={[styles.vehicleText, { color: colors.foreground }, selected && { color: colors.primary }]}>{title}</Text>{selected ? <MaterialIcons name="check-circle" size={19} color={colors.primary} /> : null}</Pressable>;
}

export function AuthDocumentCard({ icon, title, detail, uri, onPress }: { icon: IconName; title: string; detail: string; uri?: string | null; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.document, { borderColor: colors.border, backgroundColor: colors.surface }, uri && { borderColor: colors.primary, backgroundColor: colors.primary + "18" }, pressed && styles.pressed]}>{uri ? <View style={[styles.documentPreview, { backgroundColor: colors.primary }]}><Image source={{ uri }} style={styles.documentPreviewImage} contentFit="cover" /><View style={[styles.documentCheck, { backgroundColor: colors.primary }]}><MaterialIcons name="check" size={15} color={colors.background} /></View></View> : <View style={[styles.documentIcon, { backgroundColor: colors.primary + "20" }]}><MaterialIcons name={icon} size={22} color={colors.primary} /></View>}<View style={styles.documentCopy}><Text style={[styles.documentTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.documentDetail, { color: colors.muted }]}>{uri ? "تمت الإضافة · اضغط للتغيير" : detail}</Text></View><MaterialIcons name={uri ? "edit" : "add"} size={19} color={colors.primary} /></Pressable>;
}

export function AuthConsent({ accepted, onToggle, onPolicy }: { accepted: boolean; onToggle: () => void; onPolicy: () => void }) {
  const colors = useColors();
  return <View style={styles.consent}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={onToggle} style={[styles.checkbox, { borderColor: colors.border, backgroundColor: colors.surface }, accepted && { backgroundColor: colors.primary, borderColor: colors.primary }]}><Text style={styles.check}>{accepted ? "✓" : ""}</Text></Pressable><Text style={[styles.consentText, { color: colors.muted }]}>أوافق على <Text onPress={onPolicy} style={[styles.consentLink, { color: colors.primary }]}>شروط الاستخدام وسياسة الخصوصية</Text> لتطبيق OPTIMUS X.</Text></View>;
}

export const authColors = { accent: "#55C49A", accentSoft: "#1D3A31", ink: "#FFF7ED", muted: "#B6C8C1", input: "#172321", line: "#2D403A", white: "#FFF7ED", danger: "#FF8D8D" };

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 52, marginBottom: 24 },
  headerBrand: { flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  logoImage: { width: 48, height: 48, borderRadius: 15 },
  brandName: { fontSize: 10, fontWeight: "900", letterSpacing: 1, textAlign: "right" },
  headerTitle: { fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 2 },
  headerSpacer: { width: 40 },
  back: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  intro: { alignItems: "flex-end", marginBottom: 22 },
  kicker: { fontSize: 10, fontWeight: "900", marginBottom: 7, letterSpacing: 1 },
  title: { fontSize: 29, fontWeight: "900", textAlign: "right" },
  copy: { fontSize: 12, lineHeight: 19, fontWeight: "600", textAlign: "right", marginTop: 7 },
  fieldWrap: { marginBottom: 11 },
  field: { minHeight: 54, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1 },
  fieldError: { borderColor: "#B45A5A" },
  input: { flex: 1, minHeight: 52, fontSize: 13, fontWeight: "700", paddingVertical: 0 },
  error: { fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 5 },
  primary: { minHeight: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", marginTop: 8, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  primaryDisabled: { opacity: 0.48 },
  primaryText: { fontSize: 13, fontWeight: "900" },
  link: { alignSelf: "center", paddingVertical: 12 },
  linkText: { fontSize: 11, fontWeight: "900" },
  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 11 },
  sectionNumber: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "900" },
  vehicle: { minHeight: 64, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, marginBottom: 9 },
  vehicleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  vehicleText: { flex: 1, fontSize: 12, fontWeight: "800", textAlign: "right" },
  document: { minHeight: 74, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, marginBottom: 9 },
  documentIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  documentPreview: { width: 42, height: 42, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  documentPreviewImage: { width: "100%", height: "100%" },
  documentCheck: { position: "absolute", right: 2, bottom: 2, width: 19, height: 19, borderRadius: 9.5, alignItems: "center", justifyContent: "center" },
  documentCopy: { flex: 1, alignItems: "flex-end" },
  documentTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" },
  documentDetail: { fontSize: 10, fontWeight: "600", marginTop: 4, textAlign: "right" },
  consent: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, marginTop: 2, marginBottom: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  check: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", lineHeight: 18 },
  consentText: { flex: 1, fontSize: 10, lineHeight: 18, fontWeight: "600", textAlign: "right" },
  consentLink: { fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});

export { styles as authStyles };
