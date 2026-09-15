import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { formatSyp, type MapPoint } from "@/shared/jarbou3";
import type { RouteEstimate } from "@/lib/osrm";

type AddressResult = { label: string; latitude: number; longitude: number; kind: "shop" | "street" | "place" };
type FavoriteAddress = { id: string; label: string; address: string; latitude: number | string; longitude: number | string };

type PremiumOrderSheetProps = {
  source: MapPoint | null;
  destination: MapPoint | null;
  selecting: "source" | "destination";
  onSelectMode: (mode: "source" | "destination") => void;
  locationNotice: string | null;
  onDismissNotice: () => void;
  addressQuery: string;
  onAddressQueryChange: (value: string) => void;
  searchingAddress: boolean;
  onSearch: () => void;
  addressResults: AddressResult[];
  onChooseAddress: (result: AddressResult) => void;
  favoriteAddresses: FavoriteAddress[];
  onChooseFavorite: (favorite: FavoriteAddress) => void;
  onDeleteFavorite: (id: string) => void;
  favoriteLabel: string;
  onFavoriteLabelChange: (value: string) => void;
  onSaveFavorite: () => void;
  savingFavorite: boolean;
  discountCode: string;
  onDiscountCodeChange: (value: string) => void;
  onVerifyDiscount: () => void;
  discountFetching: boolean;
  discountExpanded: boolean;
  onToggleDiscount: () => void;
  onOpenFavorites: () => void;
  appliedDiscount: { discountAmount: number; finalPrice: number } | null;
  route: RouteEstimate | null;
  routeLoading: boolean;
  payment: "نقدي" | "شام كاش";
  onPaymentChange: (payment: "نقدي" | "شام كاش") => void;
  onSubmit: () => void;
  submitting: boolean;
};

function LocationRow({ icon, title, value, active, onPress }: { icon: "radio-button-checked" | "location-on"; title: string; value: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.locationRow, active && styles.locationRowActive, pressed && styles.pressed]}>
    <View style={[styles.locationIcon, active && styles.locationIconActive]}><MaterialIcons name={icon} size={17} color={active ? "#24755E" : "#83918B"} /></View>
    <View style={styles.flex}><Text style={styles.locationTitle}>{title}</Text><Text numberOfLines={1} style={styles.locationValue}>{value}</Text></View>
    <MaterialIcons name="chevron-left" size={20} color="#A0AAA5" />
  </Pressable>;
}

