import { useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

const TRACK_WIDTH = 320;
const KNOB_SIZE = 48;
const MAX_TRAVEL = TRACK_WIDTH - KNOB_SIZE - 10;
const TRIGGER_DISTANCE = MAX_TRAVEL * 0.72;

export function SwipeStartButton({ disabled, onComplete }: { disabled?: boolean; onComplete: () => void }) {
  const offset = useRef(new Animated.Value(0)).current;
  const completed = useRef(false);
  const reset = () => Animated.spring(offset, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
  const finish = () => {
    if (disabled || completed.current) return;
    completed.current = true;
    Animated.timing(offset, { toValue: MAX_TRAVEL, duration: 160, useNativeDriver: true }).start(() => {
      completed.current = false;
      onComplete();
      reset();
    });
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_event, gesture) => !disabled && Math.abs(gesture.dx) > 4,
    onPanResponderMove: (_event, gesture) => {
      if (disabled) return;
      // RTL-friendly visual: the knob travels toward the left as the user swipes left.
      offset.setValue(Math.max(0, Math.min(MAX_TRAVEL, -gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (-gesture.dx >= TRIGGER_DISTANCE) finish();
      else reset();
    },
    onPanResponderTerminate: reset,
  })).current;

  return (
    <Pressable disabled={disabled} onPress={finish} style={[styles.track, disabled && styles.disabled]} {...responder.panHandlers}>
      <Text style={styles.label}>{disabled ? "انتظر وصول موقع GPS…" : "اسحب لبدء الرحلة"}</Text>
      <Animated.View style={[styles.knob, { transform: [{ translateX: Animated.multiply(offset, -1) }] }]}>
        <Text style={styles.arrow}>‹</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { minHeight: 58, marginHorizontal: 16, marginTop: 12, borderRadius: 18, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FDBA74", justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" },
  disabled: { opacity: 0.55 },
  label: { color: "#C2410C", fontSize: 13, fontWeight: "900" },
  knob: { position: "absolute", right: 5, width: KNOB_SIZE, height: KNOB_SIZE, borderRadius: 15, backgroundColor: "#F97316", alignItems: "center", justifyContent: "center" },
  arrow: { color: "#FFFFFF", fontSize: 31, lineHeight: 34, fontWeight: "900" },
});
