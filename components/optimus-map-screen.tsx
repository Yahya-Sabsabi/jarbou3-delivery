import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HamaMap } from "@/components/hama-map-loader";
import { KeyboardAwareFocusView } from "@/components/keyboard-aware";
import type { MapPoint } from "@/shared/jarbou3";

export function OptimusMapScreen({
  source,
  destination,
  focusPoint,
  focusZoom,
  focusRequestId,
  routePath,
  actualPath,
  selecting,
  onSelect,
  onOutsideRange,
  onLocate,
  locating,
  onProfile,
  onHome,
  onMore,
  moreMenu,
  children,
}: {
  source?: MapPoint | null;
  destination?: MapPoint | null;
  focusPoint?: MapPoint | null;
  focusZoom?: number;
  focusRequestId?: number;
  routePath?: MapPoint[];
  actualPath?: MapPoint[];
  selecting?: "source" | "destination";
  onSelect?: (point: MapPoint) => void;
  onOutsideRange?: () => void;
  onLocate: () => void;
  locating?: boolean;
  onProfile?: () => void;
  onHome?: () => void;
  onMore?: () => void;
  moreMenu?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const webScrollRef = useRef<ScrollView>(null);
  const nativeScrollRef = useRef<ScrollView>(null);
  const webScrollOffsetRef = useRef(0);
  const nativeScrollOffsetRef = useRef(0);
  const snapPoints = useMemo(() => ["24%", "56%", "84%"], []);
  const [sheetIndex, setSheetIndex] = useState(0);
  const centerPinVisible = Boolean(selecting) && sheetIndex < snapPoints.length - 1;

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
        focusRequestId={focusRequestId}
        fullScreen
        readOnly={!selecting}
      />
      {centerPinVisible ? <View pointerEvents="none" testID="center-selection-pin" style={styles.centerMarker}><View style={styles.centerMarkerPin}><View style={styles.centerMarkerDot} /></View></View> : null}
      <View pointerEvents="box-none" style={[styles.topActions, { top: Math.max(insets.top + 12, 18), left: Math.max(insets.left + 14, 16), right: Math.max(insets.right + 14, 16) }]}>
        <View style={styles.topActionsGroup}>
          {onHome ? <Pressable accessibilityLabel="العودة إلى الرئيسية" onPress={onHome} style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]} hitSlop={6}><MaterialIcons name="home-filled" size={22} color="#263238" /></Pressable> : null}
          {onMore ? <Pressable accessibilityLabel="المزيد من الخيارات" onPress={onMore} style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]} hitSlop={6}><MaterialIcons name="more-vert" size={24} color="#263238" /></Pressable> : null}
        </View>
        <View style={styles.topActionsGroup}>
          <Pressable accessibilityLabel="تحديد موقعي الحالي" onPress={onLocate} style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]} hitSlop={6}>
            <MaterialIcons name={locating ? "gps-not-fixed" : "my-location"} size={23} color="#263238" />
          </Pressable>
          <Pressable accessibilityLabel="فتح الملف الشخصي" onPress={onProfile} style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]} hitSlop={6}>
            <MaterialIcons name="person-outline" size={24} color="#263238" />
          </Pressable>
        </View>
      </View>
      {moreMenu}
      {Platform.OS === "web" ? (
        <View style={[styles.webSheet, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
          <KeyboardAwareFocusView scrollRef={webScrollRef} scrollOffsetRef={webScrollOffsetRef} style={styles.sheetKeyboardAvoiding}>
            <ScrollView
              ref={webScrollRef}
              onScroll={(event) => { webScrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 220, 220) }]}
            >
              <View style={styles.handle} />
              {children}
            </ScrollView>
          </KeyboardAwareFocusView>
        </View>
      ) : (
        <BottomSheet ref={bottomSheetRef} index={0} snapPoints={snapPoints} onChange={setSheetIndex} enablePanDownToClose={false} backgroundStyle={styles.sheetBackground} handleIndicatorStyle={styles.sheetIndicator}>
          <KeyboardAwareFocusView scrollRef={nativeScrollRef} scrollOffsetRef={nativeScrollOffsetRef} style={styles.sheetKeyboardAvoiding}>
            <BottomSheetScrollView
              ref={nativeScrollRef}
              onScroll={(event) => { nativeScrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.sheetContent, styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 220, 220) }]}
            >
              {children}
            </BottomSheetScrollView>
          </KeyboardAwareFocusView>
        </BottomSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: "hidden", position: "relative", backgroundColor: "#E7EBE8" },
  centerMarker: { position: "absolute", top: "50%", left: "50%", width: 44, height: 58, marginLeft: -22, marginTop: -53, zIndex: 10, alignItems: "center", justifyContent: "flex-start" },
  centerMarkerPin: { width: 34, height: 34, marginTop: 1, borderRadius: 19, borderBottomRightRadius: 5, backgroundColor: "#24755E", borderWidth: 3, borderColor: "#FFFFFF", transform: [{ rotate: "45deg" }], shadowColor: "#000000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  centerMarkerDot: { width: 10, height: 10, marginTop: 9, marginLeft: 9, borderRadius: 5, backgroundColor: "#FFFFFF", transform: [{ rotate: "-45deg" }] },
  topActions: { position: "absolute", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", zIndex: 30 },
  topActionsGroup: { flexDirection: "row", gap: 8 },
  floatingLayer: { position: "absolute", gap: 10, alignItems: "center", zIndex: 20 },
  floatingButton: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFFF2", shadowColor: "#0B1F17", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  sheetBackground: { backgroundColor: "#FCFDFC", borderTopLeftRadius: 30, borderTopRightRadius: 30, shadowColor: "#10231B", shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 14 },
  sheetIndicator: { backgroundColor: "#83958D", width: 38, height: 4, borderRadius: 4, marginTop: 3 },
  sheetContent: { paddingHorizontal: 18, paddingTop: 2 },
  scrollContent: { paddingBottom: 220 },
  sheetKeyboardAvoiding: { flex: 1 },
  webSheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "72%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, shadowColor: "#10231B", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 16 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#9BA8A2", marginBottom: 8 },
});