export function PremiumOrderSheet({ source, destination, selecting, onSelectMode, locationNotice, onDismissNotice, addressQuery, onAddressQueryChange, searchingAddress, onSearch, addressResults, onChooseAddress, favoriteAddresses, onChooseFavorite, onDeleteFavorite, favoriteLabel, onFavoriteLabelChange, onSaveFavorite, savingFavorite, discountCode, onDiscountCodeChange, onVerifyDiscount, discountFetching, discountExpanded, onToggleDiscount, onOpenFavorites, appliedDiscount, route, routeLoading, payment, onPaymentChange, onSubmit, submitting }: PremiumOrderSheetProps) {
  const distance = route ? `${(route.distanceM / 1000).toFixed(1)} كم` : "—";
  const eta = route ? `${Math.max(1, Math.round(route.durationSeconds / 60))} دقيقة` : "—";
  const price = route ? formatSyp(appliedDiscount?.finalPrice ?? route.price) : "—";
  const sourceLabel = source ? "موقع الاستلام محدد" : "حرّك الخريطة أو اضغط لاختيار الاستلام";
  const destinationLabel = destination ? "وجهة التسليم محددة" : "أين تريد التوصيل؟";

  return <View style={styles.container}>
    <View style={styles.compactHeader}>
      <View style={styles.statusDot} />
      <View style={styles.flex}><Text style={styles.eyebrow}>طلب توصيل</Text><Text style={styles.title}>جاهز لتحديد رحلتك</Text></View>
      <Text style={styles.price}>{price}</Text>
    </View>
    <View style={styles.metricsRow}>
      <View style={styles.metric}><Text style={styles.metricValue}>{distance}</Text><Text style={styles.metricLabel}>المسافة</Text></View>
      <View style={styles.metricDivider} />
      <View style={styles.metric}><Text style={styles.metricValue}>{routeLoading ? "…" : eta}</Text><Text style={styles.metricLabel}>الوقت المتوقع</Text></View>
      <View style={styles.metricDivider} />
      <View style={styles.metric}><Text style={styles.metricValue}>{price}</Text><Text style={styles.metricLabel}>السعر</Text></View>
    </View>
    <View style={styles.locationStack}>
      <LocationRow icon="radio-button-checked" title="الاستلام" value={sourceLabel} active={selecting === "source"} onPress={() => onSelectMode("source")} />
      <View style={styles.routeConnector} />
      <LocationRow icon="location-on" title="الوجهة" value={destinationLabel} active={selecting === "destination"} onPress={() => onSelectMode("destination")} />
    </View>
    <View style={styles.quickRow}>
      <Pressable onPress={onToggleDiscount} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><MaterialIcons name="local-offer" size={18} color="#24755E" /><Text style={styles.quickText}>كود خصم</Text></Pressable>
      <Pressable onPress={onOpenFavorites} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><MaterialIcons name="bookmark-border" size={19} color="#24755E" /><Text style={styles.quickText}>عناويني</Text></Pressable>
    </View>
    <View style={styles.detailsDivider} />
    {locationNotice ? <Pressable onPress={onDismissNotice} style={styles.notice}><Text style={styles.noticeText}>{locationNotice}</Text><MaterialIcons name="close" size={17} color="#7A4B21" /></Pressable> : null}
    <View style={styles.modeRow}><Text style={styles.sectionLabel}>اختر نقاط الرحلة</Text><View style={styles.modePills}><Pressable onPress={() => onSelectMode("source")} style={[styles.modePill, selecting === "source" && styles.modePillActive]}><Text style={[styles.modePillText, selecting === "source" && styles.modePillTextActive]}>استلام</Text></Pressable><Pressable onPress={() => onSelectMode("destination")} style={[styles.modePill, selecting === "destination" && styles.modePillActive]}><Text style={[styles.modePillText, selecting === "destination" && styles.modePillTextActive]}>وجهة</Text></Pressable></View></View>
    <View style={styles.searchRow}><TextInput value={addressQuery} onChangeText={onAddressQueryChange} onSubmitEditing={onSearch} returnKeyType="search" placeholder="ابحث عن حي أو شارع أو متجر" placeholderTextColor="#9AA49F" style={styles.searchInput} textAlign="right" /><Pressable onPress={onSearch} style={styles.searchButton}><MaterialIcons name="search" size={19} color="#FFFFFF" /></Pressable></View>
    {addressResults.length ? <View style={styles.results}>{addressResults.slice(0, 5).map((result) => <Pressable key={`${result.latitude}-${result.longitude}`} onPress={() => onChooseAddress(result)} style={styles.resultRow}><View style={styles.resultIcon}><MaterialIcons name={result.kind === "shop" ? "storefront" : "place"} size={17} color="#24755E" /></View><Text numberOfLines={2} style={styles.resultText}>{result.label}</Text><MaterialIcons name="north-west" size={16} color="#9AA49F" /></Pressable>)}</View> : addressQuery.trim().length >= 2 && !searchingAddress ? <Text style={styles.emptyHint}>لا توجد اقتراحات مطابقة داخل حماة.</Text> : null}
    {discountExpanded ? <View style={styles.inlineSection}><View style={styles.sectionHeader}><Text style={styles.sectionLabel}>رمز الخصم</Text><Pressable onPress={onToggleDiscount}><MaterialIcons name="close" size={18} color="#8A9891" /></Pressable></View><View style={styles.discountRow}><TextInput value={discountCode} onChangeText={onDiscountCodeChange} autoCapitalize="characters" placeholder="مثال: JARBOU3" placeholderTextColor="#9AA49F" style={styles.discountInput} textAlign="right" /><Pressable onPress={onVerifyDiscount} style={styles.verifyButton}><Text style={styles.verifyText}>{discountFetching ? "…" : "تحقق"}</Text></Pressable></View>{appliedDiscount ? <Text style={styles.successText}>تم تطبيق الخصم وتوفير {formatSyp(appliedDiscount.discountAmount)}</Text> : null}</View> : null}
    <View style={styles.inlineSection}><View style={styles.sectionHeader}><Text style={styles.sectionLabel}>الدفع</Text><Text style={styles.sectionHint}>اختر الطريقة</Text></View><View style={styles.paymentRow}>{(["نقدي", "شام كاش"] as const).map((method) => <Pressable key={method} onPress={() => onPaymentChange(method)} style={[styles.paymentPill, payment === method && styles.paymentPillActive]}><Text style={[styles.paymentText, payment === method && styles.paymentTextActive]}>{method}</Text></Pressable>)}</View></View>
    <View style={styles.favoriteSave}><View style={styles.sectionHeader}><Text style={styles.sectionLabel}>حفظ الموقع الحالي</Text><MaterialIcons name="bookmark-add" size={18} color="#24755E" /></View><View style={styles.discountRow}><TextInput value={favoriteLabel} onChangeText={onFavoriteLabelChange} placeholder="مثال: المنزل" placeholderTextColor="#9AA49F" style={styles.discountInput} textAlign="right" /><Pressable onPress={onSaveFavorite} style={styles.lightButton}><Text style={styles.lightButtonText}>{savingFavorite ? "…" : "حفظ"}</Text></Pressable></View></View>
    <Pressable onPress={onSubmit} disabled={submitting} style={({ pressed }) => [styles.confirmButton, pressed && styles.confirmPressed]}><Text style={styles.confirmText}>{submitting ? "جارٍ إنشاء الطلب…" : "تأكيد الطلب"}</Text><Text style={styles.confirmPrice}>{price}</Text><MaterialIcons name="arrow-back" size={20} color="#FFFFFF" /></Pressable>
  </View>;
}

