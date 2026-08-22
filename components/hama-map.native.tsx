import MapView, { Circle, Marker, Polyline, UrlTile } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";

import { HAMA_CENTER, HAMA_SERVICE_RADIUS_METERS, isInsideHama, type MapPoint } from "@/shared/jarbou3";

export type HamaMapProps = { compact?: boolean; driver?: boolean; source?: MapPoint | null; destination?: MapPoint | null; driverLocation?: MapPoint | null; routePath?: MapPoint[]; selecting?: "source" | "destination"; onSelect?: (point: MapPoint) => void; onOutsideRange?: () => void; readOnly?: boolean };

function Jarbou3Marker({ point, label, color, title }: { point: MapPoint; label: string; color: string; title: string }) {
  return <Marker coordinate={point} title={title} anchor={{ x: 0.5, y: 0.5 }}><View style={[styles.marker, { backgroundColor: color }]}><Text style={styles.markerText}>{label}</Text></View></Marker>;
}

export function HamaMap({ compact = false, source, destination, driverLocation, routePath, selecting, onSelect, onOutsideRange, readOnly = false }: HamaMapProps) {
  return (
    <View style={[styles.map, compact && styles.mapCompact]}>
      <MapView mapType="none" style={styles.nativeMap} initialRegion={{ ...HAMA_CENTER, latitudeDelta: 0.14, longitudeDelta: 0.14 }} onPress={(event) => { const point = event.nativeEvent.coordinate; if (readOnly || !selecting) return; if (isInsideHama(point.latitude, point.longitude)) onSelect?.(point); else onOutsideRange?.(); }}>
        <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={18} flipY={false} zIndex={0} />
        <Circle center={HAMA_CENTER} radius={HAMA_SERVICE_RADIUS_METERS} strokeColor="#757575" fillColor="#75757514" strokeWidth={1.5} />
        {routePath && routePath.length > 1 ? <Polyline coordinates={routePath} strokeColor="#4A4A4A" strokeWidth={4} lineDashPattern={[1]} /> : null}
        {source ? <Jarbou3Marker point={source} label="ا" color="#4A4A4A" title="موقع الاستلام" /> : null}
        {destination ? <Jarbou3Marker point={destination} label="و" color="#2F7A62" title="وجهة التسليم" /> : null}
        {driverLocation ? <Jarbou3Marker point={driverLocation} label="ج" color="#757575" title="سائق جربوع" /> : null}
      </MapView>
      <View style={styles.badge}><Text style={styles.badgeText}>{selecting === "source" ? "اختر الاستلام" : selecting === "destination" ? "اختر الوجهة" : "حماة · ٧ كم"}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" },
  mapCompact: { height: 188 },
  nativeMap: { flex: 1 },
  marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 5, elevation: 4 },
  markerText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  badge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
});
