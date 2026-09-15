import { useCallback, useEffect, useRef } from "react";
import {
  Dimensions,
  findNodeHandle,
  Keyboard,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";
import type { PropsWithChildren, RefObject } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type ScrollTarget = { scrollTo: (options: { y: number; animated?: boolean }) => void };
type FocusHandler = (event: { nativeEvent: { target: number } }) => void;
type ScrollOffsetRef = { current: number };
type Timer = ReturnType<typeof setTimeout>;

const FocusView = View as unknown as React.ComponentType<
  React.ComponentProps<typeof View> & { onFocusCapture?: FocusHandler }
>;

/**
 * Keeps the currently focused input visible without adding a second keyboard
 * avoidance layer. The scroll position before the first focused field is kept
 * and restored when Android hides the keyboard.
 */
export function useKeyboardAwareFocus(
  scrollRef: RefObject<ScrollTarget | null>,
  scrollOffsetRef: ScrollOffsetRef,
): FocusHandler {
  const keyboardHeightRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const focusedTargetRef = useRef<number | null>(null);
  const originOffsetRef = useRef<number | null>(null);
  const restoreScheduledRef = useRef(false);
  const timersRef = useRef<Timer[]>([]);
  const revealRef = useRef<() => void>(() => undefined);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const revealFocusedInput = useCallback(() => {
    const target = focusedTargetRef.current;
    const scrollNode = findNodeHandle(scrollRef.current as unknown as React.Component<any, any>);
    if (!target || !scrollNode) return;

    const keyboardHeight = keyboardHeightRef.current || Keyboard.metrics?.()?.height || 0;
    const windowHeight = Dimensions.get("window").height;
    const screenHeight = Dimensions.get("screen").height;
    const resizedByKeyboard = keyboardHeight > 0 && screenHeight - windowHeight > keyboardHeight * 0.5;
    const visibleBottom = Math.max(
      0,
      (resizedByKeyboard ? windowHeight : windowHeight - keyboardHeight) - 24,
    );

    UIManager.measureInWindow(target, (_x, y, _width, height) => {
      const targetBottom = y + height;
      const currentOffset = scrollOffsetRef.current;
      const downDelta = targetBottom - visibleBottom;
      const upDelta = 24 - y;
      const nextOffset = downDelta > 0
        ? currentOffset + downDelta
        : upDelta > 0
          ? Math.max(0, currentOffset - upDelta)
          : null;

      if (nextOffset !== null) {
        scrollRef.current?.scrollTo({ y: nextOffset, animated: true });
      }
    });
  }, [scrollOffsetRef, scrollRef]);

  const scheduleReveal = useCallback(() => {
    requestAnimationFrame(() => revealRef.current());
    const timer = setTimeout(() => revealRef.current(), 140);
    timersRef.current.push(timer);
  }, []);

  const restoreOriginScroll = useCallback(() => {
    const originOffset = originOffsetRef.current;
    if (originOffset === null || restoreScheduledRef.current) return;

    restoreScheduledRef.current = true;
    const restore = () => {
      if (originOffsetRef.current === null) return;
      originOffsetRef.current = null;
      focusedTargetRef.current = null;
      restoreScheduledRef.current = false;
      scrollRef.current?.scrollTo({ y: originOffset, animated: true });
    };

    requestAnimationFrame(restore);
    const timer = setTimeout(restore, 140);
    timersRef.current.push(timer);
  }, [scrollRef]);

  useEffect(() => {
    revealRef.current = revealFocusedInput;
  }, [revealFocusedInput]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardVisibleRef.current = true;
      keyboardHeightRef.current = event.endCoordinates.height;
      scheduleReveal();
    });
    const changeFrame = Keyboard.addListener("keyboardDidChangeFrame", (event) => {
      keyboardVisibleRef.current = true;
      keyboardHeightRef.current = event.endCoordinates.height;
      scheduleReveal();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisibleRef.current = false;
      keyboardHeightRef.current = 0;
      restoreOriginScroll();
    });

    return () => {
      show.remove();
      changeFrame.remove();
      hide.remove();
      clearTimers();
    };
  }, [clearTimers, restoreOriginScroll, scheduleReveal]);

  return useCallback((event) => {
    const target = event.nativeEvent.target;
    if (!target) return;

    if (focusedTargetRef.current !== target) {
      focusedTargetRef.current = target;
      if (originOffsetRef.current === null) {
        originOffsetRef.current = scrollOffsetRef.current;
      }
      restoreScheduledRef.current = false;
    }

    scheduleReveal();
    if (keyboardVisibleRef.current) {
      const timer = setTimeout(() => revealRef.current(), 280);
      timersRef.current.push(timer);
    }
  }, [scheduleReveal, scrollOffsetRef]);
}

export function KeyboardAwareFocusView({
  children,
  scrollRef,
  scrollOffsetRef,
  style,
}: PropsWithChildren<{
  scrollRef: RefObject<ScrollTarget | null>;
  scrollOffsetRef: ScrollOffsetRef;
  style?: StyleProp<ViewStyle>;
}>) {
  const onFocusCapture = useKeyboardAwareFocus(scrollRef, scrollOffsetRef);
  return (
    <FocusView style={[styles.focusContainer, style]} onFocusCapture={onFocusCapture}>
      {children}
    </FocusView>
  );
}

export function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  ...props
}: PropsWithChildren<ScrollViewProps>) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const onFocusCapture = useKeyboardAwareFocus(scrollRef, scrollOffsetRef);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    props.onScroll?.(event);
  };

  return (
    <FocusView style={styles.root} onFocusCapture={onFocusCapture}>
      <ScrollView
        {...props}
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
        keyboardDismissMode={props.keyboardDismissMode ?? "on-drag"}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      >
        {children}
      </ScrollView>
    </FocusView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  focusContainer: { flex: 1 },
});
