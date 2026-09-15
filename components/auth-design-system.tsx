import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { PropsWithChildren } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

const COLORS = {
  accent: "#24755E",
  accentSoft: "#EAF5EF",
  ink: "#21342A",
  muted: "#7B8C82",
  input: "#F4F7F5",
  line: "#E1EAE4",
  white: "#FFFFFF",
  danger: "#B42318",
};

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

export function AuthShell({ children }: PropsWithChildren) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="رجوع" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} hitSlop={8}>
        <MaterialIcons name="arrow-forward" size={20} color={COLORS.ink} />
      </Pressable>
      <View style={styles.headerBrand}>
        <View style={styles.logo}><Text style={styles.logoText}>O</Text></View>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export function AuthIntro({ title, copy }: { title: string; copy: string }) {
  return <View style={styles.intro}><Text style={styles.kicker}>OPTIMUS X</Text><Text style={styles.title}>{title}</Text><Text style={styles.copy}>{copy}</Text></View>;
}

export function AuthInput({ icon, error, rightAction, style, ...props }: TextInputProps & { icon: IconName; error?: string; rightAction?: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <View style={[styles.field, error && styles.fieldError]}>
        <MaterialIcons name={icon} size={20} color={error ? COLORS.danger : COLORS.accent} />
        <TextInput {...props} textAlign="right" placeholderTextColor="#829087" style={[styles.input, style]} />
        {rightAction}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function AuthPrimaryButton({ title, onPress, loading = false, disabled = false }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.primary, (disabled || loading) && styles.primaryDisabled, pressed && !disabled && styles.pressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{title}</Text>}</Pressable>;
}

export function AuthLink({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) {
  return <Pressable onPress={onPress} hitSlop={7} style={({ pressed }) => [styles.link, pressed && styles.pressed]}><Text style={styles.linkText}>{children}</Text></Pressable>;
}

export function AuthSection({ number, title, children }: PropsWithChildren<{ number: string; title: string }>) {
  return <View style={styles.section}><View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{number}</Text><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
}

export function VehicleOption({ icon, title, selected, onPress }: { icon: IconName; title: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.vehicle, selected && styles.vehicleSelected, pressed && styles.pressed]}><View style={[styles.vehicleIcon, selected && styles.vehicleIconSelected]}><MaterialIcons name={icon} size={22} color={COLORS.accent} /></View><Text style={[styles.vehicleText, selected && styles.vehicleTextSelected]}>{title}</Text>{selected ? <MaterialIcons name="check-circle" size={19} color={COLORS.accent} /> : null}</Pressable>;
}

export function AuthDocumentCard({ icon, title, detail, uri, onPress }: { icon: IconName; title: string; detail: string; uri?: string | null; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.document, uri && styles.documentSelected, pressed && styles.pressed]}>{uri ? <View style={styles.documentPreview}><Image source={{ uri }} style={styles.documentPreviewImage} contentFit="cover" /><View style={styles.documentCheck}><MaterialIcons name="check" size={15} color="#FFFFFF" /></View></View> : <View style={styles.documentIcon}><MaterialIcons name={icon} size={22} color={COLORS.accent} /></View>}<View style={styles.documentCopy}><Text style={styles.documentTitle}>{title}</Text><Text style={styles.documentDetail}>{uri ? "تمت الإضافة · اضغط للتغيير" : detail}</Text></View><MaterialIcons name={uri ? "edit" : "add"} size={19} color={COLORS.accent} /></Pressable>;
}

export function AuthConsent({ accepted, onToggle, onPolicy }: { accepted: boolean; onToggle: () => void; onPolicy: () => void }) {
  return <View style={styles.consent}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={onToggle} style={[styles.checkbox, accepted && styles.checkboxSelected]}><Text style={styles.check}>{accepted ? "✓" : ""}</Text></Pressable><Text style={styles.consentText}>أوافق على <Text onPress={onPolicy} style={styles.consentLink}>شروط الاستخدام وسياسة الخصوصية</Text> لتطبيق OPTIMUS X.</Text></View>;
}

export const authColors = COLORS;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F9F8" },
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 46, marginBottom: 24 },
  headerBrand: { flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  logo: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" },
  logoText: { color: COLORS.accent, fontSize: 19, fontWeight: "900" },
  headerTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "900" },
  headerSpacer: { width: 40 },
  back: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", shadowColor: "#1E3B2D", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  intro: { alignItems: "flex-end", marginBottom: 22 },
  kicker: { color: COLORS.accent, fontSize: 10, fontWeight: "900", marginBottom: 7 },
  title: { color: COLORS.ink, fontSize: 29, fontWeight: "900", textAlign: "right" },
  copy: { color: COLORS.muted, fontSize: 12, lineHeight: 19, fontWeight: "600", textAlign: "right", marginTop: 7 },
  fieldWrap: { marginBottom: 11 },
  field: { minHeight: 54, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 17, backgroundColor: COLORS.input, borderWidth: 1, borderColor: "transparent" },
  fieldError: { borderColor: "#E5B9B5", backgroundColor: "#FFF9F8" },
  input: { flex: 1, minHeight: 52, color: COLORS.ink, fontSize: 13, fontWeight: "700", paddingVertical: 0 },
  error: { color: COLORS.danger, fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 5 },
  primary: { minHeight: 54, borderRadius: 17, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", marginTop: 8, shadowColor: COLORS.accent, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  primaryDisabled: { opacity: 0.48 },
  primaryText: { color: COLORS.white, fontSize: 13, fontWeight: "900" },
  link: { alignSelf: "center", paddingVertical: 12 },
  linkText: { color: COLORS.accent, fontSize: 11, fontWeight: "900" },
  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 11 },
  sectionNumber: { color: COLORS.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  vehicle: { minHeight: 64, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, marginBottom: 9 },
  vehicleSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  vehicleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F6F3" },
  vehicleIconSelected: { backgroundColor: COLORS.white },
  vehicleText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "800", textAlign: "right" },
  vehicleTextSelected: { color: COLORS.accent },
  document: { minHeight: 74, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, marginBottom: 9 },
  documentSelected: { borderColor: "#B8DCC8", backgroundColor: "#F5FBF7" },
  documentIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accentSoft },
  documentPreview: { width: 42, height: 42, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accent },
  documentPreviewImage: { width: "100%", height: "100%" },
  documentCheck: { position: "absolute", right: 2, bottom: 2, width: 19, height: 19, borderRadius: 9.5, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accent },
  documentCopy: { flex: 1, alignItems: "flex-end" },
  documentTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900", textAlign: "right" },
  documentDetail: { color: COLORS.muted, fontSize: 10, fontWeight: "600", marginTop: 4, textAlign: "right" },
  consent: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, marginTop: 2, marginBottom: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: "#B8C8BF", backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  check: { color: COLORS.white, fontSize: 16, fontWeight: "900", lineHeight: 18 },
  consentText: { flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 18, fontWeight: "600", textAlign: "right" },
  consentLink: { color: COLORS.accent, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
