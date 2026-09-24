import { useEffect, useRef, useState } from "react";
import { Animated, type GestureResponderEvent, Image, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { HAMA_BOUNDS, type MapPoint } from "@/shared/jarbou3";

export type HamaMapProps = { compact?: boolean; driver?: boolean; source?: MapPoint | null; destination?: MapPoint | null; driverLocation?: MapPoint | null; routePath?: MapPoint[]; actualPath?: MapPoint[]; selecting?: "source" | "destination"; onSelect?: (point: MapPoint) => void; onOutsideRange?: () => void; readOnly?: boolean };

function project(point: MapPoint) {
  return {
    left: Math.max(4, Math.min(96, ((point.longitude - HAMA_BOUNDS.minLongitude) / (HAMA_BOUNDS.maxLongitude - HAMA_BOUNDS.minLongitude)) * 100)),
    bottom: Math.max(5, Math.min(95, ((point.latitude - HAMA_BOUNDS.minLatitude) / (HAMA_BOUNDS.maxLatitude - HAMA_BOUNDS.minLatitude)) * 100)),
  };
}

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
  return <Animated.View style={[styles.mouseRunner, { transform: [{ translateY: bounce }, { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-7deg", "7deg"] }) }] }]}><Image source={require("@/assets/images/icon.png")} style={styles.mouseIcon} /></Animated.View>;
}

function Marker({ point, label, kind }: { point: MapPoint; label: string; kind: "source" | "destination" | "driver" }) {
  const position = project(point);
  return <View pointerEvents="none" style={[styles.marker, styles[`marker_${kind}`], { left: `${position.left}%`, bottom: `${position.bottom}%` }]}>{kind === "driver" ? <RunningMouse /> : <Text style={styles.markerText}>{label}</Text>}</View>;
}

function Path({ points, live }: { points: MapPoint[]; live: boolean }) {
  if (points.length < 2) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{points.slice(1).map((point, index) => {
    const from = project(points[index]);
    const to = project(point);
    const x = to.left - from.left;
    const y = to.bottom - from.bottom;
    const length = Math.hypot(x, y);
    const angle = -Math.atan2(y, x) * 180 / Math.PI;
    return <View key={`${index}-${point.latitude}-${point.longitude}`} style={[styles.pathSegment, live ? styles.pathSegmentLive : styles.pathSegmentPlan, { left: `${from.left}%`, bottom: `${from.bottom}%`, width: `${length}%`, transform: [{ rotate: `${angle}deg` }] }]} />;
  })}</View>;
}

export function HamaMap({ compact = false, source, destination, driverLocation, routePath = [], actualPath = [], selecting, onSelect, onOutsideRange, readOnly = false }: HamaMapProps) {
  const [layout, setLayout] = useState({ width: 340, height: compact ? 188 : 220 });
  const select = (event: GestureResponderEvent) => {
    if (readOnly || !onSelect) return;
    const { locationX, locationY } = event.nativeEvent;
    const relativeX = Math.max(0, Math.min(1, locationX / Math.max(1, layout.width)));
    const relativeY = Math.max(0, Math.min(1, locationY / Math.max(1, layout.height)));
    const point = { latitude: HAMA_BOUNDS.maxLatitude - relativeY * (HAMA_BOUNDS.maxLatitude - HAMA_BOUNDS.minLatitude), longitude: HAMA_BOUNDS.minLongitude + relativeX * (HAMA_BOUNDS.maxLongitude - HAMA_BOUNDS.minLongitude) };
    if (point.latitude < HAMA_BOUNDS.minLatitude || point.latitude > HAMA_BOUNDS.maxLatitude || point.longitude < HAMA_BOUNDS.minLongitude || point.longitude > HAMA_BOUNDS.maxLongitude) return onOutsideRange?.();
    onSelect(point);
  };
  const captureLayout = (event: LayoutChangeEvent) => setLayout({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
  const visiblePath = actualPath.length > 1 ? actualPath : routePath;
  return (
    <Pressable onPress={select} onLayout={captureLayout} disabled={readOnly || !onSelect} style={[styles.map, compact && styles.mapCompact]}>
      <View style={[styles.road, { top: "42%", transform: [{ rotate: "-18deg" }] }]} />
      <View style={[styles.road, { top: "62%", transform: [{ rotate: "31deg" }] }]} />
      <Text style={styles.city}>حماة</Text>
      <Path points={visiblePath} live={actualPath.length > 1} />
      {source ? <Marker point={source} label="استلام" kind="source" /> : null}
      {destination ? <Marker point={destination} label="وجهة" kind="destination" /> : null}
      {driverLocation ? <Marker point={driverLocation} label="ج" kind="driver" /> : null}
      <View style={styles.badge}><Text style={styles.badgeText}>{actualPath.length > 1 ? "المسار الفعلي المباشر" : selecting ? `حدد ${selecting === "source" ? "الاستلام" : "الوجهة"}` : "حماة فقط"}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 23, overflow: "hidden", backgroundColor: "#D6D8D3", marginHorizontal: 16, marginTop: 16, position: "relative" },
  mapCompact: { height: 188 },
  road: { position: "absolute", height: 4, left: -30, right: -30, backgroundColor: "#FFFFFF", opacity: 0.75 },
  city: { position: "absolute", top: 18, left: 20, color: "#747474", fontSize: 18, fontWeight: "900" },
  pathSegment: { position: "absolute", height: 4, borderRadius: 3, transformOrigin: "left center" },
  pathSegmentPlan: { backgroundColor: "#6C8794", opacity: 0.52 },
  pathSegmentLive: { backgroundColor: "#EA580C", opacity: 0.94, height: 5 },
  marker: { position: "absolute", minWidth: 28, height: 28, paddingHorizontal: 6, borderRadius: 14, borderWidth: 2, borderColor: "#FFFFFF", justifyContent: "center", alignItems: "center", transform: [{ translateX: -14 }, { translateY: 14 }] },
  marker_source: { backgroundColor: "#536B78" },
  marker_destination: { backgroundColor: "#F97316" },
  marker_driver: { backgroundColor: "#252525", minWidth: 38, height: 38, borderRadius: 15, transform: [{ translateX: -19 }, { translateY: 19 }] },
  mouseRunner: { width: 31, height: 31, alignItems: "center", justifyContent: "center" },
  mouseIcon: { width: 31, height: 31, borderRadius: 11 },
  markerText: { color: "#FFFFFF", fontWeight: "900", fontSize: 10 },
  badge: { position: "absolute", bottom: 11, right: 11, backgroundColor: "#FFFFFFE8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { color: "#4A4A4A", fontSize: 11, fontWeight: "900" },
});
