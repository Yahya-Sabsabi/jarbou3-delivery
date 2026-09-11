import MapView, { Circle, Marker, Polyline, type Region } from "react-native-maps";
import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { HAMA_CENTER, HAMA_SERVICE_RADIUS_METERS, isInsideHama, type MapPoint } from "@/shared/jarbou3";

export type HamaMapProps = { compact?: boolean; driver?: boolean; source?: MapPoint | null; destination?: MapPoint | null; driverLocation?: MapPoint | null; routePath?: MapPoint[]; actualPath?: MapPoint[]; selecting?: "source" | "destination"; onSelect?: (point: MapPoint) => void; onOutsideRange?: () => void; readOnly?: boolean; focusPoint?: MapPoint | null };

function RunningMouse() {
  const bounce = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.parallel([
      Animated.sequence([Animated.timing(bounce, { toValue: -3, duration: 150, useNativeDriver: true }), Animated.timing(bounce, { toValue: 0, duration: 150, useNativeDriver: true })]),
      Animated.sequence([Animated.timing(tilt, { toValue: 1, duration: 150, useNativeDriver: true }), Animated.timing(tilt, { toValue: -1, duration: 150, useNativeDriver: true }), Animated.timing(tilt, { toValue: 0, duration: 150, useNativeDriver: true })]),
    ]));
    animation.start();
    return () => animation.stop();
  }, [bounce, tilt]);
  return <Animated.View style={[styles.mouseRunner, { transform: [{ translateY: bounce }, { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-7deg", "7deg"] }) }] }]}><Image source={require("@/assets/images/icon.png")} style={styles.mouseIcon} contentFit="cover" /></Animated.View>;
}

function Jarbou3Marker({ point, label, color, title, mouse = false }: { point: MapPoint; label: string; color: string; title: string; mouse?: boolean }) {
  return <Marker coordinate={point} title={title} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={mouse}><View style={[styles.marker, mouse && styles.mouseMarker, { backgroundColor: color }]}>{mouse ? <RunningMouse /> : <Text style={styles.markerText}>{label}</Text>}</View></Marker>;
}

export function HamaMap({ compact = false, source, destination, driverLocation, routePath, actualPath, selecting, onSelect, onOutsideRange, readOnly = false, focusPoint }: HamaMapProps) {
  const mapRef = useRef<MapView>(null);
  const displayedPath = actualPath && actualPath.length > 1 ? actualPath : routePath;
  useEffect(() => {
    if (!focusPoint) return;
    const region: Region = { latitude: focusPoint.latitude, longitude: focusPoint.longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 };
    mapRef.current?.animateToRegion(region, 450);
  }, [focusPoint?.latitude, focusPoint?.longitude]);
  return (
    <View style={[styles.map, compact && styles.mapCompact]}>
      <MapView ref={mapRef} mapType="standard" loadingEnabled style={styles.nativeMap} initialRegion={{ ...HAMA_CENTER, latitudeDelta: 0.14, longitudeDelta: 0.14 }} onPress={(event) => { const point = event.nativeEvent.coordinate; if (readOnly || !selecting) return; if (isInsideHama(point.latitude, point.longitude)) onSelect?.(point); else onOutsideRange?.(); }}>
        <Circle center={HAMA_CENTER} radius={HAMA_SERVICE_RADIUS_METERS} strokeColor="#757575" fillColor="#75757514" strokeWidth={1.5} />
        {displayedPath && displayedPath.length > 1 ? <Polyline coordinates={displayedPath} strokeColor={actualPath && actualPath.length > 1 ? "#24755E" : "#4A4A4A"} strokeWidth={actualPath && actualPath.length > 1 ? 5 : 4} lineDashPattern={actualPath && actualPath.length > 1 ? undefined : [1]} /> : null}
        {source ? <Jarbou3Marker point={source} label="ا" color="#4A4A4A" title="موقع الاستلام" /> : null}
        {destination ? <Jarbou3Marker point={destination} label="و" color="#2F7A62" title="وجهة التسليم" /> : null}
        {driverLocation ? <Jarbou3Marker point={driverLocation} label="ج" color="#FFFFFF" title="فأر جربوع · موقع السفير" mouse /> : null}
      </MapView>
      <View style={styles.badge}><Text style={styles.badgeText}>{actualPath && actualPath.length > 1 ? "مسار الفأر المباشر" : selecting === "source" ? "اختر الاستلام" : selecting === "destination" ? "اختر الوجهة" : "حماة · ٧ كم"}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" },
  mapCompact: { height: 188 },
  nativeMap: { flex: 1 },
  marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 5, elevation: 4 },
  mouseMarker: { width: 42, height: 42, borderRadius: 16, overflow: "hidden", borderColor: "#FFFFFF", backgroundColor: "#FFFFFF" },
  mouseRunner: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  mouseIcon: { width: 36, height: 36, borderRadius: 13 },
  markerText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  badge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
});
