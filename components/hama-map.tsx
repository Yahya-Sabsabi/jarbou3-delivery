import { StyleSheet, Text, View } from "react-native";
import type { MapPoint } from "@/shared/jarbou3";

export type HamaMapProps = { compact?: boolean; driver?: boolean; source?: MapPoint | null; destination?: MapPoint | null; driverLocation?: MapPoint | null; routePath?: MapPoint[]; selecting?: "source" | "destination"; onSelect?: (point: MapPoint) => void; onOutsideRange?: () => void; readOnly?: boolean };

export function HamaMap({ compact = false, driverLocation }: HamaMapProps) {
  return (
    <View style={[styles.map, compact && styles.mapCompact]}>
      <View style={[styles.road, { top: "42%", transform: [{ rotate: "-18deg" }] }]} />
      <View style={[styles.road, { top: "62%", transform: [{ rotate: "31deg" }] }]} />
      <Text style={styles.city}>حماة</Text>
      <View style={[styles.dot, { left: "17%", bottom: "19%" }]} />
      <View style={[styles.dot, { left: "42%", bottom: "42%" }]} />
      <View style={[styles.dot, { left: "60%", bottom: "55%" }]} />
      <View style={[styles.dot, styles.target]} />
      {driverLocation ? <View style={styles.driver}><Text style={styles.driverText}>ج</Text></View> : null}
      <View style={styles.badge}><Text style={styles.badgeText}>حماة فقط</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" },
  mapCompact: { height: 188 },
  road: { position: "absolute", height: 4, left: -30, right: -30, backgroundColor: "#FFFFFF", opacity: 0.75 },
  city: { position: "absolute", top: 18, left: 20, color: "#747474", fontSize: 18, fontWeight: "900" },
  dot: { position: "absolute", width: 12, height: 12, borderRadius: 8, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#888888" },
  target: { width: 20, height: 20, borderRadius: 10, right: "12%", top: "20%", backgroundColor: "#2F7A62" },
  driver: { position: "absolute", top: "37%", left: "54%", width: 38, height: 38, borderRadius: 14, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#4A4A4A", justifyContent: "center", alignItems: "center" },
  driverText: { color: "#FFFFFF", fontWeight: "900", fontSize: 17 },
  badge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
});
