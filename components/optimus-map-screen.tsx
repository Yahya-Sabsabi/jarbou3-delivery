import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HamaMap } from "@/components/hama-map-loader";
import type { MapPoint } from "@/shared/jarbou3";

export function OptimusMapScreen({
  source,
  destination,
  focusPoint,
  focusZoom,
  routePath,
  actualPath,
  selecting,
  onSelect,
  onOutsideRange,
  onLocate,
  locating,
  onProfile,
  children,
}: {
  source?: MapPoint | null;
  destination?: MapPoint | null;
  focusPoint?: MapPoint | null;
  focusZoom?: number;
  routePath?: MapPoint[];
  actualPath?: MapPoint[];
  selecting?: "source" | "destination";
  onSelect?: (point: MapPoint) => void;
  onOutsideRange?: () => void;
  onLocate: () => void;
  locating?: boolean;
  onProfile?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["24%", "52%", "82%"], []);

  return (
    <View style={styles.root}>
      <HamaMap
        source={source}
        destination={destination}
        routePath={routePath}
        actualPath={actualPath}
        selecting={selecting}
        onSelect={onSelect}
        onOutsideRange={onOutsideRange}
        focusPoint={focusPoint}
        focusZoom={focusZoom}
        fullScreen
        readOnly={!selecting}
      />
      <View pointerEvents="box-none" style={[styles.floatingLayer, { top: Math.max(insets.top + 12, 20), right: Math.max(insets.right + 12, 16) }]}>
        <Pressable accessibilityLabel="تحديد موقعي الحالي" onPress={onLocate} style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]} hitSlop={6}>
          <MaterialIcons name={locating ? "gps-not-fixed" : "my-location"} size={23} color="#263238" />
        </Pressable>
        <Pressable accessibilityLabel="فتح الملف الشخصي" onPress={onProfile} style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]} hitSlop={6}>
          <MaterialIcons name="person-outline" size={24} color="#263238" />
        </Pressable>
      </View>
      {Platform.OS === "web" ? (
        <View style={[styles.webSheet, { paddingBottom: Math.max(insets.bottom + 40, 40) }]}>
          <View style={styles.handle} />
          <KeyboardAvoidingView behavior="height" style={styles.sheetKeyboardAvoiding}>
            {children}
          </KeyboardAvoidingView>
        </View>
      ) : (
        <BottomSheet ref={bottomSheetRef} index={1} snapPoints={snapPoints} enablePanDownToClose={false} backgroundStyle={styles.sheetBackground} handleIndicatorStyle={styles.sheetIndicator}>
          <BottomSheetView style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom + 40, 40) }]}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetKeyboardAvoiding}>
              {children}
            </KeyboardAvoidingView>
          </BottomSheetView>
        </BottomSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 520, backgroundColor: "#E7EBE8" },
  floatingLayer: { position: "absolute", gap: 10, alignItems: "center", zIndex: 20 },
  floatingButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFFF2", shadowColor: "#0B1F17", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  sheetBackground: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: "#10231B", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 16 },
  sheetIndicator: { backgroundColor: "#9BA8A2", width: 44 },
  sheetContent: { flex: 1, paddingHorizontal: 16, paddingTop: 2 },
  sheetKeyboardAvoiding: { flex: 1 },
  webSheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "72%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, shadowColor: "#10231B", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 16 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#9BA8A2", marginBottom: 8 },
});
