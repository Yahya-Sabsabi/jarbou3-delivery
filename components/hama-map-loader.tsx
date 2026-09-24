import { Component, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

import type { HamaMapProps } from "@/components/hama-map-fallback";

type LoadedMap = (props: HamaMapProps) => ReactNode;
type MapBoundaryProps = { children: ReactNode; fallback: ReactNode };
type MapBoundaryState = { hasError: boolean };

class MapBoundary extends Component<MapBoundaryProps, MapBoundaryState> {
  state: MapBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[hama-map] render failed", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function MapStatus({ fullScreen, failed }: { fullScreen?: boolean; failed?: boolean }) {
  return (
    <View style={[styles.status, fullScreen && styles.fullScreen]}>
      {failed ? <Text style={styles.statusTitle}>تعذر تحميل الخريطة</Text> : <ActivityIndicator size="small" color="#EA580C" />}
      {failed ? <Text style={styles.statusCopy}>تحقق من اتصال الإنترنت ثم أعد فتح شاشة الخريطة.</Text> : null}
    </View>
  );
}

/** Native devices use MapLibre Native; web keeps the existing browser map implementation. */
export function HamaMap(props: HamaMapProps) {
  const [MapComponent, setMapComponent] = useState<LoadedMap | null>(null);
  const [failedToLoad, setFailedToLoad] = useState(false);

  useEffect(() => {
    let active = true;
    const modulePromise = Platform.OS === "web"
      ? import("@/components/hama-map-open")
      : import("@/components/hama-map-maplibre.native");
    modulePromise
      .then((module) => {
        if (active) setMapComponent(() => module.HamaMap as LoadedMap);
      })
      .catch((error) => {
        console.warn("[hama-map] native map failed to load", error);
        if (active) setFailedToLoad(true);
      });
    return () => { active = false; };
  }, []);

  if (!MapComponent) return <MapStatus fullScreen={props.fullScreen} failed={failedToLoad} />;
  return (
    <MapBoundary fallback={<MapStatus fullScreen={props.fullScreen} failed />}>
      <MapComponent {...props} />
    </MapBoundary>
  );
}

const styles = StyleSheet.create({
  status: { height: 220, minHeight: 220, marginHorizontal: 16, marginTop: 16, borderRadius: 23, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F0F4F0", padding: 20 },
  fullScreen: { flex: 1, width: "100%", height: "100%", minHeight: 300, marginHorizontal: 0, marginTop: 0, borderRadius: 0 },
  statusTitle: { color: "#431407", fontSize: 15, fontWeight: "800", textAlign: "center" },
  statusCopy: { color: "#78716C", fontSize: 12, textAlign: "center" },
});

export { MapBoundary };
