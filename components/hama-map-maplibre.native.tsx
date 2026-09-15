import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, GeoJSONSource, Layer, Map, Marker, UserLocation, type MapRef } from "@maplibre/maplibre-react-native";

import type { HamaMapProps } from "@/components/hama-map-fallback";
import { HAMA_BOUNDS, HAMA_INITIAL_REGION, type MapPoint } from "@/shared/jarbou3";

const LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const HAMA_MAX_BOUNDS: [number, number, number, number] = [
  HAMA_BOUNDS.minLongitude,
  HAMA_BOUNDS.minLatitude,
  HAMA_BOUNDS.maxLongitude,
  HAMA_BOUNDS.maxLatitude,
];

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: any;
    properties: Record<string, string>;
  }>;
};

function pointFeature(point: MapPoint, kind: string): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: { kind },
    }],
  };
}

function pathFeature(points: MapPoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.length > 1 ? [{
      type: "Feature",
      geometry: { type: "LineString", coordinates: points.map((point) => [point.longitude, point.latitude]) },
      properties: {},
    }] : [],
  };
}

function MapMarker({ kind, label }: { kind: "source" | "destination" | "driver"; label: string }) {
  return (
    <View style={[styles.marker, kind === "source" ? styles.sourceMarker : kind === "destination" ? styles.destinationMarker : styles.driverMarker]}>
      <Text style={styles.markerLabel}>{label}</Text>
    </View>
  );
}