const styles = {
  container: { gap: 12, paddingTop: 4, paddingBottom: 14 },
  flex: { flex: 1 },
  compactHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#24755E", shadowColor: "#24755E", shadowOpacity: 0.35, shadowRadius: 6 },
  eyebrow: { color: "#82908A", fontSize: 11, fontWeight: "700", textAlign: "right" },
  title: { color: "#202B27", fontSize: 18, fontWeight: "900", marginTop: 2, textAlign: "right" },
  price: { color: "#24755E", fontSize: 16, fontWeight: "900" },
  metricsRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around", paddingVertical: 8, backgroundColor: "#F4F7F5", borderRadius: 17 },
  metric: { flex: 1, alignItems: "center", gap: 2 },
  metricValue: { color: "#27332E", fontSize: 13, fontWeight: "900" },
  metricLabel: { color: "#82908A", fontSize: 10, fontWeight: "700" },
  metricDivider: { width: 1, height: 24, backgroundColor: "#DDE5E0" },
  locationStack: { paddingTop: 2 },
  locationRow: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 10, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E6ECE8" },
  locationRowActive: { borderColor: "#A8CDBE", backgroundColor: "#F6FBF8" },
  locationIcon: { width: 29, height: 29, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F4F1" },
  locationIconActive: { backgroundColor: "#E1F1EA" },
  locationTitle: { color: "#7D8983", fontSize: 10, fontWeight: "800", textAlign: "right" },
  locationValue: { color: "#26322D", fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 2 },
  routeConnector: { width: 1, height: 8, backgroundColor: "#C8D7CF", alignSelf: "flex-end", marginRight: 24 },
  quickRow: { flexDirection: "row-reverse", gap: 8 },
  quickAction: { flexDirection: "row-reverse", alignItems: "center", gap: 7, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 13, backgroundColor: "#F1F7F4" },
  quickText: { color: "#24755E", fontSize: 11, fontWeight: "900" },
  detailsDivider: { height: 1, backgroundColor: "#E9EEEB", marginVertical: 2 },
  notice: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: "#FFF5E9", borderRadius: 13, padding: 11 },
  noticeText: { flex: 1, color: "#7A4B21", fontSize: 11, fontWeight: "700", lineHeight: 17, textAlign: "right" },
  modeRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  modePills: { flexDirection: "row-reverse", gap: 6 },
  modePill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, backgroundColor: "#F0F3F1" },
  modePillActive: { backgroundColor: "#24755E" },
  modePillText: { color: "#65736C", fontSize: 10, fontWeight: "800" },
  modePillTextActive: { color: "#FFFFFF" },
  sectionLabel: { color: "#34423B", fontSize: 12, fontWeight: "900", textAlign: "right" },
  sectionHint: { color: "#8B9891", fontSize: 10, fontWeight: "700" },
  searchRow: { flexDirection: "row-reverse", gap: 8 },
  searchInput: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: "#F5F7F6", paddingHorizontal: 13, color: "#26322D", fontSize: 12, fontWeight: "700" },
  searchButton: { width: 46, minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#24755E" },
  results: { gap: 6 },
  resultRow: { flexDirection: "row-reverse", alignItems: "center", gap: 9, padding: 10, borderRadius: 14, backgroundColor: "#F8FAF8" },
  resultIcon: { width: 29, height: 29, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E2F0E9" },
  resultText: { flex: 1, color: "#35423C", fontSize: 11, fontWeight: "700", textAlign: "right" },
  emptyHint: { color: "#89968F", fontSize: 11, textAlign: "right" },
  inlineSection: { gap: 9, padding: 12, borderRadius: 16, backgroundColor: "#F7F9F8" },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  discountRow: { flexDirection: "row-reverse", gap: 8 },
  discountInput: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0E8E3", paddingHorizontal: 11, color: "#26322D", fontSize: 12, fontWeight: "800" },
  verifyButton: { minWidth: 64, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#24755E" },
  verifyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  successText: { color: "#24755E", fontSize: 10, fontWeight: "800", textAlign: "right" },
  paymentRow: { flexDirection: "row-reverse", gap: 8 },
  paymentPill: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0E8E3" },
  paymentPillActive: { borderColor: "#24755E", backgroundColor: "#E8F4EE" },
  paymentText: { color: "#64726A", fontSize: 11, fontWeight: "800" },
  paymentTextActive: { color: "#24755E" },
  favoriteSave: { gap: 9, padding: 12, borderRadius: 16, backgroundColor: "#F7F9F8" },
  lightButton: { minWidth: 64, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E1F1EA" },
  lightButtonText: { color: "#24755E", fontSize: 11, fontWeight: "900" },
  confirmButton: { minHeight: 54, borderRadius: 17, paddingHorizontal: 15, flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#24755E", shadowColor: "#24755E", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  confirmText: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "900", textAlign: "right" },
  confirmPrice: { color: "#DDF3E8", fontSize: 12, fontWeight: "900" },
  confirmPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  pressed: { opacity: 0.72 },
} as const;

export function PremiumMoreMenu({ visible, onClose, onDiscount, onFavorites }: { visible: boolean; onClose: () => void; onDiscount: () => void; onFavorites: () => void }) {
  if (!visible) return null;
  return <View style={menuStyles.wrap} testID="premium-more-menu">
    <Pressable onPress={onDiscount} style={({ pressed }) => [menuStyles.item, pressed && menuStyles.itemPressed]}><MaterialIcons name="local-offer" size={18} color="#24755E" /><Text style={menuStyles.itemText}>إضافة كود خصم</Text></Pressable>
    <Pressable onPress={onFavorites} style={({ pressed }) => [menuStyles.item, pressed && menuStyles.itemPressed]}><MaterialIcons name="bookmark-border" size={19} color="#24755E" /><Text style={menuStyles.itemText}>العناوين المفضلة</Text></Pressable>
    <Pressable onPress={onClose} style={({ pressed }) => [menuStyles.item, pressed && menuStyles.itemPressed]}><MaterialIcons name="close" size={18} color="#82908A" /><Text style={menuStyles.itemTextMuted}>إغلاق</Text></Pressable>
  </View>;
}

const menuStyles = StyleSheet.create({
  wrap: { position: "absolute", top: 72, left: 16, zIndex: 40, minWidth: 190, padding: 7, borderRadius: 17, backgroundColor: "#FFFFFF", shadowColor: "#10231B", shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 11, paddingVertical: 11, borderRadius: 12 },
  itemPressed: { backgroundColor: "#F1F7F4" },
  itemText: { flex: 1, color: "#2A3831", fontSize: 12, fontWeight: "800", textAlign: "right" },
  itemTextMuted: { flex: 1, color: "#82908A", fontSize: 11, fontWeight: "700", textAlign: "right" },
  favoritesWrap: { position: "absolute", top: 72, right: 16, zIndex: 41, width: 270, padding: 12, borderRadius: 18, backgroundColor: "#FFFFFF", shadowColor: "#10231B", shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  favoritesHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#EDF1EE" },
  favoritesTitle: { color: "#2A3831", fontSize: 13, fontWeight: "900", textAlign: "right" },
  favoriteRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F0F3F1" },
  favoriteMain: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  favoriteCopy: { flex: 1 },
  favoriteLabel: { color: "#2A3831", fontSize: 11, fontWeight: "900", textAlign: "right" },
  favoriteAddress: { color: "#8A9891", fontSize: 10, textAlign: "right", marginTop: 2 },
  emptyFavorites: { color: "#8A9891", fontSize: 11, textAlign: "right", paddingVertical: 12 },
  addFavorite: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 11 },
  addFavoriteText: { color: "#24755E", fontSize: 11, fontWeight: "900" },
});

export function PremiumFavoritesMenu({ visible, favorites, onChoose, onDelete, onAdd, onClose }: { visible: boolean; favorites: FavoriteAddress[]; onChoose: (favorite: FavoriteAddress) => void; onDelete: (id: string) => void; onAdd: () => void; onClose: () => void }) {
  if (!visible) return null;
  return <View style={menuStyles.favoritesWrap} testID="premium-favorites-menu"><View style={menuStyles.favoritesHeader}><Text style={menuStyles.favoritesTitle}>العناوين المفضلة</Text><Pressable onPress={onClose}><MaterialIcons name="close" size={18} color="#82908A" /></Pressable></View>{favorites.length ? favorites.slice(0, 4).map((favorite) => <View key={favorite.id} style={menuStyles.favoriteRow}><Pressable onPress={() => onChoose(favorite)} style={menuStyles.favoriteMain}><MaterialIcons name={favorite.label.includes("عمل") ? "work-outline" : "home-work"} size={18} color="#24755E" /><View style={menuStyles.favoriteCopy}><Text style={menuStyles.favoriteLabel}>{favorite.label}</Text><Text numberOfLines={1} style={menuStyles.favoriteAddress}>{favorite.address}</Text></View></Pressable><Pressable onPress={() => onDelete(favorite.id)} hitSlop={7}><MaterialIcons name="close" size={16} color="#A2ADA7" /></Pressable></View>) : <Text style={menuStyles.emptyFavorites}>لم تضف عناوين بعد.</Text>}<Pressable onPress={onAdd} style={menuStyles.addFavorite}><MaterialIcons name="add" size={18} color="#24755E" /><Text style={menuStyles.addFavoriteText}>إضافة عنوان</Text></Pressable></View>;
}

export function PremiumCustomerNav({ active, onHome, onOrders, onProfile }: { active: "home" | "orders" | "profile"; onHome: () => void; onOrders: () => void; onProfile: () => void }) {
  return <View style={navStyles.bar}>
    <Pressable onPress={onProfile} style={navStyles.item}><MaterialIcons name="person-outline" size={22} color={active === "profile" ? "#24755E" : "#95A19B"} /><Text style={[navStyles.label, active === "profile" && navStyles.activeLabel]}>الحساب</Text></Pressable>
    <Pressable onPress={onOrders} style={navStyles.item}><MaterialIcons name="receipt-long" size={22} color={active === "orders" ? "#24755E" : "#95A19B"} /><Text style={[navStyles.label, active === "orders" && navStyles.activeLabel]}>الطلبات</Text></Pressable>
    <Pressable onPress={onHome} style={navStyles.item}><MaterialIcons name="home-filled" size={22} color={active === "home" ? "#24755E" : "#95A19B"} /><Text style={[navStyles.label, active === "home" && navStyles.activeLabel]}>الرئيسية</Text></Pressable>
  </View>;
}

const navStyles = StyleSheet.create({
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around", marginHorizontal: 16, marginTop: 10, paddingVertical: 9, paddingBottom: 10, borderRadius: 22, backgroundColor: "#FFFFFF", shadowColor: "#10231B", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  item: { minWidth: 76, alignItems: "center", gap: 3, paddingVertical: 3 },
  label: { color: "#95A19B", fontSize: 10, fontWeight: "800" },
  activeLabel: { color: "#24755E" },
});

export const premiumOrderStyles = StyleSheet.create(styles);
