import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { HamaMap as FallbackHamaMap, type HamaMapProps } from "@/components/hama-map-fallback";

type LoadedMap = typeof FallbackHamaMap;

/**
 * لا تُحمّل react-native-maps قبل احتياج الخريطة فعلياً. يحمي ذلك شاشة الإقلاع
 * من فشل مكتبة أصلية ثقيلة، مع إبقاء خريطة بديلة تتيح متابعة الرحلة عند تعذرها.
 */
export function HamaMap(props: HamaMapProps) {
  const [MapComponent, setMapComponent] = useState<LoadedMap | null>(null);
  const [failedToLoad, setFailedToLoad] = useState(false);

  useEffect(() => {
    let active = true;
    import("@/components/hama-map")
      .then((module) => {
        if (active) setMapComponent(() => module.HamaMap);
      })
      .catch(() => {
        if (active) setFailedToLoad(true);
      });
    return () => { active = false; };
  }, []);

  if (failedToLoad) return <FallbackHamaMap {...props} />;
  if (!MapComponent) return <View style={[styles.loading, props.compact && styles.compact]}><ActivityIndicator size="small" color="#4A4A4A" /></View>;
  return <MapComponent {...props} />;
}

const styles = StyleSheet.create({
  loading: { height: 220, marginHorizontal: 16, marginTop: 16, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#E6E7E4" },
  compact: { height: 188 },
});