export function HamaMap({
  compact = false,
  source,
  destination,
  driverLocation,
  routePath = [],
  actualPath = [],
  selecting,
  onSelect,
  onOutsideRange,
  readOnly = false,
  focusPoint,
  focusZoom = 16,
  focusRequestId,
  fullScreen = false,
  onLocate,
}: HamaMapProps & { onLocate?: () => void }) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const lastFocusRequest = useRef<number | undefined>(undefined);
  const visiblePath = actualPath.length > 1 ? actualPath : routePath;
  const initialPoint = focusPoint ?? source ?? destination ?? { latitude: HAMA_INITIAL_REGION.latitude, longitude: HAMA_INITIAL_REGION.longitude };

  const markerData = useMemo(() => ({
    source: source ? pointFeature(source, "source") : null,
    destination: destination ? pointFeature(destination, "destination") : null,
    driver: driverLocation ? pointFeature(driverLocation, "driver") : null,
  }), [source, destination, driverLocation]);
  const pathData = useMemo(() => pathFeature(visiblePath), [visiblePath]);

  useEffect(() => {
    if (focusRequestId === undefined || focusRequestId === lastFocusRequest.current || !focusPoint) return;
    lastFocusRequest.current = focusRequestId;
    cameraRef.current?.flyTo({ center: [focusPoint.longitude, focusPoint.latitude], zoom: focusZoom, duration: 900, easing: "fly" });
  }, [focusPoint, focusRequestId, focusZoom]);

  const syncCenter = async () => {
    if (readOnly || !selecting || !onSelect || !mapRef.current) return;
    try {
      const [longitude, latitude] = await mapRef.current.getCenter();
      const point = { latitude, longitude };
      const inHama = latitude >= HAMA_BOUNDS.minLatitude && latitude <= HAMA_BOUNDS.maxLatitude && longitude >= HAMA_BOUNDS.minLongitude && longitude <= HAMA_BOUNDS.maxLongitude;
      if (inHama) onSelect(point);
      else onOutsideRange?.();
    } catch (error) {
      console.warn("[hama-map] unable to read map center", error);
    }
  };

  return (
    <View style={[styles.container, compact && styles.compact, fullScreen && styles.fullScreen]} testID="hama-map-maplibre">
      <Map
        key={retryNonce}
        ref={mapRef}
        mapStyle={LIBERTY_STYLE}
        style={StyleSheet.absoluteFill}
        androidView="surface"
        dragPan
        touchZoom
        doubleTapZoom
        touchRotate={false}
        touchPitch={false}
        attribution
        attributionPosition={{ bottom: 44, right: 10 }}
        logo={false}
        compass
        compassPosition={{ top: 18, right: 16 }}
        onDidFinishLoadingMap={() => setMapState("ready")}
        onDidFailLoadingMap={() => setMapState("error")}
        onRegionDidChange={syncCenter}
        testID="optimus-maplibre-map"
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [initialPoint.longitude, initialPoint.latitude], zoom: compact ? 13.5 : 15.2 }}
          minZoom={11}
          maxZoom={19}
          maxBounds={HAMA_MAX_BOUNDS}
        />
        <UserLocation />
        {markerData.source ? <GeoJSONSource id="source-marker" data={markerData.source}><Layer id="source-marker-layer" type="circle" source="source-marker" paint={{ "circle-radius": 9, "circle-color": "#536B78", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3 }} /></GeoJSONSource> : null}
        {markerData.destination ? <GeoJSONSource id="destination-marker" data={markerData.destination}><Layer id="destination-marker-layer" type="circle" source="destination-marker" paint={{ "circle-radius": 9, "circle-color": "#2F7A62", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3 }} /></GeoJSONSource> : null}
        {markerData.driver ? <GeoJSONSource id="driver-marker" data={markerData.driver}><Layer id="driver-marker-layer" type="circle" source="driver-marker" paint={{ "circle-radius": 11, "circle-color": "#252525", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3 }} /></GeoJSONSource> : null}
        {pathData.features.length > 0 ? <GeoJSONSource id="route-path" data={pathData}><Layer id="route-path-layer" type="line" source="route-path" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": actualPath.length > 1 ? "#24755E" : "#6C8794", "line-width": actualPath.length > 1 ? 5 : 4, "line-opacity": actualPath.length > 1 ? 0.95 : 0.62 }} /></GeoJSONSource> : null}
        {source && !readOnly ? <Marker lngLat={[source.longitude, source.latitude]} anchor="bottom"><MapMarker kind="source" label="استلام" /></Marker> : null}
        {destination && !readOnly ? <Marker lngLat={[destination.longitude, destination.latitude]} anchor="bottom"><MapMarker kind="destination" label="وجهة" /></Marker> : null}
        {driverLocation ? <Marker lngLat={[driverLocation.longitude, driverLocation.latitude]} anchor="bottom"><MapMarker kind="driver" label="س" /></Marker> : null}
      </Map>

      <View pointerEvents="none" style={styles.attribution}><Text style={styles.attributionText}>© OpenFreeMap · © OpenMapTiles · © OpenStreetMap</Text></View>
      {onLocate ? <Pressable accessibilityLabel="موقعي الحالي" onPress={onLocate} style={styles.locateButton}><Text style={styles.locateIcon}>⌖</Text></Pressable> : null}
      {mapState === "loading" ? <View style={styles.overlay}><ActivityIndicator size="small" color="#24755E" /><Text style={styles.overlayText}>جارٍ تحميل الخريطة…</Text></View> : null}
      {mapState === "error" ? <View style={styles.overlay}><Text style={styles.errorTitle}>تعذر تحميل الخريطة</Text><Text style={styles.errorText}>تحقق من الاتصال ثم أعد المحاولة.</Text><Pressable onPress={() => { setMapState("loading"); setRetryNonce((value) => value + 1); }} style={styles.retry}><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, minHeight: 220, marginHorizontal: 16, marginTop: 16, borderRadius: 23, overflow: "hidden", backgroundColor: "#E8ECE8" },
  compact: { height: 188 },
  fullScreen: { flex: 1, width: "100%", height: "100%", minHeight: 300, marginHorizontal: 0, marginTop: 0, borderRadius: 0 },
  marker: { minWidth: 34, height: 34, paddingHorizontal: 7, borderRadius: 17, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  sourceMarker: { backgroundColor: "#536B78" },
  destinationMarker: { backgroundColor: "#2F7A62" },
  driverMarker: { backgroundColor: "#252525", minWidth: 40, height: 40, borderRadius: 20 },
  markerLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  attribution: { position: "absolute", right: 9, bottom: 10, backgroundColor: "#FFFFFFD9", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  attributionText: { color: "#44514A", fontSize: 9, fontWeight: "600" },
  locateButton: { position: "absolute", right: 16, bottom: 52, width: 46, height: 46, borderRadius: 23, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 6, elevation: 5 },
  locateIcon: { color: "#24755E", fontSize: 27, fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#E8ECE8E8", gap: 8 },
  overlayText: { color: "#52645B", fontSize: 13, fontWeight: "700" },
  errorTitle: { color: "#24342D", fontSize: 15, fontWeight: "800" },
  errorText: { color: "#5E7067", fontSize: 12 },
  retry: { marginTop: 5, borderRadius: 18, backgroundColor: "#24755E", paddingHorizontal: 16, paddingVertical: 9 },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
