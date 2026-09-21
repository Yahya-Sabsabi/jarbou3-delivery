const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/components/jarbou3-app.tsx';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('if (stage === "choose")');
const end = source.indexOf('if (stage === "waiting")', start);
if (start < 0 || end < 0) throw new Error('choose screen boundaries not found');
const chooseReplacement = `if (stage === "choose") return <View style={styles.onboardingRoot}><View style={styles.chooseGlow} /><View style={styles.chooseGlowSecondary} /><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.chooseScroll}><View style={styles.chooseHeader}><View style={styles.chooseLogo}><Mark small /></View><Text style={styles.chooseBrand}>OPTIMUS X</Text><Text style={styles.chooseTagline}>منصة التوصيل الذكية في حماة</Text></View><View style={styles.chooseIntro}><Text style={styles.chooseKicker}>مرحباً بك في</Text><Text style={styles.chooseTitle}>توصيل أذكى. أسرع.</Text><Text style={styles.chooseCopy}>اختر طريقة استخدامك للمنصة</Text></View><View style={styles.roleOptions}><Pressable onPress={() => { haptic(); setRole("customer"); setPolicyAccepted(false); setStage("form"); }} style={({ pressed }) => [styles.roleOption, pressed && styles.choosePressed]}><View style={styles.roleIcon}><MaterialIcons name="person-outline" size={25} color="#55D9A5" /></View><View style={styles.roleCopy}><Text style={styles.roleOptionTitle}>أنا عميل</Text><Text style={styles.roleOptionDescription}>اطلب توصيلاً سريعاً وواضحاً</Text></View><MaterialIcons name="arrow-back-ios" size={17} color="#55D9A5" /></Pressable><Pressable onPress={() => { haptic(); setRole("driver"); setPolicyAccepted(false); setStage("form"); }} style={({ pressed }) => [styles.roleOption, pressed && styles.choosePressed]}><View style={[styles.roleIcon, styles.roleIconDriver]}><MaterialIcons name="two-wheeler" size={25} color="#55D9A5" /></View><View style={styles.roleCopy}><Text style={styles.roleOptionTitle}>أنا سفير</Text><Text style={styles.roleOptionDescription}>انضم إلى شبكة السفراء في حماة</Text></View><MaterialIcons name="arrow-back-ios" size={17} color="#55D9A5" /></Pressable></View><Text style={styles.chooseFooter}>تجربة موثوقة · خدمة محلية · دعم سريع</Text></ScrollView></View>;
  `;
source = source.slice(0, start) + chooseReplacement + source.slice(end);
const styles = [
  ['onboardingRoot: { flex: 1, backgroundColor: "#F7F9F8", justifyContent: "center", padding: 18, overflow: "hidden" }', 'onboardingRoot: { flex: 1, backgroundColor: "#070B0A", justifyContent: "center", padding: 18, overflow: "hidden" }'],
  ['chooseScroll: { flexGrow: 1, justifyContent: "space-between", paddingTop: 26, paddingBottom: 28, gap: 28 }', 'chooseScroll: { flexGrow: 1, justifyContent: "space-between", paddingTop: 30, paddingBottom: 26, gap: 24 }'],
  ['chooseGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#E4F2EA", top: -120, left: -86, opacity: 0.85 }', 'chooseGlow: { position: "absolute", width: 310, height: 310, borderRadius: 155, backgroundColor: "#123E32", top: -155, right: -112, opacity: 0.7 }'],
  ['chooseHeader: { alignItems: "center", gap: 4 }', 'chooseGlowSecondary: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "#0D2922", bottom: -100, left: -90, opacity: 0.9 }, chooseHeader: { alignItems: "center", gap: 5 }'],
  ['chooseLogo: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF", marginBottom: 4 }', 'chooseLogo: { width: 70, height: 70, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#F6FFFB", marginBottom: 6, shadowColor: "#55D9A5", shadowOpacity: 0.18, shadowRadius: 18, elevation: 4 }'],
  ['chooseBrand: { color: "#21342A", fontSize: 19, fontWeight: "900", letterSpacing: 1.4 }', 'chooseBrand: { color: "#F3FFF9", fontSize: 23, fontWeight: "900", letterSpacing: 2.2 }'],
  ['chooseTagline: { color: "#7B8C82", fontSize: 10, fontWeight: "700" }', 'chooseTagline: { color: "#8BA99D", fontSize: 11, fontWeight: "700" }'],
  ['chooseIntro: { alignItems: "flex-end", paddingTop: 16, paddingHorizontal: 3 }', 'chooseIntro: { alignItems: "flex-end", paddingTop: 22, paddingHorizontal: 3 }'],
  ['chooseKicker: { color: "#24755E", fontSize: 11, fontWeight: "900", marginBottom: 6 }', 'chooseKicker: { color: "#55D9A5", fontSize: 12, fontWeight: "900", marginBottom: 7 }'],
  ['chooseTitle: { color: "#21342A", fontSize: 31, fontWeight: "900", textAlign: "right" }', 'chooseTitle: { color: "#F3FFF9", fontSize: 31, fontWeight: "900", textAlign: "right" }'],
  ['chooseCopy: { color: "#78877F", fontSize: 13, fontWeight: "600", marginTop: 7, textAlign: "right" }', 'chooseCopy: { color: "#9BB5AA", fontSize: 13, fontWeight: "600", marginTop: 7, textAlign: "right" }'],
  ['roleOptions: { gap: 11 }', 'roleOptions: { gap: 13 }'],
  ['roleOption: { minHeight: 82, flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: 21, backgroundColor: "#FFFFFF", shadowColor: "#1E3B2D", shadowOpacity: 0.07, shadowRadius: 13, shadowOffset: { width: 0, height: 4 }', 'roleOption: { minHeight: 88, flexDirection: "row-reverse", alignItems: "center", gap: 13, paddingHorizontal: 15, borderRadius: 23, backgroundColor: "#111A17", borderWidth: 1, borderColor: "#234238", shadowColor: "#000000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }'],
  ['roleIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF" }', 'roleIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#15392F" }'],
  ['roleOptionTitle: { color: "#26382E", fontSize: 15, fontWeight: "900", textAlign: "right" }', 'roleOptionTitle: { color: "#F3FFF9", fontSize: 16, fontWeight: "900", textAlign: "right" }'],
  ['roleOptionDescription: { color: "#839189", fontSize: 10, fontWeight: "600", marginTop: 4, textAlign: "right" }', 'roleOptionDescription: { color: "#8BA99D", fontSize: 11, fontWeight: "600", marginTop: 4, textAlign: "right" }'],
];
for (const [oldValue, newValue] of styles) {
  if (!source.includes(oldValue)) throw new Error(`style not found: ${oldValue.slice(0, 40)}`);
  source = source.replace(oldValue, newValue);
}
const footerAnchor = 'roleOptionDescription: { color: "#8BA99D", fontSize: 11, fontWeight: "600", marginTop: 4, textAlign: "right" }';
source = source.replace(footerAnchor, `${footerAnchor}, chooseFooter: { color: "#6E9184", fontSize: 10, fontWeight: "700", textAlign: "center", letterSpacing: 0.5 }, choosePressed: { opacity: 0.78, transform: [{ scale: 0.985 }] }`);
fs.writeFileSync(path, source);
console.log('Rebranded onboarding role selection to the approved OPTIMUS X dark theme.');
