import MapView, { Marker } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";

import { HAMA_CENTER } from "@/shared/jarbou3";

export function HamaMap({ driver = false, compact = false }: { driver?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.map, compact && styles.mapCompact]}>
      <MapView style={styles.nativeMap} initialRegion={{ ...HAMA_CENTER, latitudeDelta: 0.075, longitudeDelta: 0.075 }}>
        <Marker coordinate={HAMA_CENTER} title={driver ? "سائق جربوع" : "جربوع في حماة"} description={driver ? "السائق في الطريق" : "نطاق الخدمة"} />
      </MapView>
      <View style={styles.badge}><Text style={styles.badgeText}>حماة فقط</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" },
  mapCompact: { height: 188 },
  nativeMap: { flex: 1 },
  badge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
});
